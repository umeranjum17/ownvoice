import Native, { type ModelStatus } from '../../modules/ownvoice-native';
import { errorCode, message } from '../core/nano';
import { agreed, getReady, modelStatus, settle, watch } from '../core/phoneDownload';
import { words } from '../core/words';
import { acceptReplies, avoidLine, latestMessage, phoneReplyPrompt, phoneSlotPrompt, rebuildLines, REPLY_SLOTS, replyLabels, versionAcceptor } from '../core/drafts';
import { lineRetryPrompt, rewrite, versionsList } from '../core/judge';
import type { Choice, DraftRequest, Writer, WriterEvents } from '../core/writers';

// Drafts on the phone (spec 5): replies fill three fixed slots from one numbered call,
// then one retry per empty slot; polish runs the C2 rewrite through the phone model.
// `ponytail: if the phone model returns fewer than 2 distinct drafts from the numbered call
// in at least half of the real-phone chats (spec §6 P3), switch to three slot calls from the start.

const FILL_MS = 8000;

let calls = 0;
async function ask(prompt: string, maxTokens: number): Promise<string> {
  return Native.ask(`phone-${Date.now()}-${calls++}`, prompt, { maxTokens });
}

/** Polish and compose: the C2 rewrite, streamed as versions land, with layout kept and near-duplicates dropped. */
async function polish(request: DraftRequest, on: WriterEvents): Promise<Choice> {
  const dashes = request.dashes ?? 'remove';
  const avoid = request.avoid ?? [];
  const note = avoidLine(avoid);
  const engine = { ask: (prompt: string, maxTokens: number) => ask(prompt + (note ? `\n\n${note}` : ''), maxTokens) };
  const landed = on.landed ?? (() => {});
  const acceptor = versionAcceptor(request.typed, dashes, avoid);
  await rewrite(engine, request.typed, request.conversation, request.guide ?? '', (version, text) => {
    const slot = versionsList.findIndex(v => v.name === version.name);
    const clean = acceptor.accept(text, slot, version.label);
    if (clean != null) landed(clean, slot, version.label);
  }, dashes, request.platform);
  // A flattened list goes back row by row; the rebuild keeps the original markers, so the
  // layout is kept by construction - only a missing row or a changed number/time drops it.
  for (const fail of acceptor.layoutFails) {
    const prompt = lineRetryPrompt(request.typed, request.conversation, versionsList[fail.slot], request.guide ?? '', dashes, request.platform) + (note ? `\n\n${note}` : '');
    let rebuilt: string | null;
    try {
      rebuilt = rebuildLines(request.typed, await engine.ask(prompt, 256));
    } catch { continue; }
    if (rebuilt == null) continue;
    const fixed = acceptor.fix(rebuilt, fail.slot, fail.label);
    if (fixed != null) landed(fixed, fail.slot, fail.label);
  }
  return { drafts: acceptor.results.sort((a, b) => a.slot - b.slot).map(r => r.text), unchanged: acceptor.unchanged };
}

/** Replies: one numbered call, then one retry per empty slot within 8 s of its answer. */
async function replies(request: DraftRequest, on: WriterEvents, started: number): Promise<string[]> {
  const dashes = request.dashes ?? 'remove';
  const input = { latest: latestMessage(request.nodes, request.fieldTop), conversation: request.conversation, guide: request.guide, platform: request.platform };
  const landed = on.landed ?? (() => {});
  const exclude = [...request.avoid ?? []];
  const controls = request.nodes?.filter(node => node.clickable).map(node => node.text) ?? [];
  const made: (string | null)[] = [null, null, null];
  let partial = '';
  const id = `reply-${Date.now()}-${calls++}`;
  const take = (source: string, complete: boolean) => {
    const markers = [...source.matchAll(replyLabels)];
    const closed = complete ? source : source.slice(0, markers.at(-1)?.index ?? 0);
    if (!closed.trim()) return;
    acceptReplies([closed], exclude, 3, dashes, controls).forEach((text, slot) => {
      if (!text || made[slot]) return;
      made[slot] = text; exclude.push(text); landed(text, slot);
      if (exclude.length === (request.avoid?.length ?? 0) + 1) console.log(`Ownvoice first draft ms=${Date.now() - started}`);
    });
  };
  const subscription = Native.addListener('onModelPartial', event => {
    if (event.id === id) { partial += event.text; take(partial, false); }
  });
  try {
    const answer = await Native.draftStream(id, phoneReplyPrompt(input), 220);
    take(answer, true);
  } finally { subscription.remove(); }
  const fillStarted = Date.now();
  for (let slot = 0; slot < REPLY_SLOTS.length && Date.now() - fillStarted <= FILL_MS; slot++) {
    if (made[slot]) continue;
    try {
      const [draft] = acceptReplies([await ask(phoneSlotPrompt(REPLY_SLOTS[slot], input, exclude), 120)], exclude, 1, dashes, controls);
      if (draft) { exclude.push(draft); made[slot] = draft; landed(draft, slot); }
    } catch { /* one retry per slot; a failure leaves the slot empty */ }
  }
  return made.filter((text): text is string => !!text);
}

export const phoneWriter = {
  async write(request: DraftRequest, on: WriterEvents = {}): Promise<Choice> {
    if (process.env.EXPO_PUBLIC_E2E_STUB === '1') {
      // A typed 'Quick update' comes back as it was, through the real acceptor: the already-minimal case.
      if (request.typed.startsWith('Quick update')) {
        const acceptor = versionAcceptor(request.typed, 'remove', []);
        versionsList.forEach((version, slot) => acceptor.accept(request.typed, slot, version.label));
        return { drafts: [], unchanged: acceptor.unchanged };
      }
      // 'stock' in the typed text picks one deliberately stockier draft, so the e2e can show
      // the verdict line (cards differ) as well as the hidden shared note (cards agree).
      const drafts = request.typed.includes('stock')
        ? ['Yes, still on.', 'Saturday works.', "Let's delve in; at the end of the day, moving forward."]
        : ['Yes, still on! I\'ll bring the stove.', 'Sure, Saturday works. See you then.', 'Should be. What time were you thinking?'];
      drafts.forEach((text, slot) => on.landed?.(text, slot));
      return { drafts };
    }
    let status: ModelStatus;
    try { status = await modelStatus(); } catch (error) { throw new Error(message(errorCode(error))); }
    if (status === 'unavailable') throw new Error(words.unsupported);
    // The one-time download needs the person's yes, which only Ownvoice itself asks for.
    if (status === 'downloadable' && !agreed()) throw new Error(words.readyPanel);
    try {
      const started = Date.now();
      if (status !== 'available') {
        on.state?.('downloading');
        const stop = watch(fraction => { if (fraction != null) on.fraction?.(fraction); });
        try { await (status === 'downloadable' ? getReady() : settle()); } finally { stop(); }
      }
      on.state?.('writing');
      return request.typed.trim()
        ? await polish(request, on)
        : { drafts: await replies(request, on, started) };
    } catch (error) {
      throw new Error(message(errorCode(error)));
    }
  },
} satisfies Writer;

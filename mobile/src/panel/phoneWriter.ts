import Native from '../../modules/ownvoice-native';
import { errorCode, message } from '../core/nano';
import { acceptReplies, avoidLine, latestMessage, phoneReplyPrompt, phoneSlotPrompt, rebuildLines, REPLY_SLOTS, replyLabels, versionAcceptor } from '../core/drafts';
import { lineRetryPrompt, rewrite, versionsList, type RewriteEngine } from '../core/judge';
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

/** Polish and compose: the C2 rewrite, streamed as versions land, with layout kept and near-duplicates dropped.
 *  `script` replaces the phone model (e2e builds only): a flattening answer, then a row-by-row rescue. */
async function polish(request: DraftRequest, on: WriterEvents, script?: RewriteEngine): Promise<string[]> {
  const dashes = request.dashes ?? 'remove';
  const avoid = request.avoid ?? [];
  const note = avoidLine(avoid);
  const engine: RewriteEngine = script ?? { ask: (prompt: string, maxTokens: number) => ask(prompt + (note ? `\n\n${note}` : ''), maxTokens) };
  const landed = on.landed ?? (() => {});
  const acceptor = versionAcceptor(request.typed, dashes, avoid);
  await rewrite(engine, request.typed, request.conversation, request.guide ?? '', (version, text) => {
    const slot = versionsList.findIndex(v => v.name === version.name);
    const clean = acceptor.accept(text, slot, version.label);
    if (clean != null) landed(clean, slot, version.label);
  }, dashes);
  // A layout-failed slot goes back once, row by row; rebuildLines re-applies the original
  // markers and blank lines, so a flattened or renumbered list still lands (spec 5.2).
  for (const fail of acceptor.layoutFails) {
    try {
      const rebuilt = rebuildLines(request.typed, await engine.ask(lineRetryPrompt(request.typed, request.conversation, versionsList[fail.slot], request.guide ?? '', dashes), 256));
      const fixed = rebuilt != null ? acceptor.fix(rebuilt, fail.slot, fail.label) : null;
      if (fixed != null) landed(fixed, fail.slot, fail.label);
    } catch { continue; }
  }
  return acceptor.results.sort((a, b) => a.slot - b.slot).map(r => r.text);
}

/** Replies: one numbered call, then one retry per empty slot within 8 s of its answer. */
async function replies(request: DraftRequest, on: WriterEvents, started: number): Promise<string[]> {
  const dashes = request.dashes ?? 'remove';
  const input = { latest: latestMessage(request.nodes, request.fieldTop), conversation: request.conversation, guide: request.guide };
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
      // The emulator has no phone model; a multi-line note still runs the real polish pipeline
      // against a scripted model that flattens first and rescues row by row, so the sheet
      // exercises acceptance and the layout rescue end to end. Never in a distributable build.
      if (request.typed.includes('\n')) {
        const script: RewriteEngine = { ask: async prompt => {
          const rows = [...prompt.matchAll(/^Row \d+: (.+)$/gm)].map(match => match[1].trim());
          if (!rows.length) {
            const tail = prompt.slice(prompt.indexOf('Their text:\n') + 12);
            const flat = tail.slice(0, tail.indexOf('\n\nTheir rules') < 0 ? undefined : tail.indexOf('\n\nTheir rules')).split('\n').join(', ');
            // A rewording too: a pure line-join normalizes equal to the original and would never queue the rescue.
            return JSON.stringify({ versions: [`Plan: ${flat}`] });
          }
          const body = (line: string) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, '');
          if (prompt.includes('Tighter:')) return rows.map((line, i) => `Row ${i + 1}: ${i ? body(line).split(' ').slice(0, 3).join(' ') : line}`).join('\n');
          if (prompt.includes('put the answer first')) return rows.map((line, i) => `Row ${i + 1}: ${i ? body(rows[i - 1]) : body(rows.at(-1)!)}`).join('\n');
          return rows.map((line, i) => `Row ${i + 1}: ${line}`).join('\n');
        } };
        return { drafts: await polish(request, on, script) };
      }
      // 'stock' in the typed text picks one deliberately stockier draft, so the e2e can show
      // the verdict line (cards differ) as well as the hidden shared note (cards agree).
      const drafts = request.typed.includes('stock')
        ? ['Yes, still on.', 'Saturday works.', "Let's delve in; at the end of the day, moving forward."]
        : ['Yes, still on! I\'ll bring the stove.', 'Sure, Saturday works. See you then.', 'Should be. What time were you thinking?'];
      drafts.forEach((text, slot) => on.landed?.(text, slot));
      return { drafts };
    }
    try {
      const started = Date.now();
      if (await Native.modelStatus() !== 'available') {
        on.state?.('downloading');
        await Native.downloadModel();
      }
      on.state?.('writing');
      const drafts = request.typed.trim()
        ? await polish(request, on)
        : await replies(request, on, started);
      return { drafts };
    } catch (error) {
      throw new Error(message(errorCode(error)));
    }
  },
} satisfies Writer;

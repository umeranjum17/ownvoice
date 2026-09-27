import Native from '../../modules/ownvoice-native';
import { errorCode, message } from '../core/nano';
import { acceptReplies, avoidLine, cleanDrafts, latestMessage, phoneReplyPrompt, phoneSlotPrompt, REPLY_SLOTS, versionAcceptor } from '../core/drafts';
import { rewrite, versionPrompt, versionsList } from '../core/judge';
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
async function polish(request: DraftRequest, on: WriterEvents): Promise<string[]> {
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
  }, dashes);
  // A flattened list goes back through its slot once; still flat means dropped (spec 5.2).
  for (const fail of acceptor.layoutFails) {
    const lines = request.typed.split('\n');
    const prompt = versionPrompt(request.typed, request.conversation, versionsList[fail.slot], request.guide ?? '', dashes)
      + `\nKeep exactly ${lines.length} lines in this order, including blank lines. Keep these line prefixes exactly: ${lines.map((line, i) => `${i + 1}: ${line.match(/^\s*(?:\d+[.)]|[-*•])\s+/)?.[0] ?? '(none)'}`).join('; ')}. Do not combine lines.` + (note ? `\n\n${note}` : '');
    let again = '';
    try { again = await engine.ask(prompt, 256); } catch { /* use the line-by-line fallback */ }
    let fixed = acceptor.fix(again, fail.slot, fail.label);
    if (fixed == null) {
      // The model can flatten a list twice; rewrite each line, restoring its exact marker.
      const rewritten: string[] = [];
      for (const line of lines) {
        if (!line.trim()) { rewritten.push(line); continue; }
        const marker = line.match(/^(\s*(?:\d+[.)]|[-*•])\s+)(.*)$/);
        const body = marker?.[2] ?? line;
        try {
          const result = await engine.ask(`Rewrite this one line briefly, keeping its meaning. Output only its words, without a list marker or extra lines:\n${body}`, 80);
          const line = result.trim().replace(/^(?:\d+[.)]|[-*•])\s+/, '').split(/\r?\n/)[0];
          const words = cleanDrafts([line], 1)[0] || body;
          rewritten.push((marker?.[1] ?? '') + words);
        } catch { rewritten.push(line); }
      }
      fixed = acceptor.fix(rewritten.join('\n'), fail.slot, fail.label);
    }
    if (fixed != null) landed(fixed, fail.slot, fail.label);
  }
  return acceptor.results.sort((a, b) => a.slot - b.slot).map(r => r.text);
}

/** Replies: one numbered call, then one retry per empty slot, until 8 s have passed since the tap. */
async function replies(request: DraftRequest, on: WriterEvents, started: number): Promise<string[]> {
  const dashes = request.dashes ?? 'remove';
  const input = { latest: latestMessage(request.nodes, request.fieldTop), conversation: request.conversation, guide: request.guide };
  const landed = on.landed ?? (() => {});
  const exclude = [...request.avoid ?? []];
  const controls = request.nodes?.filter(node => node.clickable).map(node => node.text) ?? [];
  if (request.app === 'dev.ownvoice.next') controls.push('Skip');
  const made: (string | null)[] = [null, null, null];
  let partial = '';
  const id = `reply-${Date.now()}-${calls++}`;
  const take = (source: string, complete: boolean) => {
    // A slot is safe to show only once the next label (or the response end) closes it.
    const markers = [...source.matchAll(/(?:^|\n)Draft ([1-3]):[ \t]*/g)];
    const upto = complete ? markers.length : Math.max(0, markers.length - 1);
    const last = markers.at(-1);
    const lastSlot = last ? Number(last[1]) - 1 : -1;
    const tail = complete && lastSlot < 2 && last
      ? source.slice(last.index! + last[0].length).split(/\r?\n/) : [];
    const splitTail = markers.length === 1 && lastSlot === 0 && tail.length === 3;
    for (let i = 0; i < upto; i++) {
      const slot = Number(markers[i][1]) - 1;
      if (slot < 0 || slot > 2 || made[slot]) continue;
      const body = source.slice(markers[i].index! + markers[i][0].length, markers[i + 1]?.index ?? source.length);
      const [text] = acceptReplies([splitTail && i === upto - 1 ? tail[0] : body], exclude, 1, dashes, controls);
      if (text) {
        made[slot] = text; exclude.push(text); landed(text, slot);
        if (exclude.length === (request.avoid?.length ?? 0) + 1) console.log(`Ownvoice first draft ms=${Date.now() - started}`);
      }
    }
    if (splitTail) tail.slice(1).forEach((line, i) => {
      const slot = lastSlot + i + 1;
      if (slot > 2 || made[slot]) return;
      const [text] = acceptReplies([line], exclude, 1, dashes, controls);
      if (text) { made[slot] = text; exclude.push(text); landed(text, slot); }
    });
  };
  const subscription = Native.addListener('onModelPartial', event => {
    if (event.id === id) { partial += event.text; take(partial, false); }
  });
  try {
    const answer = await Native.draftStream(id, phoneReplyPrompt(input), 220);
    take(answer, true);
    if (!answer.match(/(?:^|\n)Draft [1-3]:[ \t]*/)) acceptReplies([answer], exclude, 3, dashes, controls).forEach((text, slot) => {
      if (text) { made[slot] = text; exclude.push(text); landed(text, slot); }
    });
  } finally { subscription.remove(); }
  for (let slot = 0; slot < REPLY_SLOTS.length && Date.now() - started <= FILL_MS; slot++) {
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

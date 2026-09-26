import Native from '../../modules/ownvoice-native';
import { message } from '../core/nano';
import { acceptReplies, avoidLine, latestMessage, phoneReplyPrompt, phoneSlotPrompt, REPLY_SLOTS, versionAcceptor } from '../core/drafts';
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
    const prompt = versionPrompt(request.typed, request.conversation, versionsList[fail.slot], request.guide ?? '', dashes)
      + '\n- Keep their line breaks and list exactly.' + (note ? `\n\n${note}` : '');
    let again = '';
    try { again = await engine.ask(prompt, 256); } catch { continue; }
    const fixed = acceptor.fix(again, fail.slot, fail.label);
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
  const made = acceptReplies(await Native.drafts(phoneReplyPrompt(input), { candidates: 1, maxTokens: 220 }), exclude, 3, dashes);
  made.forEach((text, slot) => { if (text) { exclude.push(text); landed(text, slot); } });
  for (let slot = 0; slot < REPLY_SLOTS.length && Date.now() - started <= FILL_MS; slot++) {
    if (made[slot]) continue;
    try {
      const [draft] = acceptReplies([await ask(phoneSlotPrompt(REPLY_SLOTS[slot], input, exclude), 120)], exclude, 1, dashes);
      if (draft) { exclude.push(draft); made[slot] = draft; landed(draft, slot); }
    } catch { /* one retry per slot; a failure leaves the slot empty */ }
  }
  return made.filter((text): text is string => !!text);
}

export const phoneWriter = {
  async write(request: DraftRequest, on: WriterEvents = {}): Promise<Choice> {
    if (process.env.EXPO_PUBLIC_E2E_STUB === '1') {
      const drafts = ['Yes, still on! I\'ll bring the stove.', 'Sure, Saturday works. See you then.', 'Should be. What time were you thinking?'];
      drafts.forEach((text, slot) => on.landed?.(text, slot));
      return { drafts };
    }
    try {
      if (await Native.modelStatus() !== 'available') {
        on.state?.('downloading');
        await Native.downloadModel();
      }
      on.state?.('writing');
      const started = Date.now();
      const drafts = request.typed.trim()
        ? await polish(request, on)
        : await replies(request, on, started);
      return { drafts };
    } catch (error) {
      const code = Number(String(error).match(/(?:^|\D)(-?\d{1,3})(?:\D|$)/)?.[1]);
      throw new Error(message(Number.isFinite(code) ? code : -107));
    }
  },
} satisfies Writer;

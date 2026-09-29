import { classify, ResponseError } from '@byokit/accounts';
import { accounts, codexAuth, reportFailure } from './accounts';
import { acceptReplies, avoidLine, latestMessage, rebuildLines, replyPrompt, replySlotPrompt, slotsFor, versionAcceptor } from '../core/drafts';
import { lineRetryPrompt, rewritePrompt, selectionRewritePrompt, versionsList, type Rewrite } from '../core/judge';
import { words } from '../core/words';
import { SendVeto, type Choice, type DraftRequest, type Writer, type WriterEvents } from '../core/writers';

/** The ChatGPT model both the panel writer and the lab agent brain send to. */
export const CHATGPT_MODEL = 'gpt-6-sol';

const REPLY_INSTRUCTIONS = 'Return the requested reply drafts as JSON.';
const VERSION_INSTRUCTIONS = 'Return the requested three rewrite versions as JSON.';

/** One streamed Responses call through the kit's own sign-in; the last `count` array entries must all be non-empty strings (`text` returns one plain-text line instead). */
async function ask(prompt: string, instructions: string, key: 'drafts' | 'versions' | 'text', count = 3, on?: WriterEvents, onText?: (text: string) => void): Promise<string[]> {
  let started = false;
  let marked = false;
  try {
    // The credential the kit answers with; a lapse vetoes before the tap is marked, as before.
    await codexAuth();
    if (on?.beforeSend && !(await on.beforeSend())) throw new SendVeto(words.phoneWrote);
    if (on?.beforeSend && !(await on.beforeSend())) throw new SendVeto(words.phoneWrote);
    if (on?.beforeFetch && !on.beforeFetch()) throw new SendVeto(words.phoneWrote);
    started = true;
    on?.started?.();
    // The mark lands only once the server answers: a throw above means the text
    // never left (vetoed, offline before connect), so the read log claims no
    // send for it. A refusal is still an answer, so the mark stays for
    // transmitted-then-failed; only a network throw leaves it unmarked.
    const mark = async () => { await on?.sent?.(); marked = true; };
    let text: string;
    let answered = false;
    try {
      text = await accounts.respond('owner', { instructions, input: prompt, model: CHATGPT_MODEL, onText: delta => { answered = true; onText?.(delta); } });
    } catch (error) {
      if (error instanceof ResponseError && (error.kind !== 'network' || answered)) await mark();
      throw error;
    }
    await mark();
    if (key === 'text') {
      const line = text.trim();
      if (!line) throw new Error('ChatGPT could not answer.');
      return [line];
    }
    let drafts: unknown;
    try { drafts = JSON.parse(text)[key]; } catch { throw new Error('ChatGPT could not answer.'); }
    if (!Array.isArray(drafts) || drafts.length !== count || drafts.some(draft => typeof draft !== 'string' || !draft.trim())) throw new Error('ChatGPT could not answer.');
    return drafts;
  } catch (error) {
    if (!started && marked) await on?.unsent?.();
    if (error instanceof SendVeto) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (!started && classify(message)?.kind !== 'network') throw new SendVeto(words.phoneWrote);
    if (!(error instanceof ResponseError && error.kind != null)) await reportFailure(message).catch(() => {});
    throw error;
  }
}

export const streamResponses = (prompt: string, onText?: (text: string) => void): Promise<string[]> =>
  ask(prompt, VERSION_INSTRUCTIONS, 'versions', 3, undefined, onText);

const REWRITE_INSTRUCTIONS = 'Output only the rewritten text.';

/** Selection rewrite (Shorter / Simpler / Fix spelling) through one ChatGPT call, with the same consent guards. */
export const streamSelectionRewrite = (text: string, how: Rewrite, guide: string, on: WriterEvents = {}): Promise<string> =>
  ask(selectionRewritePrompt(text, how, guide), REWRITE_INSTRUCTIONS, 'text', 1, on).then(([line]) => line ?? '');

const accountFailure = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const kind = error instanceof ResponseError ? error.kind ?? classify(message)?.kind : classify(message)?.kind;
  return kind != null && kind !== 'network';
};

/** Replies through the C2 reply prompt (the old bug sent replies through the rewrite prompt). */
async function replies(request: DraftRequest, on: WriterEvents): Promise<string[]> {
  const dashes = request.dashes ?? 'remove' as const;
  const input = { latest: latestMessage(request.nodes, request.fieldTop), conversation: request.conversation, guide: request.guide, dashes, platform: request.platform };
  const landed = on.landed ?? (() => {});
  const exclude = [...request.avoid ?? []];
  const controls = request.nodes?.filter(node => node.clickable).map(node => node.text) ?? [];
  const made = acceptReplies(await ask(replyPrompt(input), REPLY_INSTRUCTIONS, 'drafts', 3, on), exclude, 3, dashes, controls);
  made.forEach((text, slot) => { if (text) { exclude.push(text); landed(text, slot); } });
  const slots = slotsFor(request.platform);
  for (let slot = 0; slot < slots.length; slot++) {
    if (made[slot]) continue;
    try {
      const [draft] = acceptReplies(await ask(replySlotPrompt(slots[slot], { ...input, avoid: exclude }), REPLY_INSTRUCTIONS, 'drafts', 1, on), exclude, 1, dashes, controls);
      if (draft) { exclude.push(draft); made[slot] = draft; landed(draft, slot); }
    } catch (error) { if (error instanceof SendVeto || accountFailure(error)) throw error; }
  }
  return made.filter((text): text is string => !!text);
}

/** Polish and compose through the C2 rewrite prompt, then the same acceptance rules as the phone. */
async function polish(request: DraftRequest, on: WriterEvents): Promise<Choice> {
  const dashes = request.dashes ?? 'remove' as const;
  const avoid = request.avoid ?? [];
  const note = avoidLine(avoid);
  const landed = on.landed ?? (() => {});
  const acceptor = versionAcceptor(request.typed, dashes, avoid);
  const raw = await ask(rewritePrompt(request.typed, request.conversation, request.guide ?? '', dashes, request.platform) + (note ? `\n\n${note}` : ''), VERSION_INSTRUCTIONS, 'versions', 3, on);
  raw.slice(0, versionsList.length).forEach((text, slot) => {
    const clean = acceptor.accept(text, slot, versionsList[slot].label);
    if (clean != null) landed(clean, slot, versionsList[slot].label);
  });
  for (const fail of acceptor.layoutFails) {
    // The rescue answer is plain Row lines, not the versions JSON: read it as text, then rebuild.
    const prompt = lineRetryPrompt(request.typed, request.conversation, versionsList[fail.slot], request.guide ?? '', dashes, request.platform) + (note ? `\n\n${note}` : '');
    let rebuilt: string | null;
    try {
      const [rows] = await ask(prompt, 'Output only the rewritten rows as the prompt asks.', 'text', 1, on);
      rebuilt = rebuildLines(request.typed, rows ?? '');
    } catch (error) { if (error instanceof SendVeto || accountFailure(error)) throw error; continue; }
    if (rebuilt == null) continue;
    const fixed = acceptor.fix(rebuilt, fail.slot, fail.label);
    if (fixed != null) landed(fixed, fail.slot, fail.label);
  }
  return { drafts: acceptor.results.sort((a, b) => a.slot - b.slot).map(r => r.text), unchanged: acceptor.unchanged };
}

export const chatgptWriter: Writer = {
  async write(request: DraftRequest, on: WriterEvents = {}): Promise<Choice> {
    try {
      return request.typed.trim() ? await polish(request, on) : { drafts: await replies(request, on) };
    } catch (error) {
      if (error instanceof SendVeto) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const kind = classify(message)?.kind;
      if (kind === 'network') throw error;
      // Developer log only, never on screen: the panel line stays plain while the
      // next QA can tell a refusal from a dead stream in logcat.
      console.log(`Ownvoice ChatGPT no-answer kind=${kind ?? 'unknown'} message=${message}`);
      throw new Error(words.chatgptFailed);
    }
  },
};

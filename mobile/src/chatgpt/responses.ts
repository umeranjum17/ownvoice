import { fetch as expoFetch } from 'expo/fetch';
import { classify, IncompleteError, ResponseError } from '@byokit/accounts';
import { accounts, codexAuth, reportFailure } from './accounts';
import { withResponseFetch } from './responseFetch';
import { acceptReplies, avoidLine, latestMessage, rebuildLines, replyPrompt, replySlotPrompt, slotsFor } from '../core/drafts';
import { lineRetryPrompt, rewritePrompt, selectionRewritePrompt, versionsList, writerVersions, type Rewrite } from '../core/judge';
import { words } from '../core/words';
import { canPolish, polishAcceptor } from '../core/polish';
import { SendVeto, type Choice, type DraftRequest, type Writer, type WriterEvents } from '../core/writers';

/** The ChatGPT model both the panel writer and the lab agent brain send to. */
export const CHATGPT_MODEL = 'gpt-6-sol';

const REPLY_INSTRUCTIONS = 'Return the requested reply drafts as JSON.';
const VERSION_INSTRUCTIONS = 'Return the requested rewrite versions as JSON.';

/** Draft/version arrays must have exactly `count` nonblank strings. `text` returns trimmed plain text. */
async function ask(prompt: string, instructions: string, key: 'drafts' | 'versions' | 'text', count = 3, on?: WriterEvents, onText?: (text: string) => void, fetcher: typeof fetch = expoFetch as typeof fetch): Promise<string[]> {
  let started = false;
  let marked = false;
  try {
    await codexAuth();
    if (on?.beforeSend && !(await on.beforeSend())) throw new SendVeto(words.phoneWrote);
    // The kit resolves credentials before calling its configured fetch. Associate this
    // request's signal with the app's consent and read-log hooks so the last checks
    // still happen at dispatch, including after any credential wait.
    const text = await withResponseFetch(async (url, init) => {
      if (on?.beforeSend && !(await on.beforeSend())) throw new SendVeto(words.phoneWrote);
      if (on?.beforeFetch && !on.beforeFetch()) throw new SendVeto(words.phoneWrote);
      started = true;
      on?.started?.();
      const response = await fetcher(url, init);
      // An answer, even a refusal or an empty stream, means the text went out.
      // An offline throw above leaves the read log unmarked.
      await on?.sent?.();
      marked = true;
      return response;
    }, signal => accounts.respond('owner', {
      instructions, input: prompt, model: CHATGPT_MODEL, signal, onText,
      text: key === 'text' ? { verbosity: 'low' } : { verbosity: 'low', format: { type: 'json_object' } },
    }));
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
    if (error instanceof IncompleteError) throw new Error(words.chatgptFailed);
    const message = error instanceof Error ? error.message : String(error);
    if (!started && classify(message)?.kind !== 'network') {
      if (__DEV__) console.log(`Ownvoice ChatGPT pre-dispatch failure: ${message}`);
      throw new SendVeto(words.phoneWrote, { cause: error });
    }
    if (!(error instanceof ResponseError && error.kind != null)) await reportFailure('chatgpt', message).catch(() => {});
    throw error;
  }
}

export const streamResponses = (prompt: string, onText?: (text: string) => void, fetcher: typeof fetch = expoFetch as typeof fetch): Promise<string[]> =>
  ask(prompt, VERSION_INSTRUCTIONS, 'versions', 3, undefined, onText, fetcher);

const REWRITE_INSTRUCTIONS = 'Output only the rewritten text.';

/** Selection rewrite (Shorter / Simpler / Fix spelling) through one ChatGPT call, with the same consent guards. */
export const streamSelectionRewrite = (text: string, how: Rewrite, guide: string, on: WriterEvents = {}): Promise<string> =>
  ask(selectionRewritePrompt(text, how, guide), REWRITE_INSTRUCTIONS, 'text', 1, on).then(([line]) => line ?? '');

const accountFailure = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const kind = error instanceof ResponseError ? error.kind ?? classify(message)?.kind : classify(message)?.kind;
  return kind != null && kind !== 'network';
};

/** Read only closed strings in the requested array, never a half-written draft or escape. */
function finishedReplies(text: string): string[] {
  const start = text.match(/^\s*\{\s*"drafts"\s*:\s*\[/);
  if (!start) return [];
  const drafts: string[] = [];
  let at = start[0].length;
  while (drafts.length < 3) {
    while (/\s/.test(text[at] ?? '') && at < text.length) at++;
    if (text[at] !== '"') break;
    const from = at++;
    let escaped = false;
    while (at < text.length) {
      const char = text[at++];
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char !== '"') continue;
      let draft: string;
      try { draft = JSON.parse(text.slice(from, at)); } catch { return drafts; }
      while (/\s/.test(text[at] ?? '') && at < text.length) at++;
      // A closing quote alone could still belong to malformed JSON. Wait for its separator.
      if (text[at] !== ',' && text[at] !== ']') return drafts;
      drafts.push(draft);
      if (text[at++] === ']') return drafts;
      break;
    }
    if (at >= text.length) break;
  }
  return drafts;
}

/** Replies through the C2 reply prompt (the old bug sent replies through the rewrite prompt). */
async function replies(request: DraftRequest, on: WriterEvents): Promise<string[]> {
  const dashes = request.dashes ?? 'remove' as const;
  const input = { latest: latestMessage(request.nodes, request.fieldTop), conversation: request.conversation, point: request.point, guide: request.guide, dashes, platform: request.platform };
  const slots = slotsFor(request.platform);
  const landed = on.landed ?? (() => {});
  const exclude = [...request.avoid ?? []];
  const controls = request.nodes?.filter(node => node.clickable).map(node => node.text) ?? [];
  const never = request.never ?? [];
  const made: (string | null)[] = [null, null, null];
  const take = (raw: string[]) => {
    acceptReplies(raw, request.avoid ?? [], 3, dashes, controls, never, input.point ?? '').forEach((text, slot) => {
      if (!text || made[slot]) return;
      made[slot] = text;
      exclude.push(text);
      landed(text, slot);
    });
  };
  let partial = '';
  try {
    take(await ask(replyPrompt(input), REPLY_INSTRUCTIONS, 'drafts', 3, on, delta => {
      partial += delta;
      take(finishedReplies(partial));
    }));
  } catch (error) {
    // A failed/incomplete response cannot leave its provisional cards on screen.
    if (made.some(Boolean)) on.reset?.();
    throw error;
  }
  for (let slot = 0; slot < slots.length; slot++) {
    if (made[slot]) continue;
    try {
      const [draft] = acceptReplies(await ask(replySlotPrompt(slots[slot], { ...input, avoid: exclude }), REPLY_INSTRUCTIONS, 'drafts', 1, on), exclude, 1, dashes, controls, never, input.point ?? '');
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
  // A new post of his own starts from a line about the post, which is an instruction rather than a
  // message waiting to be polished, so the clarity question does not apply there.
  if (!request.newPost && !await canPolish(request.typed, prompt => ask(prompt, 'Answer only CLEAR or UNCLEAR.', 'text', 1, on).then(([text]) => text))) return { drafts: [], declined: true };
  const acceptor = await polishAcceptor(request.typed, dashes, avoid);
  if (acceptor.local != null) landed(acceptor.local, 0, versionsList[0].label);
  const raw = await ask(rewritePrompt(request.typed, request.conversation, request.guide ?? '', dashes, request.platform) + (note ? `\n\n${note}` : ''), VERSION_INSTRUCTIONS, 'versions', writerVersions.length, on);
  raw.forEach((text, index) => {
    const slot = index + 1;
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


import { fetch as expoFetch } from 'expo/fetch';
import { classify } from '@byokit/accounts';
import { codexAuth, reportFailure } from './accounts';
import { readDraftStream, readTextStream } from '../core/responses-stream';
import { acceptReplies, avoidLine, latestMessage, replyPrompt, replySlotPrompt, REPLY_SLOTS, versionAcceptor } from '../core/drafts';
import { rewritePrompt, selectionRewritePrompt, versionPrompt, versionsList, type Rewrite } from '../core/judge';
import { words } from '../core/words';
import { SendVeto, type Choice, type DraftRequest, type Writer, type WriterEvents } from '../core/writers';

// Temporary until byokit ships its streamed Responses call; delete this file then.

const REPLY_INSTRUCTIONS = 'Return the requested reply drafts as JSON.';
const VERSION_INSTRUCTIONS = 'Return the requested three rewrite versions as JSON.';

/** One streamed Responses call; the last `count` array entries must all be non-empty strings (`text` returns one plain-text line instead). */
async function ask(prompt: string, instructions: string, key: 'drafts' | 'versions' | 'text', count = 3, on?: WriterEvents, onText?: (text: string) => void, fetcher: typeof fetch = expoFetch as typeof fetch): Promise<string[]> {
  let started = false;
  let marked = false;
  try {
    const auth = await codexAuth();
    if (on?.beforeSend && !(await on.beforeSend())) throw new SendVeto(words.phoneWrote);
    const request = {
      method: 'POST', headers: { Authorization: `Bearer ${auth.access}`, 'Content-Type': 'application/json', 'chatgpt-account-id': auth.accountId, originator: 'ownvoice', 'OpenAI-Beta': 'responses=experimental', accept: 'text/event-stream' },
      body: JSON.stringify({ model: 'gpt-6-sol', instructions, input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }], stream: true, store: false, reasoning: { effort: 'none' }, text: key === 'text' ? { verbosity: 'low' } : { verbosity: 'low', format: { type: 'json_object' } } }),
    };
    await on?.sent?.();
    marked = true;
    if (on?.beforeSend && !(await on.beforeSend())) throw new SendVeto(words.phoneWrote);
    if (on?.beforeFetch && !on.beforeFetch()) throw new SendVeto(words.phoneWrote);
    started = true;
    on?.started?.();
    const response = await fetcher('https://chatgpt.com/backend-api/codex/responses', request);
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
    if (!response.body) throw new Error('ChatGPT did not answer.');
    if (key === 'text') return [await readTextStream(response.body, onText)];
    return await readDraftStream(response.body, key, onText, count);
  } catch (error) {
    if (!started && marked) await on?.unsent?.();
    if (error instanceof SendVeto) throw error;
    if (!started) throw new SendVeto(words.phoneWrote);
    await reportFailure(error instanceof Error ? error.message : String(error)).catch(() => {});
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
  const kind = classify(error instanceof Error ? error.message : String(error))?.kind;
  return kind != null && kind !== 'network';
};

/** Replies through the C2 reply prompt (the old bug sent replies through the rewrite prompt). */
async function replies(request: DraftRequest, on: WriterEvents): Promise<string[]> {
  const dashes = request.dashes ?? 'remove' as const;
  const input = { latest: latestMessage(request.nodes, request.fieldTop), conversation: request.conversation, guide: request.guide, dashes };
  const landed = on.landed ?? (() => {});
  const exclude = [...request.avoid ?? []];
  const controls = request.nodes?.filter(node => node.clickable).map(node => node.text) ?? [];
  const made = acceptReplies(await ask(replyPrompt(input), REPLY_INSTRUCTIONS, 'drafts', 3, on), exclude, 3, dashes, controls);
  made.forEach((text, slot) => { if (text) { exclude.push(text); landed(text, slot); } });
  for (let slot = 0; slot < REPLY_SLOTS.length; slot++) {
    if (made[slot]) continue;
    try {
      const [draft] = acceptReplies(await ask(replySlotPrompt(REPLY_SLOTS[slot], { ...input, avoid: exclude }), REPLY_INSTRUCTIONS, 'drafts', 1, on), exclude, 1, dashes, controls);
      if (draft) { exclude.push(draft); made[slot] = draft; landed(draft, slot); }
    } catch (error) { if (error instanceof SendVeto || accountFailure(error)) throw error; }
  }
  return made.filter((text): text is string => !!text);
}

/** Polish and compose through the C2 rewrite prompt, then the same acceptance rules as the phone. */
async function polish(request: DraftRequest, on: WriterEvents): Promise<string[]> {
  const dashes = request.dashes ?? 'remove' as const;
  const avoid = request.avoid ?? [];
  const note = avoidLine(avoid);
  const landed = on.landed ?? (() => {});
  const acceptor = versionAcceptor(request.typed, dashes, avoid);
  const raw = await ask(rewritePrompt(request.typed, request.conversation, request.guide ?? '', dashes) + (note ? `\n\n${note}` : ''), VERSION_INSTRUCTIONS, 'versions', 3, on);
  raw.slice(0, versionsList.length).forEach((text, slot) => {
    const clean = acceptor.accept(text, slot, versionsList[slot].label);
    if (clean != null) landed(clean, slot, versionsList[slot].label);
  });
  for (const fail of acceptor.layoutFails) {
    const prompt = versionPrompt(request.typed, request.conversation, versionsList[fail.slot], request.guide ?? '', dashes)
      + '\n- Keep their line breaks and list exactly.' + (note ? `\n\n${note}` : '');
    let again: string[] = [];
    try { again = await ask(prompt, VERSION_INSTRUCTIONS, 'versions', 1, on); } catch (error) { if (error instanceof SendVeto || accountFailure(error)) throw error; continue; }
    const fixed = acceptor.fix(again[0] ?? '', fail.slot, fail.label);
    if (fixed != null) landed(fixed, fail.slot, fail.label);
  }
  return acceptor.results.sort((a, b) => a.slot - b.slot).map(r => r.text);
}

export const chatgptWriter: Writer = {
  async write(request: DraftRequest, on: WriterEvents = {}): Promise<Choice> {
    try {
      return { drafts: request.typed.trim() ? await polish(request, on) : await replies(request, on) };
    } catch (error) {
      if (error instanceof SendVeto) throw error;
      throw new Error(words.chatgptFailed);
    }
  },
};

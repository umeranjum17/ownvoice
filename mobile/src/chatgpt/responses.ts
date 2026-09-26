import { fetch as expoFetch } from 'expo/fetch';
import { codexAuth } from './accounts';
import { readDraftStream } from '../core/responses-stream';
import { acceptReplies, avoidLine, latestMessage, replyPrompt, replySlotPrompt, REPLY_SLOTS, versionAcceptor } from '../core/drafts';
import { rewritePrompt, versionPrompt, versionsList } from '../core/judge';
import { words } from '../core/words';
import type { Choice, DraftRequest, Writer, WriterEvents } from '../core/writers';

// Temporary until byokit ships its streamed Responses call; delete this file then.

const REPLY_INSTRUCTIONS = 'Return the requested reply drafts as JSON.';
const VERSION_INSTRUCTIONS = 'Return the requested three rewrite versions as JSON.';

/** One streamed Responses call; the last `count` array entries must all be non-empty strings. */
async function ask(prompt: string, instructions: string, count = 3, onText?: (text: string) => void): Promise<string[]> {
  const auth = await codexAuth();
  const response = await (expoFetch as typeof fetch)('https://chatgpt.com/backend-api/codex/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${auth.access}`, 'Content-Type': 'application/json', 'chatgpt-account-id': auth.accountId, originator: 'ownvoice', 'OpenAI-Beta': 'responses=experimental', accept: 'text/event-stream' },
    body: JSON.stringify({ model: 'gpt-6-sol', instructions, input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }], stream: true, store: false, reasoning: { effort: 'none' }, text: { verbosity: 'low', format: { type: 'json_object' } } }),
  });
  if (!response.ok || !response.body) throw new Error(words.chatgptFailed);
  return readDraftStream(response.body, onText, count);
}

// Kept for the existing stream tests; now a thin wrapper over ask().
export async function streamResponses(prompt: string, onText?: (text: string) => void, fetcher: typeof fetch = expoFetch as typeof fetch): Promise<string[]> {
  const auth = await codexAuth();
  const response = await fetcher('https://chatgpt.com/backend-api/codex/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${auth.access}`, 'Content-Type': 'application/json', 'chatgpt-account-id': auth.accountId, originator: 'ownvoice', 'OpenAI-Beta': 'responses=experimental', accept: 'text/event-stream' },
    body: JSON.stringify({ model: 'gpt-6-sol', instructions: VERSION_INSTRUCTIONS, input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }], stream: true, store: false, reasoning: { effort: 'none' }, text: { verbosity: 'low', format: { type: 'json_object' } } }),
  });
  if (!response.ok || !response.body) throw new Error(words.chatgptFailed);
  return readDraftStream(response.body, onText, 3);
}

/** Replies through the C2 reply prompt (the old bug sent replies through the rewrite prompt). */
async function replies(request: DraftRequest, on: WriterEvents): Promise<string[]> {
  const dashes = request.dashes ?? 'remove' as const;
  const input = { latest: latestMessage(request.nodes, request.fieldTop), conversation: request.conversation, guide: request.guide, dashes };
  const landed = on.landed ?? (() => {});
  const exclude = [...request.avoid ?? []];
  const made = acceptReplies(await ask(replyPrompt(input), REPLY_INSTRUCTIONS), exclude, 3, dashes);
  made.forEach((text, slot) => { if (text) { exclude.push(text); landed(text, slot); } });
  for (let slot = 0; slot < REPLY_SLOTS.length; slot++) {
    if (made[slot]) continue;
    try {
      const [draft] = acceptReplies(await ask(replySlotPrompt(REPLY_SLOTS[slot], { ...input, avoid: exclude }), REPLY_INSTRUCTIONS, 1), exclude, 1, dashes);
      if (draft) { exclude.push(draft); made[slot] = draft; landed(draft, slot); }
    } catch { /* one retry per slot; a failure leaves the slot empty */ }
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
  const raw = await ask(rewritePrompt(request.typed, request.conversation, request.guide ?? '', dashes) + (note ? `\n\n${note}` : ''), VERSION_INSTRUCTIONS);
  raw.slice(0, versionsList.length).forEach((text, slot) => {
    const clean = acceptor.accept(text, slot, versionsList[slot].label);
    if (clean != null) landed(clean, slot, versionsList[slot].label);
  });
  for (const fail of acceptor.layoutFails) {
    const prompt = versionPrompt(request.typed, request.conversation, versionsList[fail.slot], request.guide ?? '', dashes)
      + '\n- Keep their line breaks and list exactly.' + (note ? `\n\n${note}` : '');
    let again: string[] = [];
    try { again = await ask(prompt, VERSION_INSTRUCTIONS, 1); } catch { continue; }
    const fixed = acceptor.fix(again[0] ?? '', fail.slot, fail.label);
    if (fixed != null) landed(fixed, fail.slot, fail.label);
  }
  return acceptor.results.sort((a, b) => a.slot - b.slot).map(r => r.text);
}

export const chatgptWriter: Writer = {
  async write(request: DraftRequest, on: WriterEvents = {}): Promise<Choice> {
    try {
      return { drafts: request.typed.trim() ? await polish(request, on) : await replies(request, on) };
    } catch {
      throw new Error(words.chatgptFailed);
    }
  },
};

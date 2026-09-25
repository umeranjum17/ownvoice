import { fetch as expoFetch } from 'expo/fetch';
import { codexAuth } from './accounts';
import { readDraftStream } from '../core/responses-stream';
import type { DraftRequest, Writer } from '../core/writers';
import { rewritePrompt } from '../core/judge';

// Temporary until byokit ships its streamed Responses call; delete this file then.
export async function streamResponses(prompt: string, onText?: (text: string) => void, fetcher: typeof fetch = expoFetch as typeof fetch): Promise<string[]> {
  const auth = await codexAuth();
  const response = await fetcher('https://chatgpt.com/backend-api/codex/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${auth.access}`, 'Content-Type': 'application/json', 'chatgpt-account-id': auth.accountId, originator: 'ownvoice', 'OpenAI-Beta': 'responses=experimental', accept: 'text/event-stream' },
    body: JSON.stringify({ model: 'gpt-6-sol', instructions: 'Return the requested three rewrite versions as JSON.', input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }], stream: true, store: false, reasoning: { effort: 'none' }, text: { verbosity: 'low', format: { type: 'json_object' } } }),
  });
  if (!response.ok || !response.body) throw new Error(`ChatGPT could not answer (${response.status}).`);
  return readDraftStream(response.body, onText);
}

export const chatgptWriter: Writer = {
  async write({ conversation, written, guide }: DraftRequest) {
    return streamResponses(rewritePrompt(written, conversation, guide));
  },
};

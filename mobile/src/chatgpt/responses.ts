import { fetch as expoFetch } from 'expo/fetch';
import { codexAuth } from './accounts';
import { versions } from '../core/judge';
import type { DraftRequest, Writer } from '../core/writers';
import { rewritePrompt } from '../core/judge';

// Temporary until byokit ships its streamed Responses call; delete this file then.
export async function streamResponses(prompt: string, onText?: (text: string) => void, fetcher: typeof fetch = expoFetch as typeof fetch): Promise<string> {
  const auth = await codexAuth();
  const response = await fetcher('https://chatgpt.com/backend-api/codex/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${auth.access}`, 'Content-Type': 'application/json', 'chatgpt-account-id': auth.accountId, originator: 'ownvoice', 'OpenAI-Beta': 'responses=experimental', accept: 'text/event-stream' },
    body: JSON.stringify({ model: 'gpt-6-sol', instructions: 'Return the requested three rewrite versions as JSON.', input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }], stream: true, store: false, reasoning: { effort: 'none' }, text: { verbosity: 'low', format: { type: 'json_object' } } }),
  });
  if (!response.ok || !response.body) throw new Error(`ChatGPT could not answer (${response.status}).`);
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let pending = '', result = '';
  while (true) {
    const { value, done } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    const events = pending.split('\n\n'); pending = events.pop() ?? '';
    for (const event of events) for (const line of event.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim(); if (!data || data === '[DONE]') continue;
      const parsed = JSON.parse(data);
      const text = parsed.delta ?? parsed.text ?? parsed.output_text;
      if (typeof text === 'string') { result += text; onText?.(text); }
      if (parsed.type === 'response.failed') throw new Error('ChatGPT could not answer.');
    }
    if (done) break;
  }
  return result;
}

export const chatgptWriter: Writer = {
  async write({ conversation, written, guide }: DraftRequest) {
    const drafts = versions(await streamResponses(rewritePrompt(written, conversation, guide)));
    if (!drafts.length) throw new Error('ChatGPT could not answer.');
    return drafts;
  },
};

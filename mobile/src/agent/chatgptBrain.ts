// Lab phone-agent brain behind the ChatGPT source (package A2): Responses with function
// tools over fetch alone, guarded before every step exactly like the panel route.
import { fetch as expoFetch } from 'expo/fetch';
import { classify, limitResponse, ResponseError } from '@byokit/accounts';
import { codexAuth, reportFailure } from '../chatgpt/accounts';
import { CHATGPT_MODEL } from '../chatgpt/responses';
import { agentChatgptConsent } from '../chatgpt/settings';
import { getSource } from '../core/source';
import { CHATGPT_OFF } from '../core/switch';
import { words } from '../core/words';
import { SendVeto } from '../core/writers';
import type { Brain, Call, Turn } from './loop';

const BASE = 'https://chatgpt.com/backend-api';

/** A failed step as the one dual-source plain line the lab screen shows. No mid-task fallback. */
function failureLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof ResponseError && error.kind === 'network') return words.offlineNoPhone;
  if (classify(message)?.kind === 'network') return words.offlineNoPhone;
  return words.chatgptFailed;
}

async function readTurn(body: ReadableStream<Uint8Array>, onText?: (text: string) => void): Promise<Turn> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let text = '';
  let done = false;
  const calls: Call[] = [];
  const consume = (block: string) => {
    const data = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    let e: { type?: string; delta?: string; item?: { type?: string; call_id?: string; name?: string; arguments?: string }; response?: { error?: { message?: string; code?: string; type?: string } } };
    try { e = JSON.parse(data); } catch { return; }
    if (e.type === 'response.output_text.delta' && typeof e.delta === 'string') { text += e.delta; onText?.(e.delta); }
    if (e.type === 'response.output_item.done' && e.item?.type === 'function_call' && e.item.call_id && e.item.name) {
      calls.push({ id: e.item.call_id, name: e.item.name, args: e.item.arguments ?? '{}' });
    }
    if (e.type === 'response.completed') done = true;
    if (e.type === 'response.failed' || e.type === 'error') {
      const failed = e.type === 'error' ? e : e.response?.error;
      throw new ResponseError(String((failed as { message?: unknown })?.message ?? 'Request failed'), null);
    }
  };
  for (let chunk = await reader.read(); ; chunk = await reader.read()) {
    pending += decoder.decode(chunk.value, { stream: !chunk.done });
    const blocks = pending.split(/\r?\n\r?\n/);
    pending = blocks.pop() ?? '';
    blocks.forEach(consume);
    if (chunk.done) break;
  }
  if (pending.trim()) consume(pending);
  if (!done) throw new ResponseError('ChatGPT stopped before completing its answer.', 'network');
  return { text, calls };
}

export function chatgptBrain(o: {
  auth?: () => Promise<{ access: string; accountId: string }>;
  model?: string;
  fetch?: typeof fetch;
  base?: string;
} = {}): Brain {
  const auth = o.auth ?? codexAuth;
  const model = o.model ?? CHATGPT_MODEL;
  const doFetch = o.fetch ?? (expoFetch as typeof fetch);
  const base = o.base ?? BASE;
  return {
    async step(instructions, items, tools, onText): Promise<Turn> {
      // Nothing is sent when any guard fails: the screen shows the plain line instead.
      if ((await getSource()) !== 'chatgpt') throw new Error(words.needWriterPanel);
      const consent = agentChatgptConsent();
      try {
        if (!(await consent.beforeSend())) throw new Error(words.chatgptFailed);
      } catch (error) {
        if (error instanceof SendVeto) throw new Error(error.message === CHATGPT_OFF ? words.gptOffNoPhone : error.message);
        throw error;
      }
      const account = await auth().catch(() => { throw new Error(words.chatgptFailed); });
      if (!consent.beforeFetch()) throw new Error(words.chatgptFailed);
      try {
        const response = await doFetch(`${base}/codex/responses`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'text/event-stream',
            authorization: `Bearer ${account.access}`,
            'chatgpt-account-id': account.accountId,
            'OpenAI-Beta': 'responses=experimental',
            originator: 'ownvoice',
          },
          body: JSON.stringify({
            model, instructions, input: items, tools, tool_choice: 'auto',
            parallel_tool_calls: false, stream: true, store: false,
            reasoning: { effort: 'none' }, text: { verbosity: 'low' },
          }),
        });
        if (!response.ok) {
          const e = limitResponse(response.status, await response.text().catch(() => ''));
          throw new ResponseError(e.message, e.kind, e.until ?? 0);
        }
        if (!response.body) throw new Error('ChatGPT did not answer.');
        return await readTurn(response.body, onText);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await reportFailure(message).catch(() => {});
        throw new Error(failureLine(error));
      }
    },
  };
}

// Lab phone-agent brain behind the ChatGPT source (package A2): Responses with function
// tools through BYOKit, guarded before every step exactly like the panel route.
import { fetch as expoFetch } from 'expo/fetch';
import { classify, IncompleteError, isFunctionCall, ResponseError } from '@byokit/accounts';
import { accounts, codexAuth, reportFailure } from '../chatgpt/accounts';
import { withResponseFetch } from '../chatgpt/responseFetch';
import { CHATGPT_MODEL } from '../chatgpt/responses';
import { agentChatgptConsent } from '../chatgpt/settings';
import { getSource } from '../core/source';
import { CHATGPT_OFF } from '../core/switch';
import { words } from '../core/words';
import { SendVeto } from '../core/writers';
import type { Brain, Turn } from './loop';

/** A failed step as the one dual-source plain line the lab screen shows. No mid-task fallback. */
function failureLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof ResponseError && error.kind === 'network') return words.offlineNoPhone;
  if (classify(message)?.kind === 'network') return words.offlineNoPhone;
  return words.chatgptFailed;
}

export function chatgptBrain(o: {
  auth?: () => Promise<{ access: string; accountId: string }>;
  model?: string;
  fetch?: typeof fetch;
} = {}): Brain {
  const auth = o.auth ?? codexAuth;
  const model = o.model ?? CHATGPT_MODEL;
  const doFetch = o.fetch ?? (expoFetch as typeof fetch);
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
      await auth().catch(() => { throw new Error(words.chatgptFailed); });
      if (!consent.beforeFetch()) throw new Error(words.chatgptFailed);
      try {
        const result = await withResponseFetch((url, init) => {
          // The kit resolves credentials again; withdrawal must still prevent dispatch
          // if it starts during that wait, just as on the panel route.
          if (!consent.beforeFetch()) throw new Error(words.chatgptFailed);
          return doFetch(url, init);
        }, signal => accounts.respond('owner', {
          model, instructions, input: items, tools, tool_choice: 'auto',
          parallelToolCalls: false, signal, onText,
          reasoning: { effort: 'none' }, text: { verbosity: 'low' },
        }));
        return {
          text: result.text,
          calls: result.output.filter(isFunctionCall)
            .filter(call => call.call_id && call.name)
            .map(call => ({ id: call.call_id!, name: call.name, args: call.arguments })),
        };
      } catch (error) {
        if (error instanceof IncompleteError) throw new Error(words.chatgptFailed);
        const message = error instanceof Error ? error.message : String(error);
        if (!(error instanceof ResponseError && error.kind != null)) await reportFailure('chatgpt', message).catch(() => {});
        throw new Error(failureLine(error));
      }
    },
  };
}

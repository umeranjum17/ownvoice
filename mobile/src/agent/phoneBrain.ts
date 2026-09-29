import Native from '../../modules/ownvoice-native';
import type { Brain } from './loop';
import { scriptBrain } from './script';

let calls = 0;

/**
 * Package A3: the plan §4.2 fixed script over the on-phone writer. The small model only writes
 * text; code calls the tools. model names the writer for the experiment log (Native.ask serves
 * whichever writer is on the phone: Gemini Nano where AICore has it, otherwise the pinned Gemma
 * download); maxTokens caps each write.
 */
export function phoneBrain(o: { model?: string; maxTokens?: number } = {}): Brain {
  const model = o.model ?? 'gemma-4-E2B';
  const maxTokens = o.maxTokens ?? 256;
  return scriptBrain(
    (prompt) => Native.ask(`phone-agent-${model}-${Date.now()}-${calls++}`, prompt, { maxTokens }),
  );
}

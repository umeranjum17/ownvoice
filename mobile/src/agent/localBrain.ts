import { askLocal } from '../core/localModel';
import type { Brain } from './loop';
import { scriptBrain } from './script';

/**
 * On-device writer via @byokit/infer: Qwen2.5 1.5B model running entirely on the phone.
 * Replaces phoneBrain's Native.ask path with BYOKit's local model.
 */
export function localBrain(o: { maxTokens?: number } = {}): Brain {
  const maxTokens = o.maxTokens ?? 256;
  return scriptBrain((prompt) => askLocal(prompt, maxTokens));
}

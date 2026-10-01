export * from 'ownvoice-engine/src/voice.ts';
import { guide as engineGuide } from 'ownvoice-engine/src/voice.ts';
import type { Rules } from './slop';

// Existing mobile writers have not reserved instruction space for examples yet.
// Keep their old guide until writer/fit integration shares a budgeted selection.
export function guide(rules: Rules, post: boolean): string {
  return engineGuide({ ...rules, samples: [] }, post);
}

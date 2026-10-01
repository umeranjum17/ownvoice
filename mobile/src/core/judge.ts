export * from 'ownvoice-engine/src/judge.ts';
import * as Judge from 'ownvoice-engine/src/judge.ts';
import { slips } from './typing';

// Carry known wording concerns through every caller, including selection rewrites.
export function scoreDraft(...args: Parameters<typeof Judge.scoreDraft>): Judge.Scores {
  return { ...Judge.scoreDraft(...args), slips: slips(args[0], null).length };
}

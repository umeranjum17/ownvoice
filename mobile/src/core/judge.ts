export * from 'ownvoice-engine/src/judge.ts';
import * as Judge from 'ownvoice-engine/src/judge.ts';
import { slips } from './typing';

// Carry known wording concerns through every caller, including selection rewrites.
export function scoreDraft(...args: Parameters<typeof Judge.scoreDraft>): Judge.Scores {
  return { ...Judge.scoreDraft(...args), slips: slips(args[0], null).length };
}

// Neither the semantic checks (which allow typos) nor the limited local rules
// establish that wording is sound. Keep concerns, but leave approval unknown.
export function verdict(...args: Parameters<typeof Judge.verdict>): Judge.Verdict | null {
  const value = Judge.verdict(...args);
  return value?.good ? null : value;
}

export function reasons(...args: Parameters<typeof Judge.reasons>): Judge.Reason[] {
  const rows = Judge.reasons(...args);
  if (!args[0].slips && !args[2]) rows.push({ ok: null, name: 'Check the wording', detail: 'Wording has not been fully checked.' });
  return rows;
}

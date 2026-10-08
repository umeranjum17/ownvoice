// G9: local check-ins, not a causal claim or a forecast of reach.
// Input is the JSON array stored at reply-outcomes; this command never writes it.
import { readFileSync } from 'node:fs';
import type { Outcome } from '../src/core/store.ts';
import { LEVELS } from '../src/grow/fit.ts';

try {
  if (process.argv.length !== 3) throw new Error('Usage: node fit-calibration.ts <reply-outcomes.json>');
  const rows: unknown = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  if (!Array.isArray(rows)) throw new Error('Expected the reply-outcomes JSON array.');
  const strongGood = { checkins: 0, successes: 0 };
  const mightSkipped = { checkins: 0, successes: 0 };
  const ids = new Set<string>();
  let excluded = 0;
  for (const [index, value] of rows.entries()) {
    const row = value as Outcome;
    const invalid = (cause: string): never => { throw new Error(`Row ${index + 1}: ${cause}`); };
    if (!row || typeof row !== 'object' || Array.isArray(row)) invalid('expected an outcome object.');
    if (typeof row.id !== 'string' || !row.id.trim()) invalid('missing insertion id.');
    if (ids.has(row.id)) invalid('duplicate insertion id.');
    ids.add(row.id);
    if (typeof row.platform !== 'string' || typeof row.platformLabel !== 'string'
      || !['yours', 'suggestion'].includes(row.card) || !Number.isInteger(row.slot)
      || !Number.isFinite(row.at) || (row.text !== undefined && typeof row.text !== 'string')) {
      invalid('invalid insertion metadata.');
    }
    if (row.level !== null && typeof row.level !== 'string') invalid('expected a shown level or null.');
    if (row.checkin !== undefined && !['replies', 'likes', 'nothing', 'not-posted'].includes(row.checkin)) {
      invalid('unknown checkin value.');
    }
    if (row.checkinAt !== undefined && !Number.isFinite(row.checkinAt)) invalid('invalid checkinAt.');
    const level = LEVELS.indexOf(row.level ?? '');
    if (level < 0 || row.checkin === undefined || row.checkin === 'not-posted') {
      excluded++;
      continue;
    }
    const group = level >= 2 ? strongGood : mightSkipped;
    group.checkins++;
    if (row.checkin === 'replies' || row.checkin === 'likes') group.successes++;
  }
  const result = strongGood.checkins < 15 || mightSkipped.checkins < 15 ? 'not enough yet'
    : strongGood.successes * mightSkipped.checkins > mightSkipped.successes * strongGood.checkins ? 'pass' : 'fail';
  console.log(JSON.stringify({ result, strongGood, mightSkipped, excluded }, null, 2));
  process.exitCode = result === 'pass' ? 0 : result === 'fail' ? 1 : 2;
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 3;
}

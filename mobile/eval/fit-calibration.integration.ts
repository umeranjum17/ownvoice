// Exercise the actual CLI on seeded files, including unequal group sizes and bad input.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Outcome } from '../src/core/store.ts';
import { LEVELS } from '../src/grow/fit.ts';

const scratch = mkdtempSync(join(tmpdir(), 'fit-calibration-'));
const file = join(scratch, 'reply-outcomes.json');
let id = 0;
const group = (count: number, successes: number, high: boolean): Outcome[] => Array.from({ length: count }, (_, i) => ({
  id: `Umer-${++id}`, platform: 'x', platformLabel: 'X', level: LEVELS[(high ? 2 : 0) + i % 2],
  card: i % 2 ? 'yours' : 'suggestion', slot: i % 2 ? -1 : 0, at: 1700000000000 + id,
  checkin: i < successes ? i % 2 ? 'likes' : 'replies' : 'nothing', checkinAt: 1700100000000 + id,
}));
function run(rows: unknown, status: number, result?: string) {
  const original = JSON.stringify(rows);
  writeFileSync(file, original);
  const command = spawnSync(process.execPath, [new URL('./fit-calibration.ts', import.meta.url).pathname, file], { encoding: 'utf8' });
  assert.equal(command.status, status, command.stderr || command.stdout);
  assert.equal(readFileSync(file, 'utf8'), original, 'calibration must not mutate the input');
  if (result) {
    const report = JSON.parse(command.stdout);
    assert.equal(report.result, result);
    console.log(command.stdout.trim());
    return report;
  }
  assert.match(command.stderr, /^error:/m);
  return command.stderr;
}
try {
  const high = group(15, 10, true), low = group(15, 5, false);
  const pass = run([...high, ...low], 0, 'pass');
  assert.deepEqual(pass.strongGood, { checkins: 15, successes: 10 });
  assert.deepEqual(pass.mightSkipped, { checkins: 15, successes: 5 });
  run([...group(30, 10, true), ...group(15, 6, false)], 1, 'fail'); // more successes, lower rate
  run([...group(15, 5, true), ...group(15, 5, false)], 1, 'fail'); // ties never pass
  run([...high.slice(1), ...low], 2, 'not enough yet');
  run([...high, ...low.slice(1)], 2, 'not enough yet');
  const noCheckin = { ...high[0], id: 'no-checkin', checkin: undefined, checkinAt: undefined };
  const excluded = [noCheckin, { ...high[0], id: 'not-posted', checkin: 'not-posted' },
    { ...high[0], id: 'unrated', level: null }, { ...high[0], id: 'unsure', level: 'Not sure about this one' }];
  assert.equal(run([...high, ...low, ...excluded], 0, 'pass').excluded, 4);
  run([...high.slice(1), ...low, ...excluded], 2, 'not enough yet');
  run([], 2, 'not enough yet');
  assert.match(run([...high, ...low, high[0]], 3), /duplicate insertion id/);
  assert.match(run([{ ...high[0], checkin: 'typo' }], 3), /unknown checkin value/);
  run({}, 3);
  run([null], 3);
  writeFileSync(file, '{broken');
  const malformed = spawnSync(process.execPath, [new URL('./fit-calibration.ts', import.meta.url).pathname, file], { encoding: 'utf8' });
  assert.equal(malformed.status, 3);
  assert.match(malformed.stderr, /^error:/m);
  console.log('CLI integration passed; seeded inputs unchanged.');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

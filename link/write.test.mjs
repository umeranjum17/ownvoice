import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { write } from './write.mjs';

const dir = mkdtempSync(join(tmpdir(), 'link-write-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const request = { instructions: 'Write drafts.', input: 'Sam: hi' };

function fakeClaude(name, body) {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

test('rejects a non-text field or input over the limit before starting Claude', async () => {
  const ran = join(dir, 'ran.txt');
  const claude = fakeClaude('never', `echo ran > "${ran}"`);
  await assert.rejects(async () => write({ instructions: 'x', input: 1 }, { claude }), { message: 'Bad request.' });
  await assert.rejects(async () => write({ instructions: 'x', input: 'a'.repeat(64_001) }, { claude }), { message: 'Bad request.' });
  assert.equal(existsSync(ran), false);
});

test('rejects instructions over the limit before starting Claude', async () => {
  const ran = join(dir, 'ran-instructions.txt');
  const claude = fakeClaude('never-instructions', `echo ran > "${ran}"`);
  await assert.rejects(async () => write({ instructions: 'a'.repeat(64_001), input: 'x' }, { claude }), { message: 'Bad request.' });
  assert.equal(existsSync(ran), false);
});

test('returns the answer without its code fence from a fresh folder that is removed afterwards', async () => {
  const seen = join(dir, 'ok-cwd.txt');
  const claude = fakeClaude('ok', `pwd > "${seen}"\ncat > /dev/null\nprintf '%s\\n' '\`\`\`json' '{"drafts":["a"]}' '\`\`\`'`);
  assert.deepEqual(await write(request, { claude }), { text: '{"drafts":["a"]}' });
  const cwd = readFileSync(seen, 'utf8').trim();
  assert.notEqual(cwd, dir);
  assert.equal(existsSync(cwd), false);
});

test('a failed run rejects and still removes its folder', async () => {
  const seen = join(dir, 'fail-cwd.txt');
  const claude = fakeClaude('fail', `pwd > "${seen}"\ncat > /dev/null\nexit 3`);
  await assert.rejects(async () => write(request, { claude }), { message: 'Claude did not answer.' });
  assert.equal(existsSync(readFileSync(seen, 'utf8').trim()), false);
});

test('a run past the timeout is stopped, rejects, and removes its folder', async () => {
  const seen = join(dir, 'slow-cwd.txt');
  const claude = fakeClaude('slow', `pwd > "${seen}"\nexec sleep 30`);
  const started = Date.now();
  await assert.rejects(async () => write(request, { claude, timeoutMs: 200 }), { message: 'Claude did not answer.' });
  assert.ok(Date.now() - started < 10_000);
  assert.equal(existsSync(readFileSync(seen, 'utf8').trim()), false);
});

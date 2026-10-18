import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codexAnswer } from './codex.ts';

const dir = mkdtempSync(join(tmpdir(), 'ownvoice-codex-'));
try {
  const argsPath = join(dir, 'args');
  const inputPath = join(dir, 'input');
  const fake = join(dir, 'codex');
  writeFileSync(fake, `#!/bin/sh\nprintf '%s\\n' "$@" > '${argsPath}'\ncat > '${inputPath}'\nprintf 'Fake Luna answer\\n'\n`);
  const { chmodSync } = await import('node:fs');
  chmodSync(fake, 0o755);
  assert.equal(await codexAnswer('write something', 220, fake), 'Fake Luna answer');
  const args = readFileSync(argsPath, 'utf8');
  assert.match(args, /--model\ngpt-6-luna/);
  assert.match(args, /--ephemeral/);
  assert.match(readFileSync(inputPath, 'utf8'), /within 220 tokens[\s\S]*write something/);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log('codex backend request/answer integration passed');

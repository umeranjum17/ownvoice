// The engine bundle must stay pure: only the compiled core files, no fetch,
// no expo*, no react-native, no @byokit/accounts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const dir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(dir, '..', 'package.json'));
const esbuild = require('esbuild');

const PURE = new Set([
  'dist/index.js',
  'dist/slop.js',
  'dist/voice.js',
  'dist/platforms.js',
  'dist/drafts.js',
  'dist/judge.js',
  'dist/words.js',
  'dist/threads.js',
  'dist/protocol.js',
].map(p => path.normalize(path.join(dir, '..', p))));

test('engine bundle has no impure imports', async () => {
  const result = await esbuild.build({
    entryPoints: [path.join(dir, '..', 'dist', 'index.js')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    metafile: true,
    write: false,
  });
  const inputs = Object.keys(result.metafile.inputs);
  assert.ok(inputs.length > 0, 'expected bundle inputs');
  for (const input of inputs) {
    const abs = path.normalize(path.resolve(path.join(dir, '..'), input));
    assert.ok(abs.startsWith(path.normalize(path.join(dir, '..')) + path.sep), `bundle escapes package dir: ${input}`);
    assert.ok(PURE.has(abs), `impure bundle input: ${input}`);
    assert.match(input, /^(?!.*(expo|react-native|@byokit|node_modules)).*$/, `banned input: ${input}`);
  }
  const out = result.outputFiles.map(f => f.text).join('\n');
  assert.ok(!/\bfetch\s*\(/.test(out), 'bundle calls fetch');
  for (const banned of ['fetch', 'expo', 'react-native', '@byokit/accounts']) {
    const pattern = new RegExp(`(?:from\\s+["']|require\\s*\\(\\s*["']|import\\s*\\(\\s*["'])[^"']*${banned.replace(/[^a-z]/gi, '.')}`);
    assert.ok(!pattern.test(out), `bundle imports ${banned}`);
  }
});

// The engine bundle must stay pure: only the compiled core files, no fetch,
// no expo*, no react-native, no @byokit/accounts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

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
  'dist/feed.js',
  'dist/protocol.js',
].map(p => path.normalize(path.join(dir, '..', p))));

test('engine bundle has no impure imports or fetch calls', async () => {
  const result = await esbuild.build({
    entryPoints: [path.join(dir, '..', 'dist', 'index.js')],
    bundle: true,
    platform: 'node',
    format: 'iife',
    globalName: 'Engine',
    metafile: true,
    write: false,
  });
  const inputs = Object.keys(result.metafile.inputs);
  assert.ok(inputs.length > 0, 'expected bundle inputs');
  for (const input of inputs) {
    const abs = path.normalize(path.resolve(path.join(dir, '..'), input));
    assert.ok(abs.startsWith(path.normalize(path.join(dir, '..')) + path.sep), `bundle escapes package dir: ${input}`);
    assert.ok(PURE.has(abs), `impure bundle input: ${input}`);
    for (const dependency of result.metafile.inputs[input].imports) {
      assert.equal(dependency.external, undefined, `external dependency: ${dependency.path}`);
    }
  }
  for (const output of Object.values(result.metafile.outputs)) {
    assert.deepEqual(output.imports, [], 'bundle retains external imports');
  }
  const fetchCalls = [];
  const context = {
    fetch: (...args) => {
      fetchCalls.push(args);
      throw new Error('engine must not fetch');
    },
  };
  runInNewContext(result.outputFiles[0].text, context);
  const { Protocol, Judge } = context.Engine;
  assert.equal(Protocol.hello().protocol, 1);
  const rules = Protocol.handle({
    verb: 'voice.parse', markdown: '**Never say:**\n* seamless\n\nZero em-dashes, ever.',
  }).rules;
  assert.equal(rules.noDashes, true);
  for (const post of [false, true]) {
    assert.equal(typeof Protocol.handle({ verb: 'voice.guide', rules, post }).line, 'string');
  }
  const platforms = Protocol.handle({ verb: 'platforms' });
  assert.equal(platforms.length, 6);
  for (const { id: platform, kind } of platforms) {
    for (const kind of ['reply', 'polish', 'post', 'thread']) {
      const brief = Protocol.handle({ verb: 'brief', kind, platform, rules });
      assert.ok(brief.lines.length > 0);
    }
    const checked = Protocol.handle({
      verb: 'check', platform, rules, original: 'Meet at 9 AM.',
      drafts: ['Meet at 9 AM.', 'A seamless plan — meet at 10 AM.'],
    });
    assert.equal(checked.length, 2);
    assert.ok(checked[1].added.includes('10 AM'));
    const split = Protocol.handle({ verb: 'split', platform, text: 'Shipped today. '.repeat(40) });
    if (kind === 'feed') assert.ok(split.posts.length > 0);
    else assert.equal(split.error.code, 'bad-request');
  }
  for (const request of [{}, { verb: 'unknown' }, { verb: 'check', drafts: [] }]) {
    assert.ok(Protocol.handle(request).error);
  }
  const rewritten = await Judge.rewrite(
    { ask: async () => JSON.stringify({ versions: ['Hello.', 'Hi.', 'Hey.'] }) },
    'Hello.', '', '', () => {},
  );
  assert.equal(rewritten.length, 2);
  assert.deepEqual(fetchCalls, [], 'engine called fetch');
});

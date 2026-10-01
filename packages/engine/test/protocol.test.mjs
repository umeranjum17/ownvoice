// OV-3 protocol tests: one case per verb, reusing the mobile suite's
// expectations (SlopTest, VoiceTest, DraftsTest, PlatformsTest, ThreadsTest).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle, hello, PROTOCOL, VERSION } from '../dist/protocol.js';

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '..');
const bin = join(root, 'dist', 'cli.mjs');
// The bin exits 1 on error envelopes, so read stdout either way.
const run = (input, args = []) => {
  try {
    return execFileSync(process.execPath, [bin, ...args], { input, encoding: 'utf8' });
  } catch (e) {
    if (typeof e.stdout === 'string' && e.stdout) return e.stdout;
    throw e;
  }
};
const ask = (request) => JSON.parse(run(JSON.stringify(request)));

test('hello carries protocol 2 and the package version', () => {
  assert.equal(hello().protocol, 2);
  assert.equal(hello().version, JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version);
  assert.equal(VERSION, hello().version);
  assert.equal(PROTOCOL, 2);
});

test('voice.parse imports never-say bullets and rules (VoiceTest)', () => {
  const res = ask({ verb: 'voice.parse', markdown: '**Never say:**\n* per my last email\n\nZero em-dashes, ever.' });
  assert.deepEqual(res.rules.never, ['per my last email']);
  assert.equal(res.rules.noDashes, true);
  assert.equal(typeof res.skipped, 'number');
});

test('voice.guide is short and skips endings in replies (VoiceTest)', () => {
  const rules = { never: [], noDashes: true, statementEndings: true, note: 'short, lowercase' };
  assert.equal(ask({ verb: 'voice.guide', rules, post: false }).line, 'No em dashes. How they write: short, lowercase');
  assert.equal(ask({ verb: 'voice.guide', rules, post: true }).line, 'No em dashes. End on a statement, not a question. How they write: short, lowercase');
  assert.equal(ask({ verb: 'voice.guide', rules: { never: [], noDashes: false, statementEndings: false, note: '' }, post: true }).line, '');
});

test('platforms lists the six places with slots and polish (PlatformsTest)', () => {
  const res = ask({ verb: 'platforms' });
  assert.deepEqual(res.map(p => p.id), ['x', 'linkedin', 'reddit', 'slack', 'whatsapp', 'gmail']);
  const byId = Object.fromEntries(res.map(p => [p.id, p]));
  assert.equal(byId.x.limit, 280);
  assert.equal(byId.linkedin.limit, 3000);
  assert.equal(byId.reddit.limit, 10000);
  assert.equal(byId.gmail.limit, null);
  assert.deepEqual(byId.x.slots, [
    'Agree and add one concrete detail from the post.',
    'Push back kindly, with one reason from the post.',
    'Ask one sharp question about the post.',
  ]);
  assert.match(byId.x.polish, /the first line must stand alone/);
  assert.match(byId.gmail.polish, /Keep the greeting and the sign-off/);
});

test('brief reply carries the platform slots; polish carries its polish rule', () => {
  const reply = ask({ verb: 'brief', kind: 'reply', platform: 'x' });
  assert.ok(reply.lines.includes('Agree and add one concrete detail from the post.'));
  assert.ok(reply.lines.includes('On X: each draft fits one post (280).'));
  const polish = ask({ verb: 'brief', kind: 'polish', platform: 'x' });
  assert.ok(polish.lines.includes('On X: each draft fits one post (280).'));
  assert.ok(polish.lines.some(l => l.includes('the first line must stand alone')));
  const post = ask({ verb: 'brief', kind: 'post', platform: 'linkedin', rules: { never: [], noDashes: true, statementEndings: true, note: '' } });
  assert.ok(post.lines.some(l => l.includes('End on a statement, not a question')));
  const thread = ask({ verb: 'brief', kind: 'thread', platform: 'reddit' });
  assert.ok(thread.lines.some(l => l.includes('10000')));
});

test('check flags stock phrasing and fits the cap (SlopTest, PlatformsTest)', () => {
  const [clean] = ask({ verb: 'check', drafts: ["Saturday works.\nI'll bring the stove."], platform: 'x' });
  assert.equal(clean.fits, true);
  assert.equal(clean.length, "Saturday works.\nI'll bring the stove.".length);
  assert.equal(clean.limit, 280);
  assert.deepEqual(clean.voice, []);
  assert.deepEqual(clean.stock, []);
  assert.equal(clean.layoutKept, true);
  assert.equal(clean.words, 'Sounds natural');
  const [stock] = ask({ verb: 'check', drafts: ["Let's delve in. It's a game-changer, seamless and cutting-edge."], platform: 'x' });
  assert.deepEqual(stock.stock, ['delve', 'game-changer', 'seamless', 'cutting-edge']);
  assert.equal(stock.words, 'A bit stock');
  const [long] = ask({ verb: 'check', drafts: [`${'x'.repeat(280)}.`], platform: 'x' });
  assert.equal(long.fits, false);
  assert.equal(long.length, 281);
});

test('check names rule breaks and kept/dropped facts in plain words', () => {
  const rules = { never: ['circle the wagons'], noDashes: true, statementEndings: false, note: '' };
  const [res] = ask({ verb: 'check', drafts: ["Let's circle the wagons — who's in?"], platform: 'x', rules, original: "Let's meet — who's in?" });
  assert.ok(res.voice.some(v => v.includes('circle the wagons')));
  assert.ok(res.voice.some(v => v.includes('long dash')));
  assert.deepEqual(res.added, []);
  const [added] = ask({ verb: 'check', drafts: ['My flight is at 10 AM, ride please'], platform: 'x', original: 'My flight is tomorrow, ride please' });
  // addedNumbers sees the bare 10, inventedTimes the full 10 AM: the union of both.
  assert.deepEqual(added.added, ['10', '10 AM']);
  const [dropped] = ask({ verb: 'check', drafts: ['We grew a lot last year'], platform: 'x', original: 'We grew 40 percent last year' });
  assert.deepEqual(dropped.dropped, ['40']);
  const [layout] = ask({
    verb: 'check', drafts: ['I can bring the stove, and you the tent.'], platform: 'x',
    original: 'I can bring the stove.\n1. I will bring the stove.\n2. You can bring the tent.',
  });
  assert.equal(layout.layoutKept, false);
});

test('split threads a long post under the cap (ThreadsTest)', () => {
  const short = ask({ verb: 'split', text: 'Shipped the fix today.', platform: 'x' });
  assert.deepEqual(short.posts, ['Shipped the fix today.']);
  const typed = 'Shipped our offline notes app today after six months of weekend work. It keeps everything in SQLite on the phone, so there is no account and no sign-in. Search is instant even with ten thousand notes, and it works on a plane. Backups are plain files you can read anywhere. The whole app is under five megabytes.';
  const { posts } = ask({ verb: 'split', text: typed, platform: 'x' });
  assert.ok(posts.length > 1);
  for (const post of posts) assert.ok(post.length <= 280, `over cap: ${post}`);
  assert.match(posts[0], /^1\/\d+ /);
  assert.equal(posts.map(p => p.replace(/^\d+\/\d+ /, '')).join(' '), typed);
});

test('bad input gets the error envelope', () => {
  for (const bad of [
    { verb: 'nope' },
    { verb: 'check', drafts: [], platform: 'x' },
    { verb: 'check', drafts: ['hi'], platform: 'mars' },
    { verb: 'brief', kind: 'reply', platform: 'mars' },
    { verb: 'split', text: 'hi', platform: 'gmail' },
    { verb: 'voice.parse' },
    {},
    [],
    'hi',
  ]) {
    const res = ask(bad);
    assert.ok(res.error && typeof res.error.code === 'string' && typeof res.error.message === 'string', `no envelope for ${JSON.stringify(bad)}`);
  }
  assert.equal(ask({ verb: 'nope' }).error.code, 'unknown-verb');
  assert.equal(ask({}).error.code, 'bad-request');
});

test('schema verb prints the committed schema file', () => {
  const fromBin = JSON.parse(run('', ['schema']));
  const fromFile = JSON.parse(readFileSync(join(root, 'protocol', 'schema.json'), 'utf8'));
  assert.deepEqual(fromBin, fromFile);
  assert.ok(fromBin.oneOf.some(o => o.title === 'check'));
});

test('bin hello and stdin round-trip work end to end', () => {
  assert.deepEqual(JSON.parse(run('', ['hello'])), hello());
  assert.deepEqual(
    JSON.parse(run(JSON.stringify({ verb: 'voice.guide', rules: { never: [], noDashes: true, statementEndings: false, note: '' } }))),
    { line: 'No em dashes.' },
  );
  assert.throws(() => execFileSync(process.execPath, [bin], { input: 'not json', encoding: 'utf8' }), /Command failed/);
});

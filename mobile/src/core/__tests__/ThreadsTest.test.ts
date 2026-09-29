import { canThread, cleanThread, fallbackThread, splitThread, threadCopy, threadLimit, threadPrompt } from '../threads';
import { platformForApp } from '../platforms';
import { technicalWords } from '../words';
import { cases } from '../../../eval/cases';

const x = platformForApp('com.twitter.android');
const linkedin = platformForApp('com.linkedin.android');

test('only typed text threads; feed places give their cap', () => {
  expect(canThread('')).toBe(false);
  expect(canThread('   ')).toBe(false);
  expect(canThread('an idea')).toBe(true);
  expect(threadLimit(x)).toBe(280);
  expect(threadLimit(linkedin)).toBe(3000);
  expect(threadLimit(platformForApp('com.reddit.frontpage'))).toBe(10000);
  expect(threadLimit(platformForApp('com.Slack'))).toBeNull();
  expect(threadLimit(platformForApp('com.google.android.gm'))).toBeNull();
  expect(threadLimit()).toBeNull();
});

test('a short post stays one unnumbered part, word for word', () => {
  expect(splitThread('Shipped the fix today.', 280)).toEqual(['Shipped the fix today.']);
});

test('a long post splits at sentence ends, every part within the cap', () => {
  const typed = 'Shipped our offline notes app today after six months of weekend work. It keeps everything in SQLite on the phone, so there is no account and no sign-in. Search is instant even with ten thousand notes, and it works on a plane. Backups are plain files you can read anywhere. The whole app is under five megabytes.';
  const parts = splitThread(typed, 280);
  expect(parts.length).toBeGreaterThan(1);
  for (const part of parts) expect(part.length).toBeLessThanOrEqual(280);
  expect(parts[0]).toMatch(/^1\/\d+ /);
  expect(parts.at(-1)).toMatch(new RegExp(`^${parts.length}/${parts.length} `));
  // Sentence ends kept: no part but the last ends mid-sentence.
  for (const part of parts.slice(0, -1)) expect(part.replace(/^\d+\/\d+ /, '')).toMatch(/[.!?]$/);
  // Nothing lost or added across the parts.
  expect(parts.map(part => part.replace(/^\d+\/\d+ /, '')).join(' ')).toBe(typed);
});

test('parts that only just fit still fit once numbered', () => {
  const typed = `${'a'.repeat(270)}. ${'b'.repeat(270)}.`;
  const parts = splitThread(typed, 280);
  expect(parts.length).toBe(2);
  for (const part of parts) expect(part.length).toBeLessThanOrEqual(280);
});

test('the prompt names the cap and forbids inventing', () => {
  const prompt = threadPrompt('Shipped it today', x);
  expect(prompt).toContain('280');
  expect(prompt).toContain('{"parts":["..."],"hooks":["...","...","..."]}');
  expect(prompt).toContain('never write from nothing');
  expect(prompt).toContain('add none');
});

const answer = (parts: string[], hooks: string[]) =>
  `{"parts":[${parts.map(part => JSON.stringify(part)).join(',')}],"hooks":[${hooks.map(hook => JSON.stringify(hook)).join(',')}]}`;

const TYPED = 'Shipped our offline notes app today. It keeps everything in SQLite on the phone. Search is instant.';
const HOOKS = ['Shipped our offline notes app today.', 'It keeps everything in SQLite on the phone.', 'Search is instant.'];

test('a faithful answer passes and comes back numbered', () => {
  const thread = cleanThread(answer(TYPED.split('. ').map(s => s.replace(/\.$/, '') + '.'), HOOKS), TYPED, 280);
  expect(thread?.parts).toEqual(['1/3 Shipped our offline notes app today.', '2/3 It keeps everything in SQLite on the phone.', '3/3 Search is instant.']);
  expect(thread?.hooks).toEqual(HOOKS);
});

test('the fact check rejects invented numbers, dropped words and long parts', () => {
  const parts = ['Shipped our offline notes app today.', 'It keeps everything in SQLite on the phone.', 'Search is instant.'];
  expect(cleanThread(answer(['Shipped our offline notes app today with 500 users.', ...parts.slice(1)], HOOKS), TYPED, 280)).toBeNull();
  expect(cleanThread(answer(parts.slice(0, 2), HOOKS), TYPED, 280)).toBeNull();
  expect(cleanThread(answer([...parts.slice(0, 2), `${'x'.repeat(279)}.`, parts[2]], HOOKS), TYPED, 280)).toBeNull();
  expect(cleanThread(answer(parts, ['Shipped our amazing offline notes app today.', ...HOOKS.slice(1)]), TYPED, 280)).toBeNull();
  expect(cleanThread(answer(parts, HOOKS.slice(0, 2)), TYPED, 280)).toBeNull();
  expect(cleanThread('not json', TYPED, 280)).toBeNull();
});

test('the fallback keeps every word within the cap with hooks from their lines', () => {
  const typed = 'Shipped our offline notes app today after six months of weekend work. It keeps everything in SQLite on the phone, so there is no account and no sign-in. Search is instant even with ten thousand notes, and it works on a plane. Backups are plain files you can read anywhere. It costs four pounds, once, and that is it.';
  const thread = fallbackThread(typed, 280);
  expect(thread.parts.length).toBeGreaterThan(1);
  for (const part of thread.parts) expect(part.length).toBeLessThanOrEqual(280);
  expect(thread.parts.map(part => part.replace(/^\d+\/\d+ /, '')).join(' ')).toBe(typed);
  expect(thread.hooks).toHaveLength(3);
});

test('double-spaced text past the cap still comes back within it', () => {
  const parts = splitThread('abcd\n\n'.repeat(48), 280);
  expect(parts.length).toBeGreaterThanOrEqual(1);
  for (const part of parts) expect(part.length).toBeLessThanOrEqual(280);
});

test('fallback padding never adds a word they did not type', () => {
  const typed = `${'a'.repeat(139)} ${'b'.repeat(140)}`;
  const thread = fallbackThread(typed, 280);
  expect(thread.hooks).toHaveLength(3);
  const vocabulary = new Set(typed.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  for (const hook of thread.hooks) {
    expect(hook.length).toBeLessThanOrEqual(280);
    const terms = hook.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    expect(terms.length).toBeGreaterThan(0);
    for (const term of terms) expect(vocabulary.has(term)).toBe(true);
  }
});

test('the LinkedIn eval case is long enough to split', () => {
  const t02: any = cases.find(c => c.id === 'H02-linkedin-thread');
  expect(splitThread(t02.typed, 3000).length).toBeGreaterThan(1);
});

test('a spaceless token past the cap stays whole with no minted hook words', () => {
  const typed = 'a'.repeat(300);
  const thread = fallbackThread(typed, 280);
  expect(thread.parts).toEqual([typed]);
  const vocabulary = new Set(typed.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  expect(thread.hooks.length).toBeLessThanOrEqual(3);
  for (const hook of thread.hooks) {
    const terms = hook.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    expect(terms.length).toBeGreaterThan(0);
    for (const term of terms) expect(vocabulary.has(term)).toBe(true);
  }
});

test('a long link never splits mid-token and mints no hook words', () => {
  const typed = `https://${'x'.repeat(292)}`;
  expect(typed).toHaveLength(300);
  const thread = fallbackThread(typed, 280);
  expect(thread.parts).toEqual([typed]);
  const vocabulary = new Set(typed.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  for (const hook of thread.hooks) {
    const terms = hook.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    for (const term of terms) expect(vocabulary.has(term)).toBe(true);
  }
});

test('the thread copy stays plain', () => {
  expect(Object.values(threadCopy).length).toBeGreaterThan(0);
  expect(Object.values(threadCopy).filter(line => technicalWords.test(line))).toEqual([]);
});

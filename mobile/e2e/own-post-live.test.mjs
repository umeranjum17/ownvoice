// Host-side checks for the pure draft checks of the live own-posts leg. The pieces that need the
// emulator (the connect walk, the panel) are proven by the run itself; these pin the bar's rules.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { checkDraft, tooSimilar, draftTexts, REALISTIC_LINE, LONGEST_LINE } from './own-post-live.mjs';

test('a draft on the line passes and keeps the shared words', () => {
  const check = checkDraft('shipped offline notes for my app this week', 'Shipped offline notes for my app this week, and I learned a lot.');
  assert.equal(check.onTopic, true);
  assert.equal(check.within280, true);
  assert.equal(check.placeholder, false);
  assert.equal(check.markdown, false);
  assert.equal(check.chatter, null);
  assert.ok(check.shared.includes('offline'));
});

test('an off-topic draft fails, even when it is long and clean', () => {
  const check = checkDraft('shipped offline notes for my app this week', 'The weather turned cold and the garden needs a good tidy this weekend.');
  assert.equal(check.onTopic, false);
});

test('over 280 characters fails', () => {
  const check = checkDraft('shipped offline notes for my app this week', `Shipped offline notes ${'and '.repeat(70)}`);
  assert.equal(check.within280, false);
});

test('a placeholder or a "**" fails', () => {
  assert.equal(checkDraft('offline notes for the app this week', 'Shipped offline notes for [your app] this week.').placeholder, true);
  assert.equal(checkDraft('offline notes for the app this week', 'Shipped **offline notes** for the app this week.').markdown, true);
});

test('assistant chatter fails', () => {
  assert.equal(checkDraft('offline notes for the app this week', 'Here are three ways to ship offline notes for the app this week.').chatter, '^here (are|is|\'s)\\b');
  assert.equal(checkDraft('offline notes for the app this week', 'As an AI, I shipped offline notes for the app this week.').chatter, '\\bas an ai\\b');
});

test('the longest line is the extreme case, and stays within the cap', () => {
  assert.ok(LONGEST_LINE.length > 200 && LONGEST_LINE.length <= 280);
  assert.ok(checkDraft(LONGEST_LINE, `Shipped ${LONGEST_LINE.toLowerCase()}`).onTopic);
});

test('two drafts that differ by one word are too similar', () => {
  assert.equal(tooSimilar('Shipped offline notes this week', 'Shipped offline notes this week'), true);
  assert.equal(tooSimilar('Shipped offline notes this week', 'Shipped offline notes next week'), true);
  assert.equal(tooSimilar('Shipped offline notes this week', 'Offline notes shipped, and it was a good week'), false);
});

test('draftTexts keeps the drafts and drops the line, headings, notes and cards', () => {
  const line = REALISTIC_LINE;
  const nodes = [
    { text: 'Polish your post' },
    { text: 'Pick one to use instead of what you wrote. You send it yourself.' },
    { text: line },
    { text: 'Shorter' },
    { text: 'Main point first' },
    { text: 'Shipped offline notes this week, and the app feels faster.' },
    { text: 'Offline notes shipped: the sync finally works.' },
    { text: 'Use this' },
  ];
  assert.deepEqual(draftTexts(nodes, line), [
    'Shipped offline notes this week, and the app feels faster.',
    'Offline notes shipped: the sync finally works.',
  ]);
});

test('draftTexts tolerates a uppercase card label and ignores the typed line', () => {
  const line = 'shipping offline notes';
  const nodes = [{ text: 'CLEANED UP' }, { text: line }, { text: 'Shipping offline notes, and I learned a lot along the way.' }];
  assert.deepEqual(draftTexts(nodes, line), ['Shipping offline notes, and I learned a lot along the way.']);
});

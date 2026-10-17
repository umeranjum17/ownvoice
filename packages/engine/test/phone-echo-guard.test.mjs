// Phone echo guard: a draft that echoes the slot instructions never shows. Plain answers and clean
// drafts still do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptReplies } from '../dist/drafts.js';
import { platformForApp } from '../dist/platforms.js';

const slots = platformForApp('com.twitter.android').slots;
const point = 'honestly no worries, take your time';
const accept = (candidates, p = point) => acceptReplies(candidates, [], 3, 'remove', [], [], p, slots);

test('a numbered echo of the slot instructions is dropped', () => {
  const echo = [
    '1. Agree and add one concrete detail from the post.',
    '2. Push back kindly, with one reason from the post.',
    '3. Ask one sharp question about the post.',
  ].join('\n');
  assert.deepEqual(accept([echo]), []);
});

test('a slot echo whose hyphen became a space is dropped', () => {
  const linkedin = platformForApp('com.linkedin.android').slots;
  assert.deepEqual(acceptReplies(['Ask one follow up question.'], [], 3, 'remove', [], [], point, linkedin), []);
});

test('a slot echo with no space after its colon shows no slot text', () => {
  const [card] = accept(['Ask one sharp question about the post:What time works?']);
  assert.ok(!card || !/ask one sharp question/i.test(card));
});

test('a lowercase slot echo mid-text is dropped', () => {
  assert.deepEqual(accept(['great point, thanks.\nagree and add one concrete detail from the post.']), []);
});

test('a plain Sure answer with a colon is kept', () => {
  const [card] = accept(['Sure, here is the address: 12 Elm St.'], "what's your address?");
  assert.equal(card, 'Sure, here is the address: 12 Elm St.');
});

test('a short post does not drop a reply that contains it inside a word', () => {
  const reply = 'Sure, here is the address: 12 Brooklyn Ave.';
  assert.equal(accept([reply], 'ok')[0], reply);
});

test('a plain Sure reply is kept', () => {
  assert.equal(accept(['Sure, see you then.'])[0], 'Sure, see you then.');
});

test('a numbered line that is not a slot is kept', () => {
  assert.equal(accept(['1. the venue']).filter(Boolean).length, 1);
});

test('a clean draft is kept', () => {
  const clean = "honestly, let's push the call to friday. my morning is full.";
  assert.equal(accept([clean])[0], clean);
});

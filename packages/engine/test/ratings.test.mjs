import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Platforms, Ratings } from '../dist/index.js';

const X = Platforms.platformForApp('com.twitter.android');
const POST = 'Shipping one small fix beats another week polishing the launch page.';

test('a reply whose post could not be read says so and compares nothing', () => {
  const r = Ratings.rate('Shipping one small fix beats polishing the launch page. @someone agrees', X, '');
  assert.deepEqual(r.engagement.unknown, [Ratings.REACH_UNKNOWN, Ratings.POST_UNREAD]);
  assert.ok(!r.engagement.signals.some(s => /Tags people/.test(s.text)));
  assert.ok(!r.stock.signals.some(s => /post's words/.test(s.text)));
});

test('a new post has no parent: no missing-post line and no comparison', () => {
  const r = Ratings.rate('Shipping one small fix beats polishing the launch page.', X, null);
  assert.deepEqual(r.engagement.unknown, [Ratings.REACH_UNKNOWN]);
  assert.equal(r.stock.level, 'none');
});

test('no text signal rates a draft up: clean drafts are only ever Nothing flagged', () => {
  for (const draft of ['Did the drop come before or after your pricing change?', 'Great post! Purple turbines whisper banana logistics.', 'Week twelve is where retention showed up.']) {
    const r = Ratings.rate(draft, X, POST);
    assert.equal(r.engagement.level, 'none', draft);
    assert.equal(r.engagement.label, 'Nothing flagged');
  }
  assert.equal(Ratings.rate('See https://example.com', X, POST).engagement.label, 'Holds it back');
});

test('chats, mail and unknown apps get no ratings', () => {
  for (const app of ['com.whatsapp', 'com.google.android.gm', 'com.example.other']) assert.equal(Ratings.rate('Hi there', Platforms.platformForApp(app), POST), null);
});

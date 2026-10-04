import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Platforms, Ratings } from '../dist/index.js';

const X = Platforms.platformForApp('com.twitter.android');
const POST = 'Shipping one small fix beats another week polishing the launch page.';

test('a reply whose post could not be read says so and compares nothing', () => {
  const r = Ratings.rate('Shipping one small fix beats polishing the launch page. @someone agrees', X, '');
  assert.deepEqual(r.engagement.unknown, [Ratings.REACH_UNKNOWN, Ratings.POST_UNREAD]);
  assert.ok(!r.engagement.signals.some(s => /Tags people/.test(s.text)));
  assert.ok(!r.stock.signals.some(s => /wording with the post/.test(s.text)));
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
});

test('a link is a caution to check, never a claimed loss of reach', () => {
  const r = Ratings.rate('See https://example.com', X, POST);
  assert.equal(r.engagement.label, 'Worth a second look');
  assert.deepEqual(r.engagement.signals, [{ concern: true, text: 'Has a link' }]);
  assert.doesNotMatch(JSON.stringify(r), /hold|fewer|less|(?<!predict )reach\b|views|penal/i);
});

test('tags match whole handles only', () => {
  const tags = (draft, post) => Ratings.rate(draft, X, post).engagement.signals.some(s => /Tags people/.test(s.text));
  assert.equal(tags('@alice agreed with this', 'Thanks @alice2 for the launch notes.'), true);
  assert.equal(tags('@alice2 agreed with this', 'Thanks @alice2 for the launch notes.'), false);
  assert.equal(tags('@Alice2 agreed with this', 'Thanks @alice2 for the launch notes.'), false);
  assert.equal(tags('@alice2 agreed with this', 'Thanks @alice for the launch notes.'), true);
  assert.equal(tags('u/bob agreed with this', 'Posted by u/alice\nThanks for the launch notes.'), true);
  assert.equal(tags('u/alice agreed with this', 'Posted by u/alice\nThanks for the launch notes.'), false);
});

test('handles inside links are not tags, on either side', () => {
  const signals = (draft, post) => Ratings.rate(draft, X, post).engagement.signals;
  const tags = (draft, post) => signals(draft, post).some(s => /Tags people/.test(s.text));
  assert.equal(tags('See https://youtube.com/@somechannel', POST), false);
  assert.deepEqual(signals('See https://youtube.com/@somechannel', POST), [{ concern: true, text: 'Has a link' }]);
  assert.equal(tags('See https://reddit.com/u/bob', POST), false);
  assert.equal(tags('@somechannel agreed with this', 'See https://youtube.com/@somechannel'), true);
});

test("the overlap counts the draft's words found in the post, not the other way round", () => {
  const shares = (draft, post) => Ratings.rate(draft, X, post).stock.signals.some(s => /wording with the post/.test(s.text));
  // A short draft made of the post's words shares its wording, even though it covers little of a long post.
  assert.equal(shares('Shipping small fixes beats polishing launch pages.', `${POST} Retention matters more than traffic when pricing changes every quarter.`), true);
  // A draft that quotes the whole post but adds more of its own does not.
  assert.equal(shares(`${POST} Retention cohorts, churn surveys, onboarding emails, pricing experiments and weekly interviews taught us more.`, POST), false);
});

test('chats, mail and unknown apps get no ratings', () => {
  for (const app of ['com.whatsapp', 'com.google.android.gm', 'com.example.other']) assert.equal(Ratings.rate('Hi there', Platforms.platformForApp(app), POST), null);
});

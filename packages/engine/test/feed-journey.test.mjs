// Real public module seam: read a visible post, prepare its prompt, then assess
// a reply against that same post. No writer/network stand-ins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Feed, Platforms, Drafts, Ratings } from '../dist/index.js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const node = (text, top, clickable = false, extra = {}) => ({ text, top, bottom: top + 20, left: 16, clickable, ...extra });
const ask = request => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../dist/cli.mjs', import.meta.url))], { input: JSON.stringify(request), encoding: 'utf8' });
  assert.ok([0, 1].includes(result.status), result.stderr);
  return JSON.parse(result.stdout);
};

test('imported reply samples survive the real CLI parse, guide and brief journey', () => {
  const { rules } = ask({ verb: 'voice.parse', markdown: '## How I reply\n- tried it today.\n- say more?\n\n## Never say\n- synergy' });
  assert.deepEqual(rules.samples, ['tried it today.', 'say more?']);
  const { line } = ask({ verb: 'voice.guide', rules });
  assert.ok(line.includes('tried it today.'));
  assert.ok(line.includes('say more?'));
  assert.ok(ask({ verb: 'brief', kind: 'reply', platform: 'x', rules }).lines.includes(line));
  const [checked] = ask({ verb: 'check', platform: 'x', rules, drafts: ['synergy'] });
  assert.ok(checked.voice.some(reason => reason.includes('synergy')));
  assert.equal(ask({ verb: 'voice.guide', rules: { ...rules, samples: ['bad\0text'] } }).error.code, 'bad-request');
});

test('visible feed context travels through the public prompt and ratings boundary', () => {
  for (const [url, id, header] of [
    ['https://x.com/umer/status/1', 'x', '@umer • 2h'],
    ['https://www.reddit.com/r/demo/comments/1', 'reddit', 'u/umer • 2h'],
  ]) {
    const screen = [
      node(url, 0, false, { viewId: Platforms.CHROME_URL_BAR }),
      node(header, 80, true),
      node('Shipping a timer that pauses when Umer switches apps.', 120),
      node('12 likes', 160, true),
      node('Umer’s reply', 240),
    ];
    const platform = Platforms.platformForApp('com.android.chrome', screen);
    assert.equal(platform.id, id);
    const context = Feed.feedRead(screen, 220);
    assert.equal(context.post, screen[2].text);
    assert.ok(context.author.includes('umer'));
    const prompt = Drafts.replyPrompt({ latest: context.post, conversation: context.post, platform, dashes: 'remove' });
    assert.ok(prompt.includes(context.post));
    assert.ok(prompt.includes(platform.slots[0]));
    const assessment = Ratings.rate('Does it pause while reading https://example.com?', platform, context.post);
    assert.ok(assessment.engagement.signals.some(signal => signal.text === 'Has a link'));
    assert.ok(!assessment.engagement.unknown.includes(Ratings.POST_UNREAD));
    assert.ok(Ratings.rate('Does it pause?', platform, '').engagement.unknown.includes(Ratings.POST_UNREAD));
  }
});

test('a header-led post with no readable body reads as no post, so a reply cannot be invented', () => {
  const screen = [
    node('https://x.com/umer/status/2', 0, false, { viewId: Platforms.CHROME_URL_BAR }),
    node('@umer • 2h', 80),
    node('231 likes', 160, true),
  ];
  const context = Feed.feedRead(screen, 220);
  assert.equal(context.post, '');
  assert.deepEqual(Feed.feedRead([node('Umer @umer · 2h', 40), node('18 replies', 80, true)], 250), { post: '' });
});

test('a feed screen segments into the posts one tap rates, skipping an image-only post', () => {
  const screen = [
    node('@umer · 2h', 20), node('Shipping a timer that pauses when Umer switches apps.', 60), node('12 likes', 100, true),
    node('@sam · 5h', 140), node('Anyone found a timer that stays quiet in a meeting?', 180), node('4 replies', 220, true),
  ];
  assert.deepEqual(Feed.feedPosts(screen, 260).map(post => [post.author, post.post]), [
    ['@umer', 'Shipping a timer that pauses when Umer switches apps.'],
    ['@sam', 'Anyone found a timer that stays quiet in a meeting?'],
  ]);
  // Its author line is not a post to answer, and the visible reply count is never rated as one either.
  assert.deepEqual(Feed.feedPosts([node('@umer · 2h', 20), node('231 likes', 60, true)], 300), []);
});

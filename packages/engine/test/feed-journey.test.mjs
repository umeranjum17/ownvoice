// Real public module seam: read a visible post, prepare its prompt, then assess
// a reply against that same post. No writer/network stand-ins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Feed, Platforms, Drafts, Ratings } from '../dist/index.js';

const node = (text, top, clickable = false, extra = {}) => ({ text, top, bottom: top + 20, left: 16, clickable, ...extra });

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

import { CHROME_URL_BAR, DEFAULT_PLATFORM, platformForApp, platformLine, polishLine, slotsFor } from '../platforms';
import { phoneReplyPrompt, phoneSlotPrompt, replyPrompt, REPLY_SLOTS } from '../drafts';
import { lineRetryPrompt, rewritePrompt, scoreDraft, versionPrompt, versionsList } from '../judge';

test('each default-on app maps to its platform, everything else keeps the old rule', () => {
  expect(platformForApp('com.twitter.android')).toMatchObject({ id: 'x', kind: 'feed', limit: 280 });
  expect(platformForApp('com.linkedin.android')).toMatchObject({ id: 'linkedin', kind: 'feed', limit: 3000 });
  expect(platformForApp('com.reddit.frontpage')).toMatchObject({ id: 'reddit', kind: 'feed', limit: 10000 });
  expect(platformForApp('com.Slack')).toMatchObject({ id: 'slack', kind: 'chat', limit: 40000 });
  expect(platformForApp('com.whatsapp')).toMatchObject({ id: 'whatsapp', kind: 'chat' });
  expect(platformForApp('com.whatsapp.w4b')).toMatchObject({ id: 'whatsapp', kind: 'chat' });
  expect(platformForApp('com.google.android.gm')).toMatchObject({ id: 'gmail', kind: 'mail', limit: null });
  expect(platformForApp('com.example.other')).toBe(DEFAULT_PLATFORM);
  expect(platformForApp()).toBe(DEFAULT_PLATFORM);
  expect(platformForApp(null)).toBe(DEFAULT_PLATFORM);
});

test('the prompt line names the place and its cap, and stays empty otherwise', () => {
  expect(platformLine(platformForApp('com.twitter.android'))).toBe('On X: each draft fits one post (280).');
  expect(platformLine(platformForApp('com.whatsapp'))).toBe('On WhatsApp: each draft fits one message (65536).');
  expect(platformLine(platformForApp('com.google.android.gm'))).toBe('');
  expect(platformLine(DEFAULT_PLATFORM)).toBe('');
  expect(platformLine()).toBe('');
});

test('Chrome maps a post URL bar to its platform by whole host', () => {
  const bar = (text: string) => [{ text, viewId: CHROME_URL_BAR, top: 0, bottom: 1 }] as any;
  expect(platformForApp('com.android.chrome', bar('linkedin.com/in/post/123'))).toMatchObject({ id: 'linkedin' });
  expect(platformForApp('com.android.chrome', bar('https://www.linkedin.com/posts/abc'))).toMatchObject({ id: 'linkedin' });
  expect(platformForApp('com.android.chrome', bar('x.com/umerdemo/status/1'))).toMatchObject({ id: 'x' });
  expect(platformForApp('com.android.chrome', bar('linkedin.com.evil.example'))).toBe(DEFAULT_PLATFORM);
  expect(platformForApp('com.android.chrome', [])).toBe(DEFAULT_PLATFORM);
});

test('reply prompts carry the platform only when known', () => {
  const input = { latest: 'Sam: Saturday?', conversation: 'Sam: Saturday?', dashes: 'remove' as const };
  expect(replyPrompt(input)).not.toContain('On X:');
  expect(replyPrompt({ ...input, platform: platformForApp('com.twitter.android') })).toContain('On X: each draft fits one post (280).');
  const phone = { latest: 'Sam: Saturday?', conversation: 'Sam: Saturday?' };
  expect(phoneReplyPrompt(phone)).not.toContain('On ');
  expect(phoneReplyPrompt({ ...phone, platform: platformForApp('com.linkedin.android') })).toContain('On LinkedIn: each draft fits one post (3000).');
  expect(phoneSlotPrompt(REPLY_SLOTS[0], phone, [])).not.toContain('On ');
  expect(phoneSlotPrompt(REPLY_SLOTS[0], { ...phone, platform: platformForApp('com.Slack') }, [])).toContain('On Slack:');
});

test('polish prompts carry the platform only when known', () => {
  const x = platformForApp('com.twitter.android');
  expect(rewritePrompt('See you soon', 'Sam: Saturday?')).not.toContain('On X:');
  expect(rewritePrompt('See you soon', 'Sam: Saturday?', '', 'remove', x)).toContain('On X: each draft fits one post (280).');
  expect(versionPrompt('See you soon', 'Sam: Saturday?', versionsList[0])).not.toContain('On X:');
  expect(versionPrompt('See you soon', 'Sam: Saturday?', versionsList[0], '', 'remove', x)).toContain('On X:');
  expect(lineRetryPrompt('See you soon', 'Sam: Saturday?', versionsList[0])).not.toContain('On X:');
  expect(lineRetryPrompt('See you soon', 'Sam: Saturday?', versionsList[0], '', 'remove', x)).toContain('On X:');
});

const long = (n: number) => `${'x'.repeat(n - 1)}.`;

test('the length check keeps the flat 280 rule for unknown apps', () => {
  const over = scoreDraft(long(281), null, false);
  expect(over.reach.at(-1)).toEqual({ name: 'Long for a post', ok: false, reason: 'Shorter posts get read more.' });
  const under = scoreDraft(long(280), null, false);
  expect(under.reach.at(-1)).toEqual({ name: 'Right length for a post', ok: true, reason: '' });
});

test('each platform names itself in the too-long check', () => {
  const x = platformForApp('com.twitter.android');
  expect(scoreDraft(long(281), null, false, undefined, true, null, x).reach.at(-1)).toEqual({ name: 'Too long for X', ok: false, reason: 'Shorten it or split it into a thread.' });
  expect(scoreDraft(long(280), null, false, undefined, true, null, x).reach.at(-1)).toEqual({ name: 'Right length for a post', ok: true, reason: '' });
  const linkedin = platformForApp('com.linkedin.android');
  expect(scoreDraft(long(2900), null, false, undefined, true, null, linkedin).reach.at(-1)).toEqual({ name: 'Right length for a post', ok: true, reason: '' });
  expect(scoreDraft(long(3001), null, false, undefined, true, null, linkedin).reach.at(-1)).toEqual({ name: 'Too long for LinkedIn', ok: false, reason: 'Shorten it or split it into a thread.' });
  const reddit = platformForApp('com.reddit.frontpage');
  expect(scoreDraft(long(10001), null, false, undefined, true, null, reddit).reach.at(-1)?.name).toBe('Too long for Reddit');
  const whatsapp = platformForApp('com.whatsapp');
  expect(scoreDraft(long(1000), null, false, undefined, true, null, whatsapp).reach.at(-1)).toEqual({ name: 'Right length for a message', ok: true, reason: '' });
  expect(scoreDraft(long(65537), null, false, undefined, true, null, whatsapp).reach.at(-1)).toEqual({ name: 'Too long for WhatsApp', ok: false, reason: 'Shorten it to fit one message.' });
});

test('each platform has its own 3 reply slots; chat keeps todays three', () => {
  expect(slotsFor(platformForApp('com.twitter.android'))).toEqual([
    'Agree and add one concrete detail from the post.',
    'Push back kindly, with one reason from the post.',
    'Ask one sharp question about the post.',
  ]);
  expect(slotsFor(platformForApp('com.linkedin.android'))[0]).toContain('Agree and add one concrete example');
  expect(slotsFor(platformForApp('com.reddit.frontpage'))[0]).toContain('Answer with specifics');
  expect(slotsFor(platformForApp('com.Slack'))[0]).toContain('Confirm and name the next step');
  expect(slotsFor(platformForApp('com.google.android.gm'))).toEqual([
    'Accept clearly, with the key detail.',
    'Decline kindly, with a reason.',
    'Ask what is needed to decide.',
  ]);
  expect(slotsFor(platformForApp('com.whatsapp'))).toEqual(REPLY_SLOTS);
  expect(slotsFor(DEFAULT_PLATFORM)).toEqual(REPLY_SLOTS);
  expect(slotsFor()).toEqual(REPLY_SLOTS);
});

test('each platform has its polish rule; unknown apps need none', () => {
  expect(polishLine(platformForApp('com.twitter.android'))).toContain('the first line must stand alone');
  expect(polishLine(platformForApp('com.linkedin.android'))).toContain('keep paragraphs short');
  expect(polishLine(platformForApp('com.reddit.frontpage'))).toContain('one line');
  expect(polishLine(platformForApp('com.Slack'))).toContain('no greeting and no sign-off');
  expect(polishLine(platformForApp('com.whatsapp'))).toContain('keep any emoji');
  expect(polishLine(platformForApp('com.google.android.gm'))).toContain('Keep the greeting and the sign-off');
  expect(polishLine(DEFAULT_PLATFORM)).toBe('');
});

test('reply prompts use the platforms slots', () => {
  const input = { latest: 'Maya: shipped it', conversation: 'Maya: shipped it', dashes: 'remove' as const };
  const prompt = replyPrompt({ ...input, platform: platformForApp('com.twitter.android') });
  for (const slot of slotsFor(platformForApp('com.twitter.android'))) expect(prompt).toContain(slot);
  expect(prompt).not.toContain(REPLY_SLOTS[0]);
  const phone = { latest: 'Maya: shipped it', conversation: 'Maya: shipped it' };
  const phonePrompt = phoneReplyPrompt({ ...phone, platform: platformForApp('com.reddit.frontpage') });
  expect(phonePrompt).toContain('Answer with specifics from the thread.');
  expect(phoneSlotPrompt(slotsFor(platformForApp('com.Slack'))[0], phone, [])).toContain('Confirm and name the next step.');
});

test('the phone reply prompt stays under 700 characters of instructions on every platform', () => {
  for (const app of ['com.twitter.android', 'com.linkedin.android', 'com.reddit.frontpage', 'com.Slack', 'com.whatsapp', 'com.google.android.gm', 'com.example.other']) {
    // Grow adds their reply so far (`point`) on X, LinkedIn and Reddit; the budget holds with it too.
    for (const point of app === 'com.twitter.android' || app === 'com.linkedin.android' || app === 'com.reddit.frontpage' ? [undefined, 'Saturday works for me'] : [undefined]) {
      const prompt = phoneReplyPrompt({ latest: 'Sam: Saturday?', conversation: 'Sam: Saturday?', point, platform: platformForApp(app) });
      expect(prompt.split('\n\nLatest message:')[0].length).toBeLessThanOrEqual(700);
    }
  }
});

test('polish prompts carry the platforms polish rule', () => {
  const x = platformForApp('com.twitter.android');
  expect(rewritePrompt('Shipped it today', 'Maya: else?', '', 'remove', x)).toContain('the first line must stand alone');
  expect(versionPrompt('Shipped it today', 'Maya: else?', versionsList[0], '', 'remove', x)).toContain('the first line must stand alone');
  expect(lineRetryPrompt('Shipped it today', 'Maya: else?', versionsList[0], '', 'remove', x)).toContain('the first line must stand alone');
  const gmail = platformForApp('com.google.android.gm');
  expect(rewritePrompt('Hi Dana, yes', 'Dana: still on?', '', 'remove', gmail)).toContain('Keep the greeting and the sign-off');
  expect(rewritePrompt('See you soon', 'Sam: Saturday?')).not.toContain('first line must stand alone');
});

test('mail skips the length check and chats never check it', () => {
  const gmail = platformForApp('com.google.android.gm');
  const names = scoreDraft(long(5000), null, false, undefined, true, null, gmail).reach.map(x => x.name);
  expect(names).not.toContain('Long for a post');
  expect(names).not.toContain('Right length for a post');
  expect(names).not.toContain('Long for a message');
  expect(names.some(name => name.startsWith('Too long'))).toBe(false);
  const chat = scoreDraft('See you soon', null, true, undefined, false, null, platformForApp('com.Slack'));
  expect(chat.reach).toEqual([]);
});

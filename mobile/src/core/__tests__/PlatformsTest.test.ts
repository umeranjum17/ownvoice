import { DEFAULT_PLATFORM, platformForApp, platformLine } from '../platforms';
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

test('each platform checks against its own cap', () => {
  const x = platformForApp('com.twitter.android');
  expect(scoreDraft(long(281), null, false, undefined, true, null, x).reach.at(-1)?.name).toBe('Long for a post');
  expect(scoreDraft(long(280), null, false, undefined, true, null, x).reach.at(-1)?.name).toBe('Right length for a post');
  const linkedin = platformForApp('com.linkedin.android');
  expect(scoreDraft(long(2900), null, false, undefined, true, null, linkedin).reach.at(-1)).toEqual({ name: 'Right length for a post', ok: true, reason: '' });
  expect(scoreDraft(long(3001), null, false, undefined, true, null, linkedin).reach.at(-1)?.name).toBe('Long for a post');
  const whatsapp = platformForApp('com.whatsapp');
  expect(scoreDraft(long(1000), null, false, undefined, true, null, whatsapp).reach.at(-1)).toEqual({ name: 'Right length for a message', ok: true, reason: '' });
  expect(scoreDraft(long(65537), null, false, undefined, true, null, whatsapp).reach.at(-1)).toEqual({ name: 'Long for a message', ok: false, reason: 'Shorter messages get read more.' });
});

test('mail skips the length check and chats never check it', () => {
  const gmail = platformForApp('com.google.android.gm');
  const names = scoreDraft(long(5000), null, false, undefined, true, null, gmail).reach.map(x => x.name);
  expect(names).not.toContain('Long for a post');
  expect(names).not.toContain('Right length for a post');
  expect(names).not.toContain('Long for a message');
  const chat = scoreDraft('See you soon', null, true, undefined, false, null, platformForApp('com.Slack'));
  expect(chat.reach).toEqual([]);
});

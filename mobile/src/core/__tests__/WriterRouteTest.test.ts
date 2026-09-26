import { routeWriters, withPhoneFallback, type Writer } from '../writers';
import { CHATGPT_OFF } from '../switch';
import { summary } from '../privacy';
import { words } from '../words';

const three = ['one', 'two', 'three'];
const phone: Writer = { write: async () => ({ drafts: three }) };
const chatgpt = () => ({ write: async () => ({ drafts: three }) }) satisfies Writer;
const broken: Writer = { write: async () => { throw new Error(words.chatgptFailed); } };
const request = { conversation: '', written: '', typed: '' };

const written = async (writer: Writer) => (await writer.write(request)).drafts;

test('the phone writes on its own when ChatGPT is not in play', async () => {
  for (const options of [{ signedIn: false, allowed: true }, { signedIn: true, allowed: false }]) {
    const route = routeWriters({ ...options, enabled: true, chatgpt, phone });
    expect(route).toEqual({ writer: phone, note: null, viaChatGPT: false });
  }
});

test('ChatGPT is the main writer when it is signed in, allowed here and not switched off', async () => {
  const route = routeWriters({ signedIn: true, allowed: true, enabled: true, chatgpt, phone });
  expect(route.note).toBeNull();
  expect(route.viaChatGPT).toBe(true);
  expect(await written(route.writer)).toEqual(three);
});

test('the off switch and a resting plan both hand the writing to the phone, with the reason said once', async () => {
  expect(routeWriters({ signedIn: true, allowed: true, enabled: false, chatgpt, phone }))
    .toEqual({ writer: phone, note: CHATGPT_OFF, viaChatGPT: false });
  const resting = routeWriters({ signedIn: true, allowed: true, enabled: true, note: 'ChatGPT is resting until 3:40pm.', chatgpt, phone });
  expect(resting).toEqual({ writer: phone, note: 'ChatGPT is resting until 3:40pm.', viaChatGPT: false });
});

test('ChatGPT failing means the phone writes, and the panel is told why once', async () => {
  const route = routeWriters({ signedIn: true, allowed: true, enabled: true, chatgpt: () => broken, phone });
  expect(await route.writer.write(request)).toEqual({ drafts: three, reason: words.fallback });
  // A short answer is a failure too, so the panel never shows two drafts and a gap.
  const short: Writer = { write: async () => ({ drafts: ['only one'] }) };
  expect(await withPhoneFallback(short, phone, request)).toEqual({ drafts: three, reason: words.fallback });
});

test('the read log says when a screen went to ChatGPT, and never says what it said', () => {
  const chat = 'Sam: Are we still on for Saturday?';
  expect(summary('REPLY', chat, '', true)).toBe('Suggested replies. Read the chat on screen. Sent to ChatGPT.');
  expect(summary('COMPOSE', '', 'my post', false)).toBe('Polished your message. Read your message.');
  for (const sent of [true, false]) expect(summary('REPLY', chat, 'mine', sent)).not.toContain('Sam');
});

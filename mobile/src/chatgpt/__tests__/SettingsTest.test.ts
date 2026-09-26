import { store } from '../../core/store';
import { gptChoice, gptApps, saveGptApps, gptRoute } from '../settings';
import { status } from '../accounts';
import { CHATGPT_OFF } from '../../core/switch';
import Native from '../../../modules/ownvoice-native';

jest.mock('../../../modules/ownvoice-native', () => ({
  __esModule: true,
  default: { bubbleRules: jest.fn(async () => ({ paused: false, on: [], off: ['com.reddit.frontpage'] })) },
}));
jest.mock('../accounts', () => ({
  refresh: jest.fn(async () => {}),
  signInState: jest.fn(() => null),
  status: jest.fn(async () => ({ account: 'owner', name: 'ChatGPT', state: 'ready', words: 'ChatGPT is connected.' })),
}));

const native = Native as jest.Mocked<typeof Native>;
const ready = status as jest.Mock;
const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;
/** A switch file that never arrives: what was verified last is kept, and nothing was verified yet means on. */
const offline = (async () => { throw new Error('no network'); }) as typeof fetch;

beforeEach(() => {
  kv.clear();
  jest.clearAllMocks();
  native.bubbleRules.mockResolvedValue({ paused: false, on: [], off: ['com.reddit.frontpage'] });
  ready.mockResolvedValue({ account: 'owner', name: 'ChatGPT', state: 'ready', words: 'ChatGPT is connected.' });
});

test('only saved choices permit ChatGPT', () => {
  expect(gptApps()).toBeNull();
  expect(gptChoice('com.twitter.android')).toBe(false);
  saveGptApps({ on: ['com.Slack'], off: ['com.twitter.android'] });
  expect(gptApps()).toEqual({ on: ['com.Slack'], off: ['com.twitter.android'] });
  expect(gptChoice('com.Slack')).toBe(true);
  expect(gptChoice('com.twitter.android')).toBe(false);
});

test('ChatGPT writes where it is signed in, allowed and not switched off', async () => {
  expect(await gptRoute('com.twitter.android', offline)).toMatchObject({ viaChatGPT: false });
  saveGptApps({ on: ['com.twitter.android'], off: [] });
  const route = await gptRoute('com.twitter.android', offline);
  expect(route).toMatchObject({ note: null, viaChatGPT: true });
});

test('a workplace chat stays with the phone unless it is switched on', async () => {
  native.bubbleRules.mockResolvedValue({ paused: false, on: ['com.Slack'], off: [] });
  expect(await gptRoute('com.Slack', offline)).toMatchObject({ note: null, viaChatGPT: false });
  saveGptApps({ on: ['com.Slack'], off: [] });
  expect(await gptRoute('com.Slack', offline)).toMatchObject({ viaChatGPT: true });
});

test('an app the bubble is off in never sends anything', async () => {
  expect(await gptRoute('com.reddit.frontpage', offline)).toMatchObject({ note: null, viaChatGPT: false });
});

test('the off switch means the phone writes, with the one plain line', async () => {
  saveGptApps({ on: ['com.twitter.android'], off: [] });
  store.set('chatgpt-switch', { seq: 1, chatgpt: 'off', fetchedAt: Date.now() });
  expect(await gptRoute('com.twitter.android', offline)).toMatchObject({ note: CHATGPT_OFF, viaChatGPT: false });
});

test('a resting ChatGPT says so instead of trying to write', async () => {
  saveGptApps({ on: ['com.twitter.android'], off: [] });
  ready.mockResolvedValue({ account: 'owner', name: 'ChatGPT', state: 'resting', until: 1, words: 'ChatGPT is resting until 3:40pm.' });
  expect(await gptRoute('com.twitter.android', offline)).toMatchObject({ note: 'ChatGPT is resting until 3:40pm.', viaChatGPT: false });
});

test('nobody signed in means no switch check and no ChatGPT', async () => {
  ready.mockResolvedValue({ account: 'owner', name: 'ChatGPT', state: 'signed_out', words: "ChatGPT isn't signed in yet." });
  expect(await gptRoute('com.twitter.android', offline)).toMatchObject({ note: null, viaChatGPT: false });
});

import { store } from '../../core/store';
import { gptChoice, gptApps, setGptApp, gptRoute } from '../settings';
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

test('every app the bubble shows in can use ChatGPT, and private workplace chat cannot', () => {
  expect(gptChoice('com.twitter.android')).toBeUndefined();
  expect(gptChoice('com.Slack')).toBeUndefined();
  setGptApp('com.Slack', true);
  setGptApp('com.twitter.android', false);
  expect(gptApps()).toEqual({ on: ['com.Slack'], off: ['com.twitter.android'] });
  setGptApp('com.Slack', false);
  expect(gptApps()).toEqual({ on: [], off: ['com.twitter.android', 'com.Slack'] });
});

test('ChatGPT writes where it is signed in, allowed and not switched off', async () => {
  const route = await gptRoute('com.twitter.android', offline);
  expect(route).toMatchObject({ note: null, viaChatGPT: true });
});

test('a workplace chat stays with the phone unless it is switched on', async () => {
  native.bubbleRules.mockResolvedValue({ paused: false, on: ['com.Slack'], off: [] });
  expect(await gptRoute('com.Slack', offline)).toMatchObject({ note: null, viaChatGPT: false });
  setGptApp('com.Slack', true);
  expect(await gptRoute('com.Slack', offline)).toMatchObject({ viaChatGPT: true });
});

test('an app the bubble is off in never sends anything', async () => {
  expect(await gptRoute('com.reddit.frontpage', offline)).toMatchObject({ note: null, viaChatGPT: false });
});

test('the off switch means the phone writes, with the one plain line', async () => {
  store.set('chatgpt-switch', { seq: 1, chatgpt: 'off', fetchedAt: Date.now() });
  expect(await gptRoute('com.twitter.android', offline)).toMatchObject({ note: CHATGPT_OFF, viaChatGPT: false });
});

test('a resting ChatGPT says so instead of trying to write', async () => {
  ready.mockResolvedValue({ account: 'owner', name: 'ChatGPT', state: 'resting', until: 1, words: 'ChatGPT is resting until 3:40pm.' });
  expect(await gptRoute('com.twitter.android', offline)).toMatchObject({ note: 'ChatGPT is resting until 3:40pm.', viaChatGPT: false });
});

test('nobody signed in means no switch check and no ChatGPT', async () => {
  ready.mockResolvedValue({ account: 'owner', name: 'ChatGPT', state: 'signed_out', words: "ChatGPT isn't signed in yet." });
  expect(await gptRoute('com.twitter.android', offline)).toMatchObject({ note: null, viaChatGPT: false });
});

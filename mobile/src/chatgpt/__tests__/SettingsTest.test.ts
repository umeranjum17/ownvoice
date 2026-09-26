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
const offline = (async () => { throw new Error('no network'); }) as typeof fetch;

beforeEach(() => {
  kv.clear();
  jest.clearAllMocks();
  native.bubbleRules.mockResolvedValue({ paused: false, on: [], off: ['com.reddit.frontpage'] });
  ready.mockResolvedValue({ account: 'owner', name: 'ChatGPT', state: 'ready', words: 'ChatGPT is connected.' });
});

test('only signed-in saved choices permit ChatGPT', async () => {
  expect(gptApps()).toBeNull();
  expect(gptChoice('com.twitter.android')).toBe(false);
  ready.mockResolvedValueOnce({ account: 'owner', name: 'ChatGPT', state: 'signed_out', words: 'Signed out.' });
  expect(await saveGptApps({ on: ['com.Slack'] })).toBe(false);
  expect(gptApps()).toBeNull();
  expect(await saveGptApps({ on: ['com.Slack'] })).toBe(true);
  expect(gptApps()).toEqual({ on: ['com.Slack'] });
  expect(gptChoice('com.Slack')).toBe(true);
  expect(gptChoice('com.twitter.android')).toBe(false);
});

test('the switch is checked only after a signed-in app choice', async () => {
  const fetcher = jest.fn(offline);
  const before = await gptRoute('com.twitter.android', fetcher);
  expect(before.note).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
  expect(await saveGptApps({ on: ['com.twitter.android'] })).toBe(true);
  const route = await gptRoute('com.twitter.android', fetcher);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(route.note).toBeNull();
  expect(route.writer).not.toBe(before.writer);
});

test('a workplace chat stays with the phone unless it is switched on', async () => {
  native.bubbleRules.mockResolvedValue({ paused: false, on: ['com.Slack'], off: [] });
  const before = await gptRoute('com.Slack', offline);
  expect(before.note).toBeNull();
  await saveGptApps({ on: ['com.Slack'] });
  expect((await gptRoute('com.Slack', offline)).writer).not.toBe(before.writer);
});

test('an app the bubble is off in never checks the switch', async () => {
  await saveGptApps({ on: ['com.reddit.frontpage'] });
  const fetcher = jest.fn(offline);
  expect((await gptRoute('com.reddit.frontpage', fetcher)).note).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

test('the off switch means the phone writes, with the one plain line', async () => {
  await saveGptApps({ on: ['com.twitter.android'] });
  store.set('chatgpt-switch', { seq: 1, chatgpt: 'off', fetchedAt: Date.now() });
  expect((await gptRoute('com.twitter.android', offline)).note).toBe(CHATGPT_OFF);
});

test('a resting ChatGPT says so instead of trying to write', async () => {
  await saveGptApps({ on: ['com.twitter.android'] });
  ready.mockResolvedValue({ account: 'owner', name: 'ChatGPT', state: 'resting', until: 1, words: 'ChatGPT is resting until 3:40pm.' });
  expect((await gptRoute('com.twitter.android', offline)).note).toBe('ChatGPT is resting until 3:40pm.');
});

test('nobody signed in means no switch check and no ChatGPT', async () => {
  ready.mockResolvedValue({ account: 'owner', name: 'ChatGPT', state: 'signed_out', words: "ChatGPT isn't signed in yet." });
  const fetcher = jest.fn(offline);
  expect((await gptRoute('com.twitter.android', fetcher)).note).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

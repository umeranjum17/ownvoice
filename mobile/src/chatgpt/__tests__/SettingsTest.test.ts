import { store } from '../../core/store';
import { gptChoice, gptApps, saveGptApps, gptRoute } from '../settings';
import { status } from '../accounts';
import { CHATGPT_OFF } from '../../core/switch';
import Native from '../../../modules/ownvoice-native';
import { reportFailure } from '../accounts';
import { phoneWriter } from '../../panel/phoneWriter';

jest.mock('../../../modules/ownvoice-native', () => ({
  __esModule: true,
  default: { bubbleRules: jest.fn(async () => ({ paused: false, on: [], off: ['com.reddit.frontpage'] })) },
}));
jest.mock('../accounts', () => ({
  reportFailure: jest.fn(async () => null),
  codexAuth: jest.fn(async () => ({ access: 'fixture-access', accountId: 'fixture-account' })),
  refresh: jest.fn(async () => {}),
  signInState: jest.fn(() => null),
  status: jest.fn(async () => ({ account: 'owner', name: 'ChatGPT', state: 'ready', words: 'ChatGPT is connected.' })),
}));

jest.mock('../../panel/phoneWriter', () => ({ phoneWriter: { write: jest.fn(async () => ({ drafts: ['phone one', 'phone two', 'phone three'] })) } }));
jest.mock('expo/fetch', () => ({ fetch: (...args: Parameters<typeof fetch>) => global.fetch(...args) }));

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

test('a paused bubble does not check the switch', async () => {
  await saveGptApps({ on: ['com.twitter.android'] });
  native.bubbleRules.mockResolvedValue({ paused: true, on: [], off: [] });
  const fetcher = jest.fn(offline);
  const route = await gptRoute('com.twitter.android', fetcher);
  expect(route.note).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

test('the off switch means the phone writes, with the one plain line', async () => {
  await saveGptApps({ on: ['com.twitter.android'] });
  store.set('chatgpt-switch', { seq: 1, chatgpt: 'off', fetchedAt: Date.now() });
  expect((await gptRoute('com.twitter.android', offline)).note).toBe(CHATGPT_OFF);
});

test.each([1, 2])('an unreadable switch on read %i uses the phone without losing a verified off choice', async failedRead => {
  await saveGptApps({ on: ['com.twitter.android'] });
  store.set('chatgpt-switch', { seq: 1, chatgpt: 'off', fetchedAt: 0 });
  const storage = jest.requireMock('expo-sqlite/kv-store').default;
  let reads = 0;
  const get = jest.spyOn(storage, 'getItemSync').mockImplementation((key: string) => {
    if (key === 'chatgpt-switch' && ++reads === failedRead) throw new Error('storage unavailable');
    return kv.get(key) ?? null;
  });
  const fetcher = jest.fn(offline);
  try {
    const route = await gptRoute('com.twitter.android', fetcher);
    expect(route.writer).toBe(phoneWriter);
    expect(route.note).toBe(CHATGPT_OFF);
    expect(fetcher).toHaveBeenCalledTimes(failedRead === 1 ? 0 : 1);
    expect(kv.get('chatgpt-switch')).toEqual(JSON.stringify({ seq: 1, chatgpt: 'off', fetchedAt: 0 }));
  } finally {
    get.mockRestore();
  }
  expect((await gptRoute('com.twitter.android', offline)).note).toBe(CHATGPT_OFF);
});

test('a switch read failure during verification cannot reuse an earlier on choice', async () => {
  await saveGptApps({ on: ['com.twitter.android'] });
  store.set('chatgpt-switch', { seq: 1, chatgpt: 'on', fetchedAt: 0 });
  const storage = jest.requireMock('expo-sqlite/kv-store').default;
  let reads = 0;
  const get = jest.spyOn(storage, 'getItemSync').mockImplementation((key: string) => {
    if (key === 'chatgpt-switch' && ++reads === 2) throw new Error('storage unavailable');
    return kv.get(key) ?? null;
  });
  const fetcher = jest.fn(async () => ({ ok: true, json: async () => ({ payload: { v: 1, app: 'ownvoice', seq: 2, chatgpt: 'off' }, sig: 'invalid' }) } as Response));
  try {
    const route = await gptRoute('com.twitter.android', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(route.writer).toBe(phoneWriter);
    expect(route.note).toBe(CHATGPT_OFF);
  } finally {
    get.mockRestore();
  }
});

test('a resting ChatGPT says so instead of trying to write', async () => {
  await saveGptApps({ on: ['com.twitter.android'] });
  ready.mockResolvedValue({ account: 'owner', name: 'ChatGPT', state: 'resting', until: 1, words: 'ChatGPT is resting until 3:40pm.' });
  expect((await gptRoute('com.twitter.android', offline)).note).toBe('ChatGPT is resting until 3:40pm.');
});

test('choice withdrawn during the switch wait is rechecked before sending', async () => {
  await saveGptApps({ on: ['com.twitter.android'] });
  let release!: (response: Response) => void;
  let started!: () => void;
  const checking = new Promise<void>(resolve => { started = resolve; });
  const fetcher = jest.fn(() => { started(); return new Promise<Response>(resolve => { release = resolve; }); }) as typeof fetch;
  const pending = gptRoute('com.twitter.android', fetcher);
  await checking;
  await saveGptApps({ on: [] });
  release({ ok: false } as Response);
  const route = await pending;
  const originalFetch = global.fetch;
  global.fetch = jest.fn();
  try {
    expect(await route.writer.write({ conversation: '', written: '', typed: 'hello' })).toMatchObject({ drafts: ['phone one', 'phone two', 'phone three'] });
    expect(global.fetch).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test.each([
  { paused: false, on: [], off: ['com.twitter.android'] },
  { paused: true, on: [], off: [] },
])('a bubble rule changed after routing blocks the send', async rules => {
  await saveGptApps({ on: ['com.twitter.android'] });
  const route = await gptRoute('com.twitter.android', offline);
  native.bubbleRules.mockResolvedValue(rules);
  const originalFetch = global.fetch;
  global.fetch = jest.fn();
  try {
    expect(await route.writer.write({ conversation: '', written: '', typed: 'hello' })).toMatchObject({ drafts: ['phone one', 'phone two', 'phone three'] });
    expect(global.fetch).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test('a limit gives the same tap byokits words over phone drafts', async () => {
  await saveGptApps({ on: ['com.twitter.android'] });
  const route = await gptRoute('com.twitter.android', offline);
  (reportFailure as jest.Mock).mockImplementation(async () => {
    ready.mockResolvedValue({ account: 'owner', name: 'ChatGPT', state: 'resting', words: 'ChatGPT is resting until 3:40pm.' });
    return { kind: 'rate_limit', until: 1 };
  });
  const originalFetch = global.fetch;
  global.fetch = jest.fn(async () => ({ ok: false, status: 429, text: async () => 'Too many requests', body: null } as Response));
  try {
    expect(await route.writer.write({ conversation: '', written: '', typed: 'hello' })).toEqual({ drafts: ['phone one', 'phone two', 'phone three'], reason: 'ChatGPT is resting until 3:40pm.' });
    expect(reportFailure).toHaveBeenCalledWith('429 Too many requests');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  } finally { global.fetch = originalFetch; }
});

test('nobody signed in means no switch check and no ChatGPT', async () => {
  ready.mockResolvedValue({ account: 'owner', name: 'ChatGPT', state: 'signed_out', words: "ChatGPT isn't signed in yet." });
  const fetcher = jest.fn(offline);
  expect((await gptRoute('com.twitter.android', fetcher)).note).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

import { classify } from '@byokit/accounts';
import { PHONE_ONLY_KEY, SOURCE_KEY } from '../../core/source';
import { store } from '../../core/store';
import { saveBubbleRules, gptRoute } from '../settings';
import { status } from '../accounts';
import { CHATGPT_OFF } from '../../core/switch';
import Native from '../../../modules/ownvoice-native';
import { codexAuth, reportFailure, signOut } from '../accounts';
import { session } from '../session';
import { phoneWriter } from '../../panel/phoneWriter';
import { words } from '../../core/words';

jest.mock('../../../modules/ownvoice-native', () => ({
  __esModule: true,
  default: { bubbleRules: jest.fn(async () => ({ paused: false, on: [], off: ['com.reddit.frontpage'] })), setBubbleRules: jest.fn(async () => {}), modelStatus: jest.fn(async () => 'available') },
}));
jest.mock('../accounts', () => ({
  reportFailure: jest.fn(async () => null),
  signOut: jest.fn(async () => {}),
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
  native.modelStatus.mockResolvedValue('available');
  ready.mockResolvedValue({ account: 'owner', name: 'ChatGPT', state: 'ready', words: 'ChatGPT is connected.' });
  store.set(SOURCE_KEY, 'chatgpt');
});

test('byokit 0.3.1 treats undated rate limits as temporary', () => {
  expect(classify('429 Too many requests')).toMatchObject({ kind: 'rate_limit' });
  expect(classify('rate_limit_exceeded')).toMatchObject({ kind: 'rate_limit' });
});

test('phone chosen means never ChatGPT, even when signed in', async () => {
  store.set(SOURCE_KEY, 'phone');
  const fetcher = jest.fn(offline);
  const route = await gptRoute('com.twitter.android', fetcher);
  expect(route.writer).toBe(phoneWriter);
  expect(route.note).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

test('no source tells the panel to choose first instead of drafting', async () => {
  store.set(SOURCE_KEY, null);
  const route = await gptRoute('com.twitter.android', offline);
  expect(route.note).toBeNull();
  await expect(route.writer.write({ conversation: 'Sam: hi', written: 'Sam: hi', typed: '' })).rejects.toThrow(words.needWriterPanel);
});

test('the practice call drafts on the phone before a source is chosen', async () => {
  store.set(SOURCE_KEY, null);
  const route = await gptRoute('dev.ownvoice.app', offline);
  expect(route.writer).toBe(phoneWriter);
  expect(route.note).toBeNull();
});

test('the practice call goes through ChatGPT when it is chosen and signed in', async () => {
  const route = await gptRoute('dev.ownvoice.app', offline);
  expect(route.note).toBeNull();
  expect(route.writer).not.toBe(phoneWriter);
});

test('the switch is checked only for a ChatGPT app', async () => {
  const fetcher = jest.fn(offline);
  const before = await gptRoute('com.Slack', fetcher);
  expect(before.writer).toBe(phoneWriter);
  expect(before.note).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
  store.set(PHONE_ONLY_KEY, []);
  const route = await gptRoute('com.twitter.android', fetcher);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(route.note).toBeNull();
  expect(route.writer).not.toBe(before.writer);
});

test('the emulator stand-in drafts without marking a send', async () => {
  const originalFlag = process.env.EXPO_PUBLIC_E2E_GPT;
  const originalFetch = global.fetch;
  const start = Date.now();
  let mockRoute!: typeof gptRoute;
  let mockSession!: typeof import('../session').session;
  try {
    process.env.EXPO_PUBLIC_E2E_GPT = '1';
    jest.isolateModules(() => {
      mockRoute = require('../settings').gptRoute;
      mockSession = require('../session').session;
    });
    await mockSession.start();
    const now = jest.spyOn(Date, 'now').mockReturnValue(start + 10_000);
    try {
      const route = await mockRoute('com.twitter.android');
      const sent = jest.fn();
      global.fetch = jest.fn();
      const choice = await route.writer.write({ conversation: 'Sam: hi', written: 'Sam: hi', typed: '' }, { sent });
      expect(choice.drafts).toHaveLength(3);
      expect(sent).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    } finally { now.mockRestore(); }
  } finally {
    if (originalFlag === undefined) delete process.env.EXPO_PUBLIC_E2E_GPT;
    else process.env.EXPO_PUBLIC_E2E_GPT = originalFlag;
    global.fetch = originalFetch;
  }
});

test('a workplace chat stays with the phone unless it leaves the phone-only list', async () => {
  native.bubbleRules.mockResolvedValue({ paused: false, on: ['com.Slack'], off: [] });
  const before = await gptRoute('com.Slack', offline);
  expect(before.writer).toBe(phoneWriter);
  expect(before.note).toBeNull();
  store.set(PHONE_ONLY_KEY, []);
  expect((await gptRoute('com.Slack', offline)).writer).not.toBe(before.writer);
});

test('an app the bubble is off in never checks the switch', async () => {
  const fetcher = jest.fn(offline);
  expect((await gptRoute('com.reddit.frontpage', fetcher)).note).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

test('a paused bubble does not check the switch', async () => {
  native.bubbleRules.mockResolvedValue({ paused: true, on: [], off: [] });
  const fetcher = jest.fn(offline);
  const route = await gptRoute('com.twitter.android', fetcher);
  expect(route.note).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

test('the off switch means the phone writes, with the one plain line', async () => {
  store.set('chatgpt-switch', { seq: 1, chatgpt: 'off', fetchedAt: Date.now() });
  expect((await gptRoute('com.twitter.android', offline)).note).toBe(CHATGPT_OFF);
});

test.each([1, 2])('an unreadable switch on read %i uses the phone without losing a verified off choice', async failedRead => {
  store.set('chatgpt-switch', { seq: 1, chatgpt: 'off', fetchedAt: 0 });
  const storage = jest.requireMock('expo-sqlite/kv-store').default;
  let reads = 0;
  const get = jest.spyOn(storage, 'getItemSync').mockImplementation((key: unknown) => {
    if (key === 'chatgpt-switch' && ++reads === failedRead) throw new Error('storage unavailable');
    return kv.get(key as string) ?? null;
  });
  const fetcher = jest.fn(offline);
  try {
    const route = await gptRoute('com.twitter.android', fetcher);
    expect(route.writer).toBe(phoneWriter);
    expect(route.note).toBe(words.switchUnavailable);
    expect(fetcher).toHaveBeenCalledTimes(failedRead === 1 ? 0 : 1);
    expect(kv.get('chatgpt-switch')).toEqual(JSON.stringify({ seq: 1, chatgpt: 'off', fetchedAt: 0 }));
  } finally {
    get.mockRestore();
  }
  expect((await gptRoute('com.twitter.android', offline)).note).toBe(CHATGPT_OFF);
});

test('a switch read failure during verification cannot reuse an earlier on choice', async () => {
  store.set('chatgpt-switch', { seq: 1, chatgpt: 'on', fetchedAt: 0 });
  const storage = jest.requireMock('expo-sqlite/kv-store').default;
  let reads = 0;
  const get = jest.spyOn(storage, 'getItemSync').mockImplementation((key: unknown) => {
    if (key === 'chatgpt-switch' && ++reads === 2) throw new Error('storage unavailable');
    return kv.get(key as string) ?? null;
  });
  const fetcher = jest.fn(async () => ({ ok: true, json: async () => ({ payload: { v: 1, app: 'ownvoice', seq: 2, chatgpt: 'off' }, sig: 'invalid' }) } as Response));
  try {
    const route = await gptRoute('com.twitter.android', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(route.writer).toBe(phoneWriter);
    expect(route.note).toBe(words.switchUnavailable);
  } finally {
    get.mockRestore();
  }
});

test.each(['off', 'unreadable'])('a switch turning %s after routing blocks the Responses send', async mode => {
  const route = await gptRoute('com.twitter.android', offline);
  const storage = jest.requireMock('expo-sqlite/kv-store').default;
  const get = mode === 'unreadable'
    ? jest.spyOn(storage, 'getItemSync').mockImplementation((key: unknown) => {
      if (key === 'chatgpt-switch') throw new Error('unavailable');
      return kv.get(key as string) ?? null;
    }) : null;
  if (mode === 'off') store.set('chatgpt-switch', { seq: 1, chatgpt: 'off', fetchedAt: Date.now() });
  const originalFetch = global.fetch;
  global.fetch = jest.fn();
  try {
    expect(await route.writer.write({ conversation: 'Sam: hi', written: 'Sam: hi', typed: '' })).toEqual({
      drafts: ['phone one', 'phone two', 'phone three'],
      reason: mode === 'off' ? CHATGPT_OFF : words.switchUnavailable,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  } finally {
    global.fetch = originalFetch;
    get?.mockRestore();
  }
});

test('an unreadable switch without a verified off choice uses a neutral phone reason', async () => {
  const storage = jest.requireMock('expo-sqlite/kv-store').default;
  const get = jest.spyOn(storage, 'getItemSync').mockImplementation((key: unknown) => {
    if (key === 'chatgpt-switch') throw new Error('unavailable');
    return kv.get(key as string) ?? null;
  });
  try {
    const route = await gptRoute('com.twitter.android', offline);
    expect(route.writer).toBe(phoneWriter);
    expect(route.note).toBe(words.switchUnavailable);
  } finally { get.mockRestore(); }
});

test('pending logout blocks a credentialed send even with ready status', async () => {
  const route = await gptRoute('com.twitter.android', offline);
  let releaseAuth!: (auth: { access: string; accountId: string }) => void;
  let authStarted!: () => void;
  const started = new Promise<void>(resolve => { authStarted = resolve; });
  (codexAuth as jest.Mock).mockImplementationOnce(() => {
    authStarted();
    return new Promise(resolve => { releaseAuth = resolve; });
  });
  let releaseLogout!: () => void;
  (signOut as jest.Mock).mockImplementationOnce(() => new Promise<void>(resolve => { releaseLogout = resolve; }));
  const originalFetch = global.fetch;
  global.fetch = jest.fn();
  const sent = jest.fn();
  try {
    const writing = route.writer.write({ conversation: 'Sam: hi', written: 'Sam: hi', typed: '' }, { sent });
    await started;
    const clear = jest.spyOn(store, 'set').mockImplementationOnce(() => { throw new Error('full'); });
    const leaving = session.signOut();
    clear.mockRestore();
    releaseAuth({ access: 'fixture-access', accountId: 'fixture-account' });
    expect(await writing).toEqual({ drafts: ['phone one', 'phone two', 'phone three'], reason: words.phoneWrote });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
    releaseLogout();
    await leaving;
  } finally { global.fetch = originalFetch; }
});

test('sign-out blocks an in-flight send even when clearing app choices fails', async () => {
  const route = await gptRoute('com.twitter.android', offline);
  let release!: (auth: { access: string; accountId: string }) => void;
  let authStarted!: () => void;
  const started = new Promise<void>(resolve => { authStarted = resolve; });
  (codexAuth as jest.Mock).mockImplementationOnce(() => {
    authStarted();
    return new Promise(resolve => { release = resolve; });
  });
  const originalFetch = global.fetch;
  global.fetch = jest.fn();
  const sent = jest.fn();
  try {
    const writing = route.writer.write({ conversation: 'Sam: hi', written: 'Sam: hi', typed: '' }, { sent });
    await started;
    const clear = jest.spyOn(store, 'set').mockImplementationOnce(() => { throw new Error('full'); });
    try {
      (signOut as jest.Mock).mockImplementationOnce(async () => {
        ready.mockResolvedValue({ account: 'owner', name: 'ChatGPT', state: 'signed_out', words: 'Signed out.' });
      });
      await session.signOut();
    } finally { clear.mockRestore(); }
    expect(signOut).toHaveBeenCalledTimes(1);
    release({ access: 'fixture-access', accountId: 'fixture-account' });
    expect(await writing).toEqual({ drafts: ['phone one', 'phone two', 'phone three'], reason: words.phoneWrote });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test('a choice withdrawn while the tap is marked gives a phone-only reason', async () => {
  const route = await gptRoute('com.twitter.android', offline);
  let releaseMark!: () => void;
  let markStarted!: () => void;
  const started = new Promise<void>(resolve => { markStarted = resolve; });
  const sent = jest.fn(() => {
    markStarted();
    return new Promise<void>(resolve => { releaseMark = resolve; });
  });
  const originalFetch = global.fetch;
  global.fetch = jest.fn();
  try {
    const writing = route.writer.write({ conversation: 'Sam: hi', written: 'Sam: hi', typed: '' }, { sent });
    await started;
    store.set(PHONE_ONLY_KEY, ['com.twitter.android']);
    releaseMark();
    expect(await writing).toEqual({ drafts: ['phone one', 'phone two', 'phone three'], reason: words.phoneWrote });
    expect(sent).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test('a saved pause during the final native re-check cannot be overwritten by its stale result', async () => {
  const route = await gptRoute('com.twitter.android', offline);
  const originalFetch = global.fetch;
  global.fetch = jest.fn();
  const oldRules = { paused: false, on: [], off: ['com.reddit.frontpage'] };
  let finish!: (rules: typeof oldRules) => void;
  let reading!: () => void;
  const started = new Promise<void>(resolve => { reading = resolve; });
  native.bubbleRules.mockImplementationOnce(async () => oldRules).mockImplementationOnce(() => {
    reading();
    return new Promise(resolve => { finish = resolve; });
  });
  const sent = jest.fn(async () => {});
  const unsent = jest.fn(async () => {});
  try {
    const writing = route.writer.write({ conversation: 'Sam: hi', written: 'Sam: hi', typed: '' }, { sent, unsent });
    await started;
    await saveBubbleRules({ ...oldRules, paused: true });
    finish(oldRules);
    expect(await writing).toEqual({ drafts: ['phone one', 'phone two', 'phone three'], reason: words.phoneWrote });
    expect(sent).toHaveBeenCalledTimes(1);
    expect(unsent).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test('an offline send falls back to the phone with the offline line', async () => {
  const route = await gptRoute('com.twitter.android', offline);
  const originalFetch = global.fetch;
  global.fetch = jest.fn(async () => { throw new Error('fetch failed'); });
  try {
    expect(await route.writer.write({ conversation: 'Sam: hi', written: 'Sam: hi', typed: '' })).toEqual({ drafts: ['phone one', 'phone two', 'phone three'], reason: words.offlinePhone });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  } finally { global.fetch = originalFetch; }
});

test('offline on a phone that cannot write says to connect instead', async () => {
  native.modelStatus.mockResolvedValue('unavailable');
  const route = await gptRoute('com.twitter.android', offline);
  const originalFetch = global.fetch;
  global.fetch = jest.fn(async () => { throw new Error('fetch failed'); });
  try {
    await expect(route.writer.write({ conversation: 'Sam: hi', written: 'Sam: hi', typed: '' })).rejects.toThrow(words.offlineNoPhone);
  } finally { global.fetch = originalFetch; }
});

test('a newer off choice blocks a later reply request', async () => {
  const route = await gptRoute('com.twitter.android', offline);
  const originalFetch = global.fetch;
  global.fetch = jest.fn(async () => {
    store.set('chatgpt-switch', { seq: 1, chatgpt: 'off', fetchedAt: Date.now() });
    return { ok: true, body: new ReadableStream({ start(controller) {
      const delta = JSON.stringify({ type: 'response.output_text.delta', delta: JSON.stringify({ drafts: ['No thanks', 'No thanks', 'No thanks'] }) });
      controller.enqueue(new TextEncoder().encode(`data: ${delta}\n\ndata: {"type":"response.completed"}\n\n`));
      controller.close();
    } }) } as Response;
  });
  try {
    expect(await route.writer.write({ conversation: 'Sam: hi', written: 'Sam: hi', typed: '' })).toMatchObject({ drafts: ['phone one', 'phone two', 'phone three'] });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  } finally { global.fetch = originalFetch; }
});

test('a resting ChatGPT says so instead of trying to write', async () => {
  ready.mockResolvedValue({ account: 'owner', name: 'ChatGPT', state: 'resting', until: 1, words: 'ChatGPT is resting until 3:40pm.' });
  expect((await gptRoute('com.twitter.android', offline)).note).toBe('ChatGPT is resting until 3:40pm.');
});

test('choice withdrawn during the switch wait is rechecked before sending', async () => {
  let release!: (response: Response) => void;
  let started!: () => void;
  const checking = new Promise<void>(resolve => { started = resolve; });
  const fetcher = jest.fn(() => { started(); return new Promise<Response>(resolve => { release = resolve; }); }) as typeof fetch;
  const pending = gptRoute('com.twitter.android', fetcher);
  await checking;
  store.set(PHONE_ONLY_KEY, ['com.twitter.android']);
  release({ ok: false } as Response);
  const route = await pending;
  const originalFetch = global.fetch;
  global.fetch = jest.fn();
  try {
    expect(await route.writer.write({ conversation: '', written: '', typed: 'hello' })).toEqual({ drafts: ['phone one', 'phone two', 'phone three'], reason: words.phoneWrote });
    expect(global.fetch).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test.each([
  { paused: false, on: [], off: ['com.twitter.android'] },
  { paused: true, on: [], off: [] },
])('a bubble rule changed after routing blocks the send', async rules => {
  const route = await gptRoute('com.twitter.android', offline);
  native.bubbleRules.mockResolvedValue(rules);
  const originalFetch = global.fetch;
  global.fetch = jest.fn();
  try {
    expect(await route.writer.write({ conversation: '', written: '', typed: 'hello' })).toEqual({ drafts: ['phone one', 'phone two', 'phone three'], reason: words.phoneWrote });
    expect(global.fetch).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test('a limit gives the same tap byokits words over phone drafts', async () => {
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

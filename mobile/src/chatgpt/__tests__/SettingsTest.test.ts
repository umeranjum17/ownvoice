import { store } from '../../core/store';
import { gptChoice, gptApps, saveGptApps, gptRoute } from '../settings';
import { status } from '../accounts';
import { CHATGPT_OFF } from '../../core/switch';
import Native from '../../../modules/ownvoice-native';
import { codexAuth, reportFailure, signOut } from '../accounts';
import { session } from '../session';
import { phoneWriter } from '../../panel/phoneWriter';
import { words } from '../../core/words';

jest.mock('../../../modules/ownvoice-native', () => ({
  __esModule: true,
  default: { bubbleRules: jest.fn(async () => ({ paused: false, on: [], off: ['com.reddit.frontpage'] })) },
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
      await saveGptApps({ on: ['com.twitter.android'] });
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
  await saveGptApps({ on: ['com.twitter.android'] });
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
  await saveGptApps({ on: ['com.twitter.android'] });
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
    expect(await route.writer.write({ conversation: 'Sam: hi', written: 'Sam: hi', typed: '' })).toMatchObject({ drafts: ['phone one', 'phone two', 'phone three'] });
    expect(global.fetch).not.toHaveBeenCalled();
  } finally {
    global.fetch = originalFetch;
    get?.mockRestore();
  }
});

test('an unreadable switch without a verified off choice uses a neutral phone reason', async () => {
  await saveGptApps({ on: ['com.twitter.android'] });
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

test('a pending consent save cannot restore choices after sign-out', async () => {
  await saveGptApps({ on: ['com.twitter.android'] });
  const readyState = await session.current();
  let release!: (state: typeof readyState) => void;
  const current = jest.spyOn(session, 'current').mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  try {
    const saving = saveGptApps({ on: ['com.Slack'] });
    await session.signOut();
    release(readyState);
    expect(await saving).toBe(false);
    expect(gptApps()).toBeNull();
  } finally { current.mockRestore(); }
});

test('pending logout blocks a credentialed send even with stale choices and ready status', async () => {
  await saveGptApps({ on: ['com.twitter.android'] });
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
    expect(gptChoice('com.twitter.android')).toBe(true);
    expect(await saveGptApps({ on: [] })).toBe(false);
    releaseAuth({ access: 'fixture-access', accountId: 'fixture-account' });
    expect(await writing).toMatchObject({ drafts: ['phone one', 'phone two', 'phone three'] });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
    releaseLogout();
    await leaving;
  } finally { global.fetch = originalFetch; }
});

test('sign-out blocks an in-flight send even when clearing app choices fails', async () => {
  await saveGptApps({ on: ['com.twitter.android'] });
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
    expect(gptChoice('com.twitter.android')).toBe(true);
    expect(signOut).toHaveBeenCalledTimes(1);
    release({ access: 'fixture-access', accountId: 'fixture-account' });
    expect(await writing).toMatchObject({ drafts: ['phone one', 'phone two', 'phone three'] });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test('a newer off choice blocks a later reply request', async () => {
  await saveGptApps({ on: ['com.twitter.android'] });
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

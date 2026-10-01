import { PHONE_ONLY_KEY, SOURCE_KEY } from '../../core/source';
import { store } from '../../core/store';
import { fitBackends } from '../settings';
import { status } from '../accounts';
import * as Switch from '../../core/switch';
import { judgeFit } from '../../grow/fit';
import { NO_RULES } from '../../core/slop';
import { platformForApp } from '../../core/platforms';
import Native from '../../../modules/ownvoice-native';
import { signOut } from '../accounts';
import { session } from '../session';

jest.mock('../../../modules/ownvoice-native', () => ({
  __esModule: true,
  default: { bubbleRules: jest.fn(async () => ({ paused: false, on: [], off: ['com.reddit.frontpage'] })), setBubbleRules: jest.fn(async () => {}), modelStatus: jest.fn(async () => 'available') },
}));
jest.mock('../accounts', () => {
  const actual = jest.requireActual('../accounts');
  actual.accounts.runtime = jest.fn(async () => ({ getAuth: async () => ({ auth: { apiKey: 'fixture-access' } }), readCredential: async () => ({ type: 'oauth', accountId: 'fixture-account' }) }));
  actual.accounts.failed = jest.fn(async (_member: string, _key: string, error: { kind: string; until: number }) => ({ kind: error.kind, until: error.until }));
  return { ...actual,
  reportFailure: jest.fn(async () => null),
  signOut: jest.fn(async () => {}),
  codexAuth: jest.fn(async () => ({ access: 'fixture-access', accountId: 'fixture-account' })),
  refresh: jest.fn(async () => {}),
  signInState: jest.fn(() => null),
  status: jest.fn(async () => ({ account: 'owner', name: 'ChatGPT', state: 'ready', words: 'ChatGPT is connected.' })),
}; });

jest.mock('../../panel/phoneWriter', () => ({ phoneWriter: { write: jest.fn(async () => ({ drafts: ['phone one', 'phone two', 'phone three'] })) } }));
jest.mock('expo/fetch', () => ({ fetch: (...args: Parameters<typeof fetch>) => global.fetch(...args) }));

const native = Native as jest.Mocked<typeof Native>;
const ready = status as jest.Mock;
const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;


beforeEach(() => {
  kv.clear();
  jest.restoreAllMocks();
  jest.clearAllMocks();
  native.bubbleRules.mockResolvedValue({ paused: false, on: [], off: ['com.reddit.frontpage'] });
  native.modelStatus.mockResolvedValue('available');
  ready.mockResolvedValue({ account: 'owner', name: 'ChatGPT', state: 'ready', words: 'ChatGPT is connected.' });
  store.set(SOURCE_KEY, 'chatgpt');
});


const platform = platformForApp('com.twitter.android');
const options = { post: 'Umer built a timer.', candidates: ['Does it pause?', 'Game changer!'], platform, voice: { ...NO_RULES, never: ['game changer'] } };
const evaluate = (fetcher: typeof fetch) => judgeFit({ ...options, backends: fitBackends('com.twitter.android', {}, fetcher) });

test.each([
  ['phone-listed', 'on'], ['switch off', 'off'], ['unknown switch', null], ['phone source', 'on'], ['paused', 'on'], ['bubble off', 'on'], ['signed out', 'on'], ['signing out', 'on'],
])('%s gives rules only and zero response fetches', async (scenario, value) => {
  jest.spyOn(Switch, 'chatgptEnabled').mockResolvedValue(value === 'on');
  jest.spyOn(Switch, 'currentSwitch').mockResolvedValue(value ? { seq: 1, chatgpt: value, fetchedAt: Date.now() } as Switch.SwitchState : null);
  if (scenario === 'phone-listed') store.set(PHONE_ONLY_KEY, ['com.twitter.android']);
  else store.set(PHONE_ONLY_KEY, []);
  if (scenario === 'phone source') store.set(SOURCE_KEY, 'phone');
  if (scenario === 'paused') native.bubbleRules.mockResolvedValue({ paused: true, on: [], off: [] });
  if (scenario === 'bubble off') native.bubbleRules.mockResolvedValue({ paused: false, on: [], off: ['com.twitter.android'] });
  if (scenario === 'signed out') ready.mockResolvedValue({ state: 'signed_out' });
  let release: (() => void) | undefined;
  let leaving: Promise<unknown> | undefined;
  if (scenario === 'signing out') {
    (signOut as jest.Mock).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    leaving = session.signOut();
  }
  const fetcher = jest.fn(async () => { throw new Error('Must not fetch'); });
  try {
    expect((await evaluate(fetcher)).map(f => f.level)).toEqual([null, 0]);
    expect(fetcher).not.toHaveBeenCalled();
  } finally { release?.(); await leaving; }
});

test('switch on sends one JSON decision through accounts and its dispatch guard', async () => {
  store.set(PHONE_ONLY_KEY, []);
  jest.spyOn(Switch, 'chatgptEnabled').mockResolvedValue(true);
  jest.spyOn(Switch, 'currentSwitch').mockResolvedValue({ seq: 1, chatgpt: 'on', fetchedAt: Date.now() });
  const raw = JSON.stringify({ fit_0: { 0: 0, 1: 0, 2: 0, 3: 1 } });
  const sse = `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: raw })}\n\ndata: ${JSON.stringify({ type: 'response.completed' })}\n\n`;
  const fetcher = jest.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ({ ok: true, body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(sse)); controller.close(); } }) } as Response));
  expect((await evaluate(fetcher)).map(f => f.level)).toEqual([3, 0]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const request = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
  expect(request.text.format).toEqual({ type: 'json_object' });
  expect(JSON.stringify(request)).not.toMatch(/fit_1|Game changer/);
});

import { PHONE_ONLY_KEY, SOURCE_KEY } from '../../core/source';
import { store } from '../../core/store';
import { fitBackends } from '../settings';
import { status } from '../accounts';
import * as Switch from '../../core/switch';
import { judgeFit, LEVELS, UNAVAILABLE, UNSURE } from '../../grow/fit';
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
const options = { post: 'Umer built a timer.', candidates: ['Does it pause when you switch apps?', 'Game changer!'], platform };
const evaluate = (fetcher: typeof fetch, key = 'fixture-jev-key') => judgeFit({ ...options, backends: fitBackends('com.twitter.android', { key, fetch: fetcher }) });
const consent = () => {
  store.set(PHONE_ONLY_KEY, []);
  jest.spyOn(Switch, 'chatgptEnabled').mockResolvedValue(true);
  jest.spyOn(Switch, 'currentSwitch').mockResolvedValue({ seq: 1, chatgpt: 'on', fetchedAt: Date.now() });
};
const jevReply = (answers: object) => jest.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ answers, usage: { input_tokens: 9, output_tokens: 2 } })));

test('no Jev key: no backend, no fetch, and every card says the fit cannot be rated', async () => {
  consent();
  const fetcher = jevReply({});
  expect(fitBackends('com.twitter.android', { key: '', fetch: fetcher })).toEqual([]);
  expect((await evaluate(fetcher, '')).map(f => f.words)).toEqual([UNAVAILABLE, UNAVAILABLE]);
  expect(fetcher).not.toHaveBeenCalled();
});

test('a key turns it on: one Jev request with the rubric, its probabilities become the levels', async () => {
  consent();
  const fetcher = jevReply({
    fit_0: { probabilities: { 0: 0.05, 1: 0.1, 2: 0.2, 3: 0.65 }, confidence: 0.65 },
    fit_1: { probabilities: { 0: 0.3, 1: 0.3, 2: 0.2, 3: 0.2 }, confidence: 0.3 },
  });
  const fits = await evaluate(fetcher);
  expect(fits).toEqual([{ level: 3, words: LEVELS[3], probability: 0.65 }, { level: null, words: UNSURE, probability: null }]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe('https://api.typesafe.ai/v1/systemone');
  expect((init!.headers as Record<string, string>).authorization).toBe('Bearer fixture-jev-key');
  const request = JSON.parse(init!.body as string);
  expect(request.model).toBe('jev-latest');
  expect(request.state.candidates).toEqual({ 0: options.candidates[0], 1: options.candidates[1] });
  expect(request.questions.fit_0).toMatchObject({ type: 'score', criteria: LEVELS });
  expect(request.questions.fit_0.instructions).toMatch(/^An X reply\. .*Rate candidates\["0"\] only/);
});

test.each([
  ['phone-listed', 'on'], ['switch off', 'off'], ['unknown switch', null], ['phone source', 'on'], ['paused', 'on'], ['bubble off', 'on'], ['signed out', 'on'], ['signing out', 'on'],
])('%s sends nothing to Jev and says the fit cannot be rated', async (scenario, value) => {
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
    expect((await evaluate(fetcher)).map(f => f.words)).toEqual([UNAVAILABLE, UNAVAILABLE]);
    expect(fetcher).not.toHaveBeenCalled();
  } finally { release?.(); await leaving; }
});

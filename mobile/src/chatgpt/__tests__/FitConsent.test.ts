import { PHONE_ONLY_KEY, SOURCE_KEY } from '../../core/source';
import { store } from '../../core/store';
import { fitBackends } from '../settings';
import { status } from '../accounts';
import * as Switch from '../../core/switch';
import { judgeFit, rated, LEVELS, UNSURE } from '../../grow/fit';
import { platformForApp } from '../../core/platforms';
import Native from '../../../modules/ownvoice-native';
import { signOut } from '../accounts';
import { session } from '../session';

jest.mock('../../../modules/ownvoice-native', () => ({
  __esModule: true,
  default: { bubbleRules: jest.fn(async () => ({ paused: false, on: [], off: ['com.reddit.frontpage'] })), setBubbleRules: jest.fn(async () => {}) },
}));
jest.mock('../accounts', () => {
  const actual = jest.requireActual('../accounts');
  actual.accounts.runtime = jest.fn(async () => ({ getAuth: async () => ({ auth: { apiKey: 'fixture-access' } }), readCredential: async () => ({ type: 'oauth', accountId: 'fixture-account' }) }));
  actual.accounts.failed = jest.fn(async (_member: string, _key: string, error: { kind: string; until: number }) => ({ kind: error.kind, until: error.until }));
  const mockSignIn = jest.fn(async (_provider?: string) => {});
  const mockSignOut = jest.fn(async (_provider?: string) => {});
  const mockSignInState = jest.fn((_provider?: string) => null);
  const mockStatus = jest.fn(async (_provider?: string) => ({ account: 'owner', name: 'ChatGPT', state: 'ready', words: 'ChatGPT is connected.' }));
  const mockCancelSignIn = jest.fn((_provider?: string) => {});
  const mockRefresh = jest.fn(async () => {});
  return { ...actual,
  reportFailure: jest.fn(async () => null),
  signIn: mockSignIn,
  signOut: mockSignOut,
  codexAuth: jest.fn(async () => ({ access: 'fixture-access', accountId: 'fixture-account' })),
  refresh: mockRefresh,
  signInState: mockSignInState,
  status: mockStatus,
  cancelSignIn: mockCancelSignIn,
  signInChatGPT: () => mockSignIn('chatgpt'),
  signOutChatGPT: () => mockSignOut('chatgpt'),
  signInStateChatGPT: () => mockSignInState('chatgpt'),
  statusChatGPT: () => mockStatus('chatgpt'),
  cancelSignInChatGPT: () => mockCancelSignIn('chatgpt'),
}; });

jest.mock('../../panel/phoneWriter', () => ({ phoneWriter: { write: jest.fn(async () => ({ drafts: ['phone one', 'phone two', 'phone three'] })) } }));
jest.mock('expo/fetch', () => ({ fetch: (...args: Parameters<typeof fetch>) => global.fetch(...args) }));

const native = Native as jest.Mocked<typeof Native>;
jest.mock('../../core/localModel', () => ({ localModelState: jest.fn(), agreedToDownload: jest.fn(() => false) }));
import { localModelState } from '../../core/localModel';
const mockState = localModelState as jest.MockedFunction<typeof localModelState>;
const ready = status as jest.Mock;
const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;


beforeEach(() => {
  kv.clear();
  jest.restoreAllMocks();
  jest.clearAllMocks();
  native.bubbleRules.mockResolvedValue({ paused: false, on: [], off: ['com.reddit.frontpage'] });
  mockState.mockResolvedValue({ phase: 'ready' });
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

test('no Jev key: the fit runs on the signed-in ChatGPT plan backend', async () => {
  consent();
  const fetcher = jevReply({});
  const backends = fitBackends('com.twitter.android', { key: '', fetch: fetcher });
  expect(backends).toHaveLength(1);
  expect(backends[0].name).toBe('chatgpt');
  expect(backends[0].leaves).toBe(true);
});

test('a fit request marks its own tap Sent through the read-log hooks it was given', async () => {
  consent();
  const sent = jest.fn();
  const unsent = jest.fn();
  const fetcher = jest.fn(async () => ({ ok: false, status: 429, text: async () => 'Too many requests', body: null } as unknown as Response));
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    const [backend] = fitBackends('com.twitter.android', { on: { sent, unsent }, fetch: fetcher });
    await expect(backend.ask('rate the options', new AbortController().signal)).rejects.toThrow();
    expect(sent).toHaveBeenCalledTimes(1);
    expect(unsent).not.toHaveBeenCalled();
  } finally { log.mockRestore(); }
});

test('a key turns it on: one Jev request with the rubric, its probabilities become the levels', async () => {
  consent();
  const fetcher = jevReply({
    fit_0: { probabilities: { 0: 0.05, 1: 0.1, 2: 0.2, 3: 0.65 }, confidence: 0.65 },
    fit_1: { probabilities: { 0: 0.3, 1: 0.3, 2: 0.2, 3: 0.2 }, confidence: 0.3 },
  });
  const fits = await evaluate(fetcher);
  expect(fits).toEqual([{ level: 3, words: LEVELS[3], probability: 0.65, voice: null }, { level: null, words: UNSURE, probability: null, voice: null }]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe('https://api.typesafe.ai/v1/systemone');
  expect((init!.headers as Record<string, string>).authorization).toBe('Bearer fixture-jev-key');
  const request = JSON.parse(init!.body as string);
  expect(request.model).toBe('jev-latest');
  expect(request.state.candidates).toEqual({ 0: options.candidates[0], 1: options.candidates[1] });
  expect(request.questions.fit_0).toMatchObject({ type: 'score', criteria: LEVELS });
  expect(request.questions.fit_0.instructions).toMatch(/^An X reply\. .*Rate candidates\["0"\] only/);
  expect(request.questions.voice_0.type).toBe('noul');
});

test('the same call carries the selected samples as a Sounds-like-you yes/no per card', async () => {
  consent();
  const samples = ['Sounds good.', "I'm in."];
  const fetcher = jevReply({
    fit_0: { probabilities: { 0: 0.05, 1: 0.1, 2: 0.2, 3: 0.65 }, confidence: 0.65 },
    voice_0: { noul: 0.85 },
    fit_1: { probabilities: { 0: 0.7, 1: 0.15, 2: 0.1, 3: 0.05 }, confidence: 0.7 },
    voice_1: { noul: 0.2 },
  });
  const fits = await judgeFit({ ...options, samples, backends: fitBackends('com.twitter.android', { key: 'fixture-jev-key', fetch: fetcher }) });
  expect(fits).toEqual([
    { level: 3, words: LEVELS[3], probability: 0.65, voice: true },
    { level: 0, words: LEVELS[0], probability: 0.7, voice: false },
  ]);
  const [, init] = fetcher.mock.calls[0];
  const request = JSON.parse(init!.body as string);
  expect(request.state.samples).toEqual(samples);
  expect(request.questions.voice_0.instructions).toContain('candidates["0"]');
  expect(request.questions.voice_1.instructions).toContain('candidates["1"]');
  // An abstained yes/no reads as nothing judged, and the levels never move for it.
  const quiet = jevReply({
    fit_0: { probabilities: { 0: 0.05, 1: 0.1, 2: 0.2, 3: 0.65 }, confidence: 0.65 },
    voice_0: { noul: 0.55 },
  });
  expect(await judgeFit({ ...options, samples, backends: fitBackends('com.twitter.android', { key: 'fixture-jev-key', fetch: quiet }) }))
    .toEqual([
      { level: 3, words: LEVELS[3], probability: 0.65, voice: null },
      { level: null, words: UNSURE, probability: null, voice: null },
    ]);
});

test('LinkedIn has its own rubric: a strong reply, a skipped one and an abstain', async () => {
  consent();
  expect(rated(platformForApp('com.linkedin.android'))).toBe(true);
  const platform = platformForApp('com.linkedin.android');
  const options = { post: 'After 6 years leading platform teams, I am starting my own consultancy.',
    candidates: ['We did the same review in Leeds: one chatty call on every page load, a small cache cut the slow calls from 900ms to 210ms.', 'Great post! Love this 🔥', 'Nice, consulting is always interesting.'], platform };
  const evaluate = (fetcher: typeof fetch) => judgeFit({ ...options, backends: fitBackends('com.linkedin.android', { key: 'fixture-jev-key', fetch: fetcher }) });
  const fetcher = jevReply({
    fit_0: { probabilities: { 0: 0.02, 1: 0.03, 2: 0.15, 3: 0.8 }, confidence: 0.8 },
    fit_1: { probabilities: { 0: 0.7, 1: 0.15, 2: 0.1, 3: 0.05 }, confidence: 0.7 },
    fit_2: { probabilities: { 0: 0.2, 1: 0.3, 2: 0.3, 3: 0.2 }, confidence: 0.3 },
  });
  const fits = await evaluate(fetcher);
  expect(fits).toEqual([
    { level: 3, words: LEVELS[3], probability: 0.8, voice: null },
    { level: 0, words: LEVELS[0], probability: 0.7, voice: null },
    { level: null, words: UNSURE, probability: null, voice: null },
  ]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [, init] = fetcher.mock.calls[0];
  const request = JSON.parse(init!.body as string);
  expect(request.state.platform).toBe('LinkedIn');
  expect(request.questions.fit_0.instructions).toMatch(/^A LinkedIn reply\. /);
  expect(request.questions.fit_0.instructions).toContain('Rate candidates["0"] only');
});
test.each([
  ['phone-listed', 'on'], ['switch off', 'off'], ['unknown switch', null], ['phone source', 'on'], ['paused', 'on'], ['bubble off', 'on'], ['signed out', 'on'], ['signing out', 'on'],
])('%s sends no fit call and abstains with the plain unsure read', async (scenario, value) => {
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
    expect((await evaluate(fetcher)).map(f => f.words)).toEqual([UNSURE, UNSURE]);
    expect(fetcher).not.toHaveBeenCalled();
  } finally { release?.(); await leaving; }
});

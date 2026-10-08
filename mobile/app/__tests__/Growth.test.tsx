import { AppState } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import Home from '../index';
import Growth from '../growth';
import { router } from 'expo-router';
import { session, nothing } from '../../src/chatgpt/session';
import Native from '../../modules/ownvoice-native';
import { words, technicalWords } from '../../src/core/words';
import { growthCounts, outcomes } from '../../src/core/store';

jest.mock('../../modules/ownvoice-native', () => ({
  __esModule: true,
  default: {
    serviceState: jest.fn(), turnOff: jest.fn(),
    bubbleRules: jest.fn(), setBubbleRules: jest.fn(), launcherApps: jest.fn(), takeTapFacts: jest.fn(),
    clearTapFacts: jest.fn(), forget: jest.fn(), addListener: jest.fn(), sharedMarkdown: jest.fn(), finishRewrite: jest.fn(),
    typingCheck: jest.fn(), setTypingCheck: jest.fn(),
  },
}));

jest.mock('../../src/chatgpt/session', () => ({
  NAME: 'ChatGPT',
  GPT_APPS_KEY: 'chatgpt-apps',
  mocked: false,
  nothing: { signedIn: false, waiting: false, code: null, url: null, note: null, resting: null },
  sessionNow: jest.fn(() => ({ signedIn: false })),
  signOutGuard: jest.fn(() => ({ active: false, epoch: 0 })),
  session: { current: jest.fn(), start: jest.fn(), cancel: jest.fn(), signOut: jest.fn() },
}));
const gpt = session as jest.Mocked<typeof session>;

jest.mock('../../src/core/localModel', () => ({
  AGREED_KEY: 'local-model-agreed',
  MOBILE_KEY: 'local-model-mobile-data',
  getLocalModel: jest.fn(() => ({ state: { phase: 'installing' } })),
  localModelState: jest.fn(),
  agreedToDownload: jest.fn(),
  installLocalModel: jest.fn(),
  removeLocalModel: jest.fn(),
}));
import { agreedToDownload, installLocalModel, localModelState } from '../../src/core/localModel';
const mockState = localModelState as jest.MockedFunction<typeof localModelState>;
const mockAgreed = agreedToDownload as jest.MockedFunction<typeof agreedToDownload>;

const native = Native as jest.Mocked<typeof Native>;
const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;
const fetchMock = jest.fn(() => Promise.reject(new Error('offline')));

const rules = { paused: false, on: ['com.netflix.netflix'], off: ['com.google.android.gm'] };
const apps = [
  { app: 'com.whatsapp', label: 'WhatsApp', icon: null },
  { app: 'com.google.android.gm', label: 'Gmail', icon: null },
  { app: 'com.netflix.netflix', label: 'Netflix', icon: null },
];

beforeEach(() => {
  kv.clear();
  kv.set('setup-done', '"done"');
  jest.clearAllMocks();
  for (const method of Object.values(native)) if (jest.isMockFunction(method)) method.mockReset();
  native.serviceState.mockResolvedValue('on');
  mockState.mockResolvedValue({ phase: 'ready' });
  mockAgreed.mockReturnValue(false);
  native.bubbleRules.mockResolvedValue(rules);
  native.launcherApps.mockResolvedValue(apps);
  native.takeTapFacts.mockResolvedValue([]);
  native.typingCheck.mockResolvedValue(false);
  (native.addListener as jest.Mock).mockReturnValue({ remove: () => {} });
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: () => {} });
  gpt.current.mockResolvedValue(nothing);
  (global as Record<string, unknown>).fetch = fetchMock;
  fetchMock.mockClear();
});

const due = (id: string, at: number) => ({ id, platform: 'x', platformLabel: 'X', level: 'Good fit here', card: 'suggestion' as const, slot: 0, at });

test('a due insert asks once; each answer is saved onto its own record with no network call', async () => {
  const old = Date.now() - 25 * 3600_000;
  kv.set('reply-outcomes', JSON.stringify([due('a', old), due('b', old + 1), due('c', old + 2), due('d', old + 3)]));
  kv.set('growth-counts', JSON.stringify([{ at: Date.now(), x: '10', reddit: '5' }]));
  const screen = await render(<Home />);
  await screen.findByText(words.statusReady);
  const answers: [string, 'replies' | 'likes' | 'nothing' | 'not-posted'][] = [
    [words.checkinReplies, 'replies'], [words.checkinLikes, 'likes'], [words.checkinQuiet, 'nothing'], [words.checkinSkipped, 'not-posted'],
  ];
  for (const [label, value] of answers) {
    await waitFor(() => expect(screen.getByText(`How did your reply ${words.checkinOn} X do?`)).toBeTruthy());
    await fireEvent.press(screen.getByText(label));
    await waitFor(() => expect(outcomes().find(row => row.checkin === value)).toBeTruthy());
  }
  expect(outcomes().map(row => row.checkin)).toEqual(['replies', 'likes', 'nothing', 'not-posted']);
  expect(outcomes().every(row => typeof row.checkinAt === 'number')).toBe(true);
  expect(screen.queryByText(`How did your reply ${words.checkinOn} X do?`)).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('a fresh insert stays quiet until about a day passes', async () => {
  kv.set('reply-outcomes', JSON.stringify([due('fresh', Date.now() - 3600_000)]));
  const screen = await render(<Home />);
  await screen.findByText(words.statusReady);
  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByText(words.checkinReplies)).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('the weekly card saves his own typed counts on this phone, and the growth screen shows them', async () => {
  const screen = await render(<Home />);
  await screen.findByText(words.statusReady);
  expect(screen.getByText(words.weeklyTitle)).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText(words.weeklyX), '1234');
  await fireEvent.changeText(screen.getByLabelText(words.weeklyReddit), '567');
  await fireEvent.press(screen.getByText(words.weeklySave));
  await waitFor(() => expect(growthCounts()).toHaveLength(1));
  expect(growthCounts()[0]).toMatchObject({ x: '1234', reddit: '567' });
  expect(screen.getByText(words.weeklySaved)).toBeTruthy();
  expect(screen.queryByText(words.weeklyTitle)).toBeNull();
  await fireEvent.press(screen.getByText(words.growthOpen));
  expect(router.push).toHaveBeenCalledWith('/growth');
  const growth = await render(<Growth />);
  expect(await growth.findByText('1234')).toBeTruthy();
  expect(growth.getByText('567')).toBeTruthy();
  expect(growth.getAllByText(words.growthNew)).toHaveLength(2);
  expect(growth.getByText(words.growthTitle)).toBeTruthy();
  const staticWords = [words.growthTitle, words.growthNote, words.weeklyX, words.weeklyReddit, words.growthNew, words.growthEmpty, words.weekThis, words.weekLast, words.weekOlder];
  expect(staticWords.filter(line => technicalWords.test(line) || /\d/.test(line))).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('two weeks of counts read as up since last week, never as caused growth', async () => {
  const week = 7 * 24 * 3600_000;
  const now = Date.now();
  kv.set('growth-counts', JSON.stringify([
    { at: now - week, x: '1200', reddit: '500' },
    { at: now, x: '1234', reddit: '500' },
  ]));
  const growth = await render(<Growth />);
  expect(await growth.findByText(words.growthUp)).toBeTruthy();
  expect(growth.getByText(words.growthSame)).toBeTruthy();
  expect(growth.toJSON()).not.toContain('Ownvoice got you');
  expect(fetchMock).not.toHaveBeenCalled();
});

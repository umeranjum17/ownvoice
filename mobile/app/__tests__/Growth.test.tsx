import { AppState, type AppStateStatus } from 'react-native';
import Storage from 'expo-sqlite/kv-store';
import Reads from '../reads';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import Home from '../index';
import Growth from '../growth';
import { router } from 'expo-router';
import { session, nothing } from '../../src/chatgpt/session';
import Native from '../../modules/ownvoice-native';
import { words, technicalWords } from '../../src/core/words';
import { growthCounts, outcomes, pendingCheckin, saveGrowthCount, store, GROWTH_COUNTS } from '../../src/core/store';

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

afterEach(() => { jest.restoreAllMocks(); });

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

test('failed Home growth reads hide stale prompts and links until a successful reload', async () => {
  let foreground = (_state: AppStateStatus) => {};
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, callback) => {
    foreground = callback;
    return { remove: () => {} };
  });
  const old = Date.now() - 8 * 24 * 3600_000;
  kv.set('reply-outcomes', JSON.stringify([due('reply', old)]));
  kv.set('growth-counts', JSON.stringify([{ at: old, x: '10', reddit: '5' }]));
  const screen = await render(<Home />);
  await screen.findByText(words.statusReady);
  expect(screen.getByText(words.checkinLikes)).toBeTruthy();
  expect(screen.getByText(words.weeklyTitle)).toBeTruthy();
  kv.set('growth-counts', '{');
  await act(async () => { foreground('active'); });
  expect(screen.queryByText(words.checkinLikes)).toBeNull();
  expect(screen.queryByText(words.weeklyTitle)).toBeNull();
  expect(screen.queryByText(words.growthOpen)).toBeNull();
  expect(kv.get('growth-counts')).toBe('{');
  kv.set('growth-counts', JSON.stringify([{ at: Date.now(), x: '10', reddit: '5' }]));
  await act(async () => { foreground('active'); });
  expect(screen.getByText(words.checkinLikes)).toBeTruthy();
  expect(screen.getByText(words.growthOpen)).toBeTruthy();
  kv.set('reply-outcomes', '{');
  await act(async () => { foreground('active'); });
  expect(screen.queryByText(words.checkinLikes)).toBeNull();
  expect(screen.queryByText(words.growthOpen)).toBeNull();
  expect(kv.get('reply-outcomes')).toBe('{');
});

test('a fresh insert stays quiet until about a day passes', async () => {
  kv.set('reply-outcomes', JSON.stringify([due('fresh', Date.now() - 3600_000)]));
  const screen = await render(<Home />);
  await screen.findByText(words.statusReady);
  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByText(words.checkinReplies)).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('the Home reminder opens count entry only on Growth, where failed saves preserve inputs', async () => {
  const screen = await render(<Home />);
  await screen.findByText(words.statusReady);
  expect(screen.getByText(words.weeklyTitle)).toBeTruthy();
  expect(screen.queryByLabelText(words.weeklyX)).toBeNull();
  expect(screen.queryByLabelText(words.weeklyReddit)).toBeNull();
  await fireEvent.press(screen.getByText(words.growthOpen));
  expect(router.push).toHaveBeenCalledWith('/growth');
  const growth = await render(<Growth />);
  await fireEvent.changeText(growth.getByLabelText(words.weeklyX), '1234');
  await fireEvent.changeText(growth.getByLabelText(words.weeklyReddit), '567');
  const write = jest.spyOn(Storage, 'setItemSync').mockImplementationOnce(() => { throw new Error('disk full'); });
  await fireEvent.press(growth.getByText(words.weeklySave));
  expect(growthCounts()).toHaveLength(0);
  expect(growth.getByLabelText(words.weeklyX).props.value).toBe('1234');
  expect(growth.getByLabelText(words.weeklyReddit).props.value).toBe('567');
  expect(growth.queryByText(words.weeklySaved)).toBeNull();
  expect(growth.getByText(words.outcomeFailed)).toBeTruthy();
  write.mockRestore();
  await fireEvent.press(growth.getByText(words.weeklySave));
  await waitFor(() => expect(growthCounts()).toHaveLength(1));
  expect(growthCounts()[0]).toMatchObject({ x: '1234', reddit: '567' });
  expect(growth.getByText(words.weeklySaved)).toBeTruthy();
  expect(growth.getByLabelText(words.weeklyX).props.value).toBe('');
  expect(growth.getByLabelText(words.weeklyReddit).props.value).toBe('');
  expect(growth.queryByText(words.outcomeFailed)).toBeNull();
  expect(await growth.findByText('1234')).toBeTruthy();
  expect(growth.getByText('567')).toBeTruthy();
  expect(growth.getAllByText(words.growthNew)).toHaveLength(2);
  expect(growth.getByText(words.growthTitle)).toBeTruthy();
  const staticWords = [words.growthTitle, words.growthNote, words.weeklyX, words.weeklyReddit, words.growthNew, words.growthEmpty, words.weeklyReminder, words.countFormat, words.growthUpChecked, words.growthSameChecked, words.growthDownChecked];
  expect(staticWords.filter(line => technicalWords.test(line) || /\d/.test(line))).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('only suggestion records become check-ins, and failed answers stay available', async () => {
  const old = Date.now() - 25 * 3600_000;
  kv.set('reply-outcomes', JSON.stringify([
    { ...due('own', old - 1), card: 'yours' }, due('reply', old),
  ]));
  expect(pendingCheckin()?.id).toBe('reply');
  const screen = await render(<Home />);
  await screen.findByText(words.statusReady);
  const write = jest.spyOn(Storage, 'setItemSync').mockImplementationOnce(() => { throw new Error('disk full'); });
  await fireEvent.press(screen.getByText(words.checkinLikes));
  expect(outcomes().every(row => !row.checkin)).toBe(true);
  expect(screen.getByText(words.outcomeFailed)).toBeTruthy();
  expect(screen.getByText(words.checkinLikes)).toBeTruthy();
  write.mockRestore();
  await fireEvent.press(screen.getByText(words.checkinLikes));
  expect(outcomes().find(row => row.id === 'reply')?.checkin).toBe('likes');
  expect(outcomes().find(row => row.id === 'own')?.checkin).toBeUndefined();
  expect(pendingCheckin()).toBeNull();
});

test('both count fields reject invalid input before writing either field', () => {
  saveGrowthCount('10', '-5');
  const before = growthCounts();
  for (const [x, reddit] of [['1,234', '5'], ['10', '1,234'], ['-1', '5'], ['10', '1.5'], ['9007199254740992', '5']]) {
    expect(() => saveGrowthCount(x, reddit)).toThrow();
    expect(growthCounts()).toEqual(before);
  }
  saveGrowthCount('', '');
  expect(growthCounts()).toEqual(before);
});

test('confirmed Wipe everything removes counts from storage and its memory snapshot', async () => {
  saveGrowthCount('1234', '567');
  const screen = await render(<Reads />);
  await fireEvent.press(screen.getByText(words.wipe));
  await fireEvent.press(screen.getByText(words.wipeYes));
  await waitFor(() => expect(kv.has(GROWTH_COUNTS)).toBe(false));
  expect(store.peek(GROWTH_COUNTS)).toBeNull();
  expect(growthCounts()).toEqual([]);
  const growth = await render(<Growth />);
  expect(await growth.findByText(words.growthEmpty)).toBeTruthy();
  expect(growth.queryByText('1234')).toBeNull();
});

test('skipped and stale observations keep each platform latest count and truthful comparisons', async () => {
  const week = 7 * 24 * 3600_000;
  const now = Date.now();
  kv.set('growth-counts', JSON.stringify([
    { at: now - 6 * week, x: '100', reddit: '50' },
    { at: now - 5 * week, x: '110', reddit: '' },
    { at: now - 3 * week, x: '90', reddit: '60' },
    { at: now - 2 * week, x: '', reddit: '60' },
  ]));
  const growth = await render(<Growth />);
  expect(await growth.findByText('90')).toBeTruthy();
  expect(growth.getByText('60')).toBeTruthy();
  expect(growth.getByText(words.growthDownChecked)).toBeTruthy();
  expect(growth.getByText(words.growthSameChecked)).toBeTruthy();
  expect(growth.queryByText(words.growthDown)).toBeNull();
  expect(growth.queryByText(words.growthSame)).toBeNull();
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

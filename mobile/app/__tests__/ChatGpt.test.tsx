import React from 'react';
import { Linking } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Source from '../source';
import { session, nothing, type GptState } from '../../src/chatgpt/session';
import { setSource, storedSource } from '../../src/core/source';
import { words, technicalWords } from '../../src/core/words';
import Native from '../../modules/ownvoice-native';

// How Ownvoice writes, the ChatGPT side: signing in right on the page, the switch asking first,
// switching back, and signing out while ChatGPT writes.
jest.mock('../../src/chatgpt/session', () => ({
  NAME: 'ChatGPT',
  GPT_APPS_KEY: 'chatgpt-apps',
  mocked: false,
  nothing: { signedIn: false, waiting: false, code: null, url: null, note: null, resting: null },
  sessionNow: jest.fn(() => ({ signedIn: false })),
  signOutGuard: jest.fn(() => ({ active: false, epoch: 0 })),
  session: { current: jest.fn(), start: jest.fn(), cancel: jest.fn(), signOut: jest.fn() },
}));
jest.mock('../../modules/ownvoice-native', () => ({
  __esModule: true,
  default: {
    copy: jest.fn(async () => {}),
    modelStatus: jest.fn(async () => 'available'),
    launcherApps: jest.fn(async () => [
      { app: 'com.google.android.gm', label: 'Gmail', icon: null },
      { app: 'com.Slack', label: 'Slack', icon: null },
    ]),
    bubbleRules: jest.fn(async () => ({ paused: false, on: ['com.Slack', 'com.google.android.gm'], off: [] })),
  },
}));

const fake = session as jest.Mocked<typeof session>;
const native = Native as jest.Mocked<typeof Native>;
const signedIn: GptState = { ...nothing, signedIn: true, note: 'ChatGPT is connected.' };
const waiting: GptState = { ...nothing, waiting: true, code: 'KQPT-MXVD', url: 'https://chatgpt.com/code', note: 'Sign in on the ChatGPT page that just opened.' };
const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;
const chosen = () => storedSource();

const visible = (node: unknown, out: string[] = []): string[] => {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach(child => visible(child, out));
  else if (node && typeof node === 'object' && 'children' in node) visible((node as { children: unknown }).children, out);
  return out;
};

// What the session reports when the page looks: the same thing the sign-in really does.
let reports: GptState = nothing;
const open = async (source: 'phone' | 'chatgpt' | null, state: GptState = nothing) => {
  setSource(source);
  reports = state;
  fake.current.mockImplementation(async () => reports);
  const screen = await render(<Source />);
  await screen.findByText(words.srcGpt);
  await waitFor(() => expect(fake.current).toHaveBeenCalled());
  await act(async () => { await Promise.resolve(); });
  return screen;
};

beforeEach(() => {
  kv.clear();
  kv.set('setup-done', 'true');
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  native.modelStatus.mockResolvedValue('available');
  fake.cancel.mockResolvedValue(nothing);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});

test('switching to ChatGPT signs in right on the page, and ChatGPT writes once connected', async () => {
  const screen = await open('phone');
  fake.start.mockImplementation(async () => (reports = waiting));
  await fireEvent.press(screen.getByText(words.srcGpt));
  expect(await screen.findByText('KQPT-MXVD')).toBeTruthy();
  expect(screen.getByText(words.signInNote)).toBeTruthy();
  expect(screen.getByText('Uses your ChatGPT plan. OpenAI may change this at any time.')).toBeTruthy();
  expect(chosen()).toBe('phone');
  await fireEvent.press(screen.getByText(words.copyAndOpen));
  expect(native.copy).toHaveBeenCalledWith('KQPT-MXVD');
  expect(Linking.openURL).toHaveBeenCalledWith('https://chatgpt.com/code');
  reports = signedIn;
  expect(await screen.findByText('ChatGPT is connected.', {}, { timeout: 3000 })).toBeTruthy();
  expect(chosen()).toBe('chatgpt');
  expect(screen.getByText(words.phoneBackup)).toBeTruthy();
  expect(screen.getByText(words.phoneOnlyApps)).toBeTruthy();
  expect(screen.getByText(words.gptSignOut)).toBeTruthy();
  expect(screen.getByText(words.privacyGpt)).toBeTruthy();
  expect(visible(screen.toJSON()).filter(text => technicalWords.test(text))).toEqual([]);
});

test('Cancel drops the waiting code and keeps this phone writing', async () => {
  const screen = await open('phone');
  fake.start.mockImplementation(async () => (reports = waiting));
  fake.cancel.mockImplementation(async () => (reports = nothing));
  await fireEvent.press(screen.getByText(words.srcGpt));
  await screen.findByText('KQPT-MXVD');
  await fireEvent.press(screen.getByText(words.gptCancel));
  expect(fake.cancel).toHaveBeenCalled();
  expect(screen.queryByText('KQPT-MXVD')).toBeNull();
  expect(chosen()).toBe('phone');
  expect(screen.getByText(words.privacyPhone)).toBeTruthy();
});

test('leaving the page mid sign-in keeps nothing', async () => {
  const screen = await open('phone');
  fake.start.mockImplementation(async () => (reports = waiting));
  await fireEvent.press(screen.getByText(words.srcGpt));
  await screen.findByText('KQPT-MXVD');
  await act(async () => { await screen.unmount(); });
  expect(fake.cancel).toHaveBeenCalled();
  expect(chosen()).toBe('phone');
});

test('a failed sign-in says what happened and offers Try again', async () => {
  const screen = await open('phone');
  fake.start.mockResolvedValue({ ...nothing, note: 'The code expired before it was used.' });
  await fireEvent.press(screen.getByText(words.srcGpt));
  expect(await screen.findByText('The code expired before it was used.')).toBeTruthy();
  fake.start.mockImplementation(async () => (reports = waiting));
  await fireEvent.press(screen.getByText(words.tryAgain));
  expect(await screen.findByText('KQPT-MXVD')).toBeTruthy();
  expect(fake.start).toHaveBeenCalledTimes(2);
});

test('already signed in: switching asks first, and Keep it on this phone changes nothing', async () => {
  const screen = await open('phone', signedIn);
  await fireEvent.press(screen.getByText(words.srcGpt));
  expect(screen.getByText(words.switchTitle)).toBeTruthy();
  expect(screen.getByText(words.switchBody)).toBeTruthy();
  await fireEvent.press(screen.getByText(words.switchNo));
  expect(screen.queryByText(words.switchTitle)).toBeNull();
  expect(chosen()).toBe('phone');
  expect(fake.start).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText(words.srcGpt));
  await fireEvent.press(screen.getByText(words.switchYes));
  expect(chosen()).toBe('chatgpt');
  expect(screen.queryByText(words.switchTitle)).toBeNull();
  expect(screen.getByText(words.switchNote)).toBeTruthy();
});

test('switching back to the phone is immediate, and ChatGPT stays signed in', async () => {
  const screen = await open('chatgpt', signedIn);
  await fireEvent.press(screen.getByText(words.srcPhone));
  expect(chosen()).toBe('phone');
  expect(screen.queryByText(words.switchTitle)).toBeNull();
  expect(fake.signOut).not.toHaveBeenCalled();
  expect(screen.getByText(words.privacyPhone)).toBeTruthy();
  expect(screen.queryByText(words.gptSignOut)).toBeNull();
});

test('signing out while ChatGPT writes hands the writing to this phone', async () => {
  const screen = await open('chatgpt', signedIn);
  fake.signOut.mockResolvedValue({ ...nothing, note: "ChatGPT isn't signed in yet." });
  await fireEvent.press(screen.getByText(words.gptSignOut));
  await waitFor(() => expect(chosen()).toBe('phone'));
  expect(screen.getByText(words.privacyPhone)).toBeTruthy();
});

test('signing out on a phone that cannot write leaves nothing chosen', async () => {
  native.modelStatus.mockResolvedValue('unavailable');
  const screen = await open('chatgpt', signedIn);
  expect(screen.getByText(words.srcPhoneCant)).toBeTruthy();
  expect(screen.queryByText(words.phoneBackup)).toBeNull();
  fake.signOut.mockResolvedValue({ ...nothing, note: "ChatGPT isn't signed in yet." });
  await fireEvent.press(screen.getByText(words.gptSignOut));
  await waitFor(() => expect(chosen()).toBeNull());
});

test('a failed sign-out says so and keeps ChatGPT', async () => {
  const screen = await open('chatgpt', signedIn);
  fake.signOut.mockRejectedValue(new Error('locked'));
  await fireEvent.press(screen.getByText(words.gptSignOut));
  expect(await screen.findByText(words.gptSignOutFailed)).toBeTruthy();
  expect(chosen()).toBe('chatgpt');
});

test('a resting plan says so, and this phone writes until then', async () => {
  const screen = await open('chatgpt', { ...signedIn, note: 'ChatGPT is resting until 3:40pm.', resting: 'ChatGPT is resting until 3:40pm.' });
  expect(screen.getByText('ChatGPT is resting until 3:40pm.')).toBeTruthy();
  expect(screen.getByText(words.restingPhone)).toBeTruthy();
});

test('ChatGPT chosen but signed out offers the sign-in in its card', async () => {
  const screen = await open('chatgpt');
  expect(screen.getByText('ChatGPT needs you to sign in again.')).toBeTruthy();
  fake.start.mockImplementation(async () => (reports = waiting));
  await fireEvent.press(screen.getByText(words.gptButton));
  expect(await screen.findByText('KQPT-MXVD')).toBeTruthy();
});

test('Home’s Continue with ChatGPT starts the sign-in on arrival', async () => {
  native.modelStatus.mockResolvedValue('unavailable');
  (useLocalSearchParams as jest.Mock).mockReturnValue({ start: 'chatgpt' });
  fake.start.mockImplementation(async () => (reports = waiting));
  const screen = await open(null);
  expect(await screen.findByText('KQPT-MXVD')).toBeTruthy();
  expect(fake.start).toHaveBeenCalledTimes(1);
});

test('the list of apps that stay on this phone is named, and opens', async () => {
  const screen = await open('chatgpt', signedIn);
  expect(await screen.findByText('Slack')).toBeTruthy();
  await fireEvent.press(screen.getByText(words.phoneOnlyApps));
  expect(router.push).toHaveBeenCalledWith('/phone-apps');
});

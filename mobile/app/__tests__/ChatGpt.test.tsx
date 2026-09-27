import React from 'react';
import { Linking } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import ChatGpt from '../chatgpt';
import { router } from 'expo-router';
import { session, nothing, type GptState } from '../../src/chatgpt/session';
import { words, CHATGPT_TERMS, technicalWords } from '../../src/core/words';
import Native from '../../modules/ownvoice-native';

jest.mock('../../src/chatgpt/session', () => ({
  nothing: { signedIn: false, waiting: false, code: null, url: null, note: null, resting: null },
  session: { current: jest.fn(), start: jest.fn(), cancel: jest.fn(), signOut: jest.fn() },
}));
jest.mock('../../modules/ownvoice-native', () => ({ __esModule: true, default: { copy: jest.fn(async () => {}) } }));

const fake = session as jest.Mocked<typeof session>;
const native = Native as jest.Mocked<typeof Native>;
const signedIn: GptState = { ...nothing, signedIn: true, note: 'ChatGPT is connected.' };
const waiting: GptState = { ...nothing, waiting: true, code: 'KQPT-MXVD', url: 'https://chatgpt.com/code', note: 'Sign in on the ChatGPT page that just opened.' };

const visible: string[] = [];
const collect = (node: unknown): void => {
  if (typeof node === 'string') visible.push(node);
  else if (Array.isArray(node)) node.forEach(collect);
  else if (node && typeof node === 'object' && 'children' in node) collect((node as { children: unknown }).children);
};
// What the session reports when the screen looks: the same thing the sign-in really does.
let reports: GptState = nothing;
const open = async (state: GptState) => {
  visible.length = 0;
  reports = state;
  fake.current.mockImplementation(async () => reports);
  const screen = await render(<ChatGpt />);
  await waitFor(() => expect(fake.current).toHaveBeenCalled());
  collect(screen.toJSON());
  return screen;
};

const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;
beforeEach(() => { kv.clear(); jest.clearAllMocks(); jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined); });

test('nobody signed in yet: one button and the terms line', async () => {
  const screen = await open(nothing);
  expect(screen.getByText(words.gptTitle)).toBeTruthy();
  expect(screen.getByText(words.gptNote)).toBeTruthy();
  expect(screen.getByText(CHATGPT_TERMS)).toBeTruthy();
  expect(screen.getByText(words.gptButton)).toBeTruthy();
  expect(visible.filter(text => technicalWords.test(text))).toEqual([]);
});

test('the code is shown big, can be copied, and can be given up on', async () => {
  const screen = await open(nothing);
  fake.start.mockImplementation(async () => (reports = waiting));
  await fireEvent.press(screen.getByText(words.gptButton));
  await waitFor(() => expect(screen.queryByText('KQPT-MXVD')).toBeTruthy());
  expect(screen.getByText(waiting.note ?? '')).toBeTruthy();
  expect(screen.queryByText(words.back)).toBeNull();
  await fireEvent.press(screen.getByText(words.copy));
  expect(native.copy).toHaveBeenCalledWith('KQPT-MXVD');
  fake.cancel.mockImplementation(async () => (reports = { ...nothing, note: 'Sign-in stopped. Nothing was kept.' }));
  await fireEvent.press(screen.getByText(words.gptCancel));
  await waitFor(() => expect(screen.queryByText('KQPT-MXVD')).toBeNull());
  expect(screen.getByText('Sign-in stopped. Nothing was kept.')).toBeTruthy();
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('a failed sign-in says what happened and offers the button again', async () => {
  const screen = await open({ ...nothing, note: 'The code expired before it was used. Tap Sign in with ChatGPT for a new one.' });
  expect(await screen.findByText(/code expired/)).toBeTruthy();
  expect(screen.getByText(words.gptButton)).toBeTruthy();
});

test('a connected account is named, and signing out is offered', async () => {
  const screen = await open(signedIn);
  expect(screen.getByText('ChatGPT is connected.')).toBeTruthy();
  expect(screen.getByText(words.gptApps)).toBeTruthy();
  fake.signOut.mockResolvedValue({ ...nothing, note: "ChatGPT isn't signed in yet." });
  await fireEvent.press(screen.getByText(words.gptSignOut));
  await waitFor(() => expect(fake.signOut).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByText(words.gptButton)).toBeTruthy());
  expect(visible.filter(text => technicalWords.test(text))).toEqual([]);
});

test('a newly connected account opens app choices until Done saves them', async () => {
  await open(signedIn);
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/gptapps'));
});

test('a resting plan says so in one line', async () => {
  const screen = await open({ ...signedIn, note: 'ChatGPT is resting until 3:40pm.' });
  expect(screen.getByText('ChatGPT is resting until 3:40pm.')).toBeTruthy();
  await act(async () => { await Promise.resolve(); });
});

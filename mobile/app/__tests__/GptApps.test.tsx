import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import GptApps from '../gptapps';
import { PHONE_ONLY_KEY, phoneOnly } from '../../src/core/source';
import { words } from '../../src/core/words';
import { store } from '../../src/core/store';
import Native from '../../modules/ownvoice-native';

jest.mock('../../src/chatgpt/session', () => ({
  GPT_APPS_KEY: 'chatgpt-apps',
  mocked: false,
  signOutGuard: jest.fn(() => ({ active: false, epoch: 0 })),
  session: { current: jest.fn(async () => ({ signedIn: true })) },
}));

jest.mock('../../modules/ownvoice-native', () => ({
  __esModule: true,
  default: {
    launcherApps: jest.fn(async () => [
      { app: 'com.google.android.gm', label: 'Gmail', icon: null },
      { app: 'com.Slack', label: 'Slack', icon: null },
      { app: 'com.android.chrome', label: 'Chrome', icon: null },
    ]),
    bubbleRules: jest.fn(async () => ({ paused: false, on: ['com.Slack'], off: [] })),
    clearSetupReturn: jest.fn(async () => {}),
  },
}));

const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;
beforeEach(() => {
  kv.clear();
  jest.clearAllMocks();
});

test('stays-on-phone choices are staged, then Done returns Home', async () => {
  kv.set('setup-done', 'true');
  const screen = await render(<GptApps />);
  await waitFor(() => expect(Native.launcherApps).toHaveBeenCalled());
  await screen.findByText('Gmail');
  expect(screen.getByText(words.phoneOnlyApps)).toBeTruthy();
  expect(screen.getByText('Slack')).toBeTruthy();
  expect(screen.queryByText('Chrome')).toBeNull();
  // The default phone-only app starts checked; everything else starts with ChatGPT.
  expect(screen.getAllByText(words.on)).toHaveLength(1);
  expect(screen.getAllByText(words.off)).toHaveLength(1);
  expect(kv.has(PHONE_ONLY_KEY)).toBe(false);
  await fireEvent.press(screen.getByText('Gmail'));
  await fireEvent.press(screen.getByText(words.done));
  await waitFor(() => expect(phoneOnly()).toEqual(['com.google.android.gm', 'com.Slack']));
  expect(router.dismissAll).toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
});

test('an initial list read failure shows no defaults and retry restores the saved list', async () => {
  kv.set('setup-done', 'true');
  store.set(PHONE_ONLY_KEY, ['com.Slack']);
  const storage = jest.requireMock('expo-sqlite/kv-store').default;
  const get = jest.spyOn(storage, 'getItemSync').mockImplementationOnce(() => { throw new Error('unavailable'); });
  const screen = await render(<GptApps />);
  try {
    await screen.findByText(words.gptAppsUnavailable);
    expect(screen.queryByText('Gmail')).toBeNull();
    expect(screen.queryByText(words.done)).toBeNull();
    expect(screen.getByText(words.gptAppsUnavailable)).toBeTruthy();
    expect(router.dismissAll).not.toHaveBeenCalled();
  } finally {
    get.mockRestore();
  }
  await fireEvent.press(screen.getByText(words.tryAgain));
  await screen.findByText('Gmail');
  expect(screen.getAllByText(words.on)).toHaveLength(1);
  await fireEvent.press(screen.getByText(words.done));
  await waitFor(() => expect(router.dismissAll).toHaveBeenCalled());
  expect(phoneOnly()).toEqual(['com.Slack']);
});

test('Done changes shown apps but preserves choices hidden by bubble settings', async () => {
  kv.set('setup-done', 'true');
  store.set(PHONE_ONLY_KEY, ['com.whatsapp', 'com.google.android.gm']);
  const screen = await render(<GptApps />);
  await screen.findByText('Gmail');
  await fireEvent.press(screen.getByText('Gmail'));
  await fireEvent.press(screen.getByText('Slack'));
  await fireEvent.press(screen.getByText(words.done));
  await waitFor(() => expect(router.dismissAll).toHaveBeenCalled());
  expect(phoneOnly()).toEqual(['com.whatsapp', 'com.Slack']);
});

test('Done does not erase hidden choices when the saved list cannot be read', async () => {
  kv.set('setup-done', 'true');
  store.set(PHONE_ONLY_KEY, ['com.whatsapp']);
  const screen = await render(<GptApps />);
  await screen.findByText('Gmail');
  const storage = jest.requireMock('expo-sqlite/kv-store').default;
  const get = jest.spyOn(storage, 'getItemSync').mockImplementationOnce(() => { throw new Error('unavailable'); });
  try {
    await fireEvent.press(screen.getByText(words.done));
    await screen.findByText(words.gptAppsSaveFailed);
    expect(router.dismissAll).not.toHaveBeenCalled();
  } finally {
    get.mockRestore();
  }
  expect(phoneOnly()).toEqual(['com.whatsapp']);
});

test('setup sign-in choice finishes setup and lands Home', async () => {
  const screen = await render(<GptApps />);
  await screen.findByText('Gmail');
  await fireEvent.press(screen.getByText(words.done));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  expect(phoneOnly()).toEqual(['com.Slack']);
  expect(kv.get('setup-done')).toBe('true');
  expect(kv.has('setup')).toBe(false);
  expect(Native.clearSetupReturn).toHaveBeenCalledTimes(1);
  expect(router.dismissAll).toHaveBeenCalledTimes(1);
  expect(router.back).not.toHaveBeenCalled();
});

test('setup completion failure keeps the choice screen open', async () => {
  (Native.clearSetupReturn as jest.Mock).mockRejectedValueOnce(new Error('write failed'));
  const screen = await render(<GptApps />);
  await screen.findByText('Gmail');
  await fireEvent.press(screen.getByText(words.done));
  await screen.findByText(words.gptAppsSaveFailed);
  expect(kv.get('setup-done')).toBeUndefined();
  expect(router.dismissAll).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText(words.done));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  expect(screen.queryByText(words.gptAppsSaveFailed)).toBeNull();
});

test('Done reports a save failure and keeps choices for a retry', async () => {
  kv.set('setup-done', 'true');
  const screen = await render(<GptApps />);
  await screen.findByText('Gmail');
  const set = jest.spyOn(store, 'set').mockImplementationOnce(() => { throw new Error('full'); });
  try {
    await fireEvent.press(screen.getByText(words.done));
    await screen.findByText(words.gptAppsSaveFailed);
    expect(kv.has(PHONE_ONLY_KEY)).toBe(false);
    expect(router.dismissAll).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText(words.done));
    await waitFor(() => expect(router.dismissAll).toHaveBeenCalledTimes(1));
    expect(phoneOnly()).toEqual(['com.Slack']);
    expect(screen.queryByText(words.gptAppsSaveFailed)).toBeNull();
  } finally {
    set.mockRestore();
  }
});

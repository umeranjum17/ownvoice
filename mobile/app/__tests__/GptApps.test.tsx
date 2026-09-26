import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import GptApps from '../gptapps';
import { gptApps, gptChoice } from '../../src/chatgpt/settings';
import { words } from '../../src/core/words';
import { store } from '../../src/core/store';
import Native from '../../modules/ownvoice-native';
import { session } from '../../src/chatgpt/session';

jest.mock('../../src/chatgpt/session', () => ({
  GPT_APPS_KEY: 'chatgpt-apps',
  mocked: false,
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
  (session.current as jest.Mock).mockResolvedValue({ signedIn: true });
});

test('Home choices are staged, then Done returns Home', async () => {
  kv.set('setup-done', 'true');
  const screen = await render(<GptApps />);
  await waitFor(() => expect(Native.launcherApps).toHaveBeenCalled());
  await screen.findByText('Gmail');
  expect(screen.getByText(words.gptAppsQuestion)).toBeTruthy();
  expect(screen.getByText('Slack')).toBeTruthy();
  expect(screen.queryByText('Chrome')).toBeNull();
  expect(screen.getAllByText(words.on)).toHaveLength(1);
  expect(screen.getAllByText(words.off)).toHaveLength(1);
  expect(gptApps()).toBeNull();
  await fireEvent.press(screen.getByText('Slack'));
  expect(gptApps()).toBeNull();
  await fireEvent.press(screen.getByText(words.done));
  expect(gptApps()).toEqual({ on: ['com.google.android.gm', 'com.Slack'] });
  expect(gptChoice('com.Slack')).toBe(true);
  expect(router.dismissAll).toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
});

test('Done changes shown apps but preserves choices hidden by bubble settings', async () => {
  kv.set('setup-done', 'true');
  store.set('chatgpt-apps', { on: ['com.whatsapp', 'com.google.android.gm'] });
  const screen = await render(<GptApps />);
  await screen.findByText('Gmail');
  await fireEvent.press(screen.getByText('Gmail'));
  await fireEvent.press(screen.getByText('Slack'));
  await fireEvent.press(screen.getByText(words.done));
  await waitFor(() => expect(router.dismissAll).toHaveBeenCalled());
  expect(gptApps()).toEqual({ on: ['com.whatsapp', 'com.Slack'] });
  expect(gptChoice('com.whatsapp')).toBe(true);
  expect(gptChoice('com.google.android.gm')).toBe(false);
});

test('Done does not erase hidden choices when the saved list cannot be read', async () => {
  kv.set('setup-done', 'true');
  store.set('chatgpt-apps', { on: ['com.whatsapp'] });
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
  expect(gptApps()).toEqual({ on: ['com.whatsapp'] });
});

test('setup sign-in choice finishes setup and lands Home', async () => {
  const screen = await render(<GptApps />);
  await screen.findByText('Gmail');
  await fireEvent.press(screen.getByText(words.done));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  expect(gptApps()).toEqual({ on: ['com.google.android.gm'] });
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
    expect(gptApps()).toBeNull();
    expect(router.dismissAll).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText(words.done));
    await waitFor(() => expect(router.dismissAll).toHaveBeenCalledTimes(1));
    expect(gptApps()).toEqual({ on: ['com.google.android.gm'] });
    expect(screen.queryByText(words.gptAppsSaveFailed)).toBeNull();
  } finally {
    set.mockRestore();
  }
});

test('Done reports expired sign-in without discarding choices', async () => {
  (session.current as jest.Mock).mockResolvedValueOnce({ signedIn: false });
  const screen = await render(<GptApps />);
  await screen.findByText('Gmail');
  await fireEvent.press(screen.getByText(words.done));
  await screen.findByText(words.gptAppsSignIn);
  expect(gptApps()).toBeNull();
  expect(router.dismissAll).not.toHaveBeenCalled();
});

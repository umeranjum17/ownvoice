import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import GptApps from '../gptapps';
import { gptApps, gptChoice } from '../../src/chatgpt/settings';
import { words } from '../../src/core/words';
import Native from '../../modules/ownvoice-native';
import { session } from '../../src/chatgpt/session';

jest.mock('../../src/chatgpt/session', () => ({
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
  },
}));

const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;
beforeEach(() => {
  kv.clear();
  jest.clearAllMocks();
  (session.current as jest.Mock).mockResolvedValue({ signedIn: true });
});

test('choices are staged, then saved together by Done', async () => {
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
  expect(router.back).toHaveBeenCalled();
});

test('Done cannot save choices before sign-in', async () => {
  (session.current as jest.Mock).mockResolvedValue({ signedIn: false });
  const screen = await render(<GptApps />);
  await screen.findByText('Gmail');
  await fireEvent.press(screen.getByText(words.done));
  expect(gptApps()).toBeNull();
  expect(router.back).not.toHaveBeenCalled();
});

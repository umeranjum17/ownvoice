jest.setTimeout(20000);
// First run, the "How should Ownvoice write?" step on the real Setup screen: nothing is selected on arrival, Continue stays
// off until a tap. The account, the phone's answer and the native module are fixtures; the screen and store are the app's own.
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import Setup from '../setup';
import { storedSource } from '../../src/core/source';
import { words } from '../../src/core/words';

jest.mock('../../src/chatgpt/session', () => ({
  GPT_APPS_KEY: 'chatgpt-apps', mocked: false,
  signOutGuard: jest.fn(() => ({ active: false, epoch: 0 })),
  accountSessions: { chatgpt: { session: { current: jest.fn(async () => ({ signedIn: false })) } } },
}));
jest.mock('../../modules/ownvoice-native', () => ({
  __esModule: true,
  default: {
    addListener: jest.fn(() => ({ remove: () => {} })),
    serviceState: jest.fn(async () => 'off'), setPractice: jest.fn(async () => {}), clearSetupReturn: jest.fn(async () => {}),
    typingCheck: jest.fn(async () => false), restrictedSettings: jest.fn(async () => 'clear'),
    launcherApps: jest.fn(async () => []), bubbleRules: jest.fn(async () => ({ paused: false, on: [], off: [] })),
  },
}));
jest.mock('../../src/core/phoneStatus', () => ({ phoneCanWrite: jest.fn(async () => 'ready') }));
jest.mock('../../src/core/phoneDownload', () => ({ getReady: jest.fn(async () => {}), resume: jest.fn(async () => {}) }));
jest.mock('../../src/chatgpt/settings', () => ({ saveBubbleRules: jest.fn(async () => {}) }));
jest.mock('../../src/chatgpt/accounts', () => {
  const actual = jest.requireActual('../../src/chatgpt/accounts');
  return { ...actual,
    refresh: jest.fn(async () => {}), signIn: jest.fn(async () => {}), signInState: jest.fn(() => null),
    status: jest.fn(async () => ({ account: 'owner', name: 'ChatGPT', state: 'ready', words: 'ChatGPT is connected.' })),
  };
});

const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;
beforeEach(() => {
  kv.clear();
  kv.set('setup', JSON.stringify({ step: 'CHOOSE', inserted: false }));
});

const off = (screen: Awaited<ReturnType<typeof render>>, label: string) => screen.getByRole('button', { name: label }).props.accessibilityState.disabled;

test('nothing is selected on arrival and Continue waits for a tap', async () => {
  const screen = await render(<Setup />);
  await screen.findByText(words.chooseTitle);
  expect(await screen.findByText(words.srcPlan.replace('{name}', 'ChatGPT'))).toBeTruthy();
  expect(off(screen, words.continueLabel)).toBe(true);
  await fireEvent.press(screen.getByText(words.srcPlan.replace('{name}', 'ChatGPT')));
  expect(off(screen, words.continueLabel)).toBe(false);
  expect(storedSource()).toBeUndefined();
});

test('signing in does not choose an account until the person continues', async () => {
  const screen = await render(<Setup />);
  await fireEvent.press(await screen.findByText(words.srcPlan.replace('{name}', 'ChatGPT')));
  await act(async () => { fireEvent.press(screen.getByText(words.continueLabel)); });
  await waitFor(() => expect(screen.getByText(words.signedInTo.replace('{name}', 'ChatGPT'))).toBeTruthy());
  expect(storedSource()).toBeUndefined();
  await act(async () => { fireEvent.press(await screen.findByText(words.continueLabel)); });
  expect(storedSource()).toBe('chatgpt');
});

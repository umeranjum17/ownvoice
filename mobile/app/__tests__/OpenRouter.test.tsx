import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import Source from '../source';
import { accountSessions, nothing, type GptState } from '../../src/chatgpt/session';
import { setSource, storedSource } from '../../src/core/source';
import { words } from '../../src/core/words';

// The OpenRouter card on How Ownvoice writes: it appears only when the kit reports its key route
// ready, the person pastes their own key and connects (the kit's own key field), and the
// start=openrouter entry point respects the same readiness gate.

jest.mock('../../src/chatgpt/session', () => ({
  NAME: 'ChatGPT',
  CLAUDE_NAME: 'Claude',
  OPENROUTER_NAME: 'OpenRouter',
  GPT_APPS_KEY: 'chatgpt-apps',
  mocked: false,
  nothing: { signedIn: false, waiting: false, code: null, url: null, note: null, resting: null },
  signOutGuard: jest.fn(() => ({ active: false, epoch: 0 })),
  accountSessions: {
    chatgpt: { session: { current: jest.fn(), start: jest.fn(), cancel: jest.fn(), signOut: jest.fn() }, now: jest.fn(() => ({ signedIn: false })) },
    claude: { session: { current: jest.fn(async () => ({ signedIn: false, waiting: false, code: null, url: null, note: null, resting: null })), start: jest.fn(), cancel: jest.fn(), signOut: jest.fn() }, now: jest.fn(() => ({ signedIn: false })) },
    openrouter: { session: { current: jest.fn(async () => ({ signedIn: false, waiting: false, code: null, url: null, note: null, resting: null })), start: jest.fn(), cancel: jest.fn(), signOut: jest.fn() }, now: jest.fn(() => ({ signedIn: false })) },
  },
}));
jest.mock('../../modules/ownvoice-native', () => ({
  __esModule: true,
  default: {
    copy: jest.fn(async () => {}),
    launcherApps: jest.fn(async () => [{ app: 'com.Slack', label: 'Slack', icon: null }]),
    bubbleRules: jest.fn(async () => ({ paused: false, on: ['com.Slack'], off: [] })),
  },
}));
jest.mock('../../src/core/localModel', () => ({ localModelState: jest.fn(), agreedToDownload: jest.fn(() => false) }));
jest.mock('../../src/chatgpt/accounts', () => ({
  openRouterReady: jest.fn(() => true),
  connectOpenRouter: jest.fn(async () => {}),
}));
import { openRouterReady, connectOpenRouter } from '../../src/chatgpt/accounts';
import { localModelState } from '../../src/core/localModel';

const ready = openRouterReady as jest.Mock;
const connect = connectOpenRouter as jest.Mock;
const openrouterSession = accountSessions.openrouter.session as jest.Mocked<typeof accountSessions.openrouter.session>;
const chatgptSession = accountSessions.chatgpt.session as jest.Mocked<typeof accountSessions.chatgpt.session>;
const mockState = localModelState as jest.MockedFunction<typeof localModelState>;
const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;

const signedIn: GptState = { ...nothing, signedIn: true, note: 'OpenRouter is connected.' };
const waiting: GptState = { ...nothing, waiting: true, note: words.openrouterKeyNote };

beforeEach(() => {
  kv.clear();
  jest.clearAllMocks();
  ready.mockReturnValue(true);
  connect.mockResolvedValue(undefined);
  mockState.mockResolvedValue({ phase: 'ready' });
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  chatgptSession.current.mockResolvedValue(nothing);
  openrouterSession.start.mockResolvedValue(waiting);
  openrouterSession.current.mockResolvedValue(nothing);
  openrouterSession.cancel.mockResolvedValue(nothing);
});

const show = async () => {
  const screen = await render(<Source />);
  await screen.findByText(words.srcPhone);
  await waitFor(() => expect(openrouterSession.current).toHaveBeenCalled());
  return screen;
};

test('the person connects their own OpenRouter key from the writer list', async () => {
  setSource('phone');
  const screen = await show();
  expect(screen.getByText(words.srcOpenRouter)).toBeTruthy();

  await fireEvent.press(screen.getByText(words.srcOpenRouter));
  const field = await screen.findByTestId('openrouter-paste');
  expect(connect).not.toHaveBeenCalled();

  await fireEvent.changeText(field, 'sk-test-openrouter-key');
  openrouterSession.current.mockResolvedValue(signedIn);
  await fireEvent.press(screen.getByText(words.openrouterConnect));

  await waitFor(() => expect(connect).toHaveBeenCalledWith('sk-test-openrouter-key'));
  expect(await screen.findByText(words.openrouterSignOut)).toBeTruthy();
  expect(storedSource()).toBe('openrouter');
});

test('start=openrouter begins the same key sign-in when the kit reports the route ready', async () => {
  setSource('chatgpt');
  (useLocalSearchParams as jest.Mock).mockReturnValue({ start: 'openrouter' });
  const screen = await show();
  expect(await screen.findByTestId('openrouter-paste')).toBeTruthy();
});

test('the OpenRouter card and its start entry point stay hidden when the kit route is not ready', async () => {
  ready.mockReturnValue(false);
  setSource('chatgpt');
  (useLocalSearchParams as jest.Mock).mockReturnValue({ start: 'openrouter' });
  const screen = await show();
  expect(screen.queryByText(words.srcOpenRouter)).toBeNull();
  await waitFor(() => expect(openrouterSession.start).not.toHaveBeenCalled());
  expect(screen.queryByTestId('openrouter-paste')).toBeNull();
  expect(connect).not.toHaveBeenCalled();
});

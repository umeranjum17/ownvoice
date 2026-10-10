import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Setup from '../../../app/setup';
import { words } from '../words';
import * as accounts from '../../chatgpt/accounts';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })), setPractice: jest.fn(async () => {}),
  serviceState: jest.fn(async () => 'off'), bubbleRules: jest.fn(async () => ({ paused: false, on: [], off: [] })),
  launcherApps: jest.fn(async () => []), typingCheck: jest.fn(async () => false),
} }));
jest.mock('../localModel', () => ({ localModelState: jest.fn(async () => ({ phase: 'unsupported' })), agreedToDownload: jest.fn(() => false) }));
jest.mock('../../chatgpt/settings', () => ({ saveBubbleRules: jest.fn(async () => {}) }));
jest.mock('../phoneStatus', () => ({ phoneCanWrite: jest.fn(async () => 'cant') }));
jest.mock('../phoneDownload', () => ({ getReady: jest.fn(async () => {}), resume: jest.fn(async () => {}) }));
jest.mock('../../chatgpt/accounts', () => {
  const actual = jest.requireActual('../../chatgpt/accounts');
  return { ...actual,
    refresh: jest.fn(async () => {}), status: jest.fn(async () => ({ signedIn: false })),
    signInState: jest.fn(() => null), signIn: jest.fn(async () => {}), signInClaude: jest.fn(async () => {}),
    cancelSignIn: jest.fn(async () => {}), paste: jest.fn(),
  };
});

const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;
const claudeName = 'Claude';

beforeEach(() => {
  jest.clearAllMocks();
  kv.clear();
  // Seed the first run at the writer step, so the screen opens on the choice.
  kv.set('setup', JSON.stringify({ step: 'CHOOSE', inserted: false }));
});

test('first-run writer step offers ChatGPT and Claude when the phone cannot write', async () => {
  await act(async () => { render(<Setup />); });
  expect(await screen.findByText(words.srcPlan.replace('{name}', 'ChatGPT'))).toBeTruthy();
  expect(screen.getByText(words.srcPlan.replace('{name}', claudeName))).toBeTruthy();
});

test('choosing Claude signs in on its own page and shows the paste field', async () => {
  await act(async () => { render(<Setup />); });
  await act(async () => { fireEvent.press(await screen.findByText(words.srcPlan.replace('{name}', claudeName))); });
  // The card's radio marks the choice once the press lands, and the footer then offers its sign-in.
  await waitFor(() => expect(screen.getAllByRole('radio')[1].props.accessibilityState.checked).toBe(true));
  // Claude's sign-in hands back its page link (no device code), which the step then shows.
  (accounts.signInState as jest.Mock).mockReturnValue({ state: 'waiting', url: 'https://claude.ai/oauth/authorize' });
  await act(async () => { fireEvent.press(screen.getByText(words.signIn)); });
  await waitFor(() => expect(accounts.signInClaude).toHaveBeenCalled());
  expect(accounts.signIn).not.toHaveBeenCalled();
  expect(await screen.findByText(words.claudeOpen)).toBeTruthy();
  expect(screen.getByPlaceholderText(words.claudePasteField)).toBeTruthy();
});

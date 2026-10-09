// P4: the selection rewrite follows the writing choice (own file: this repo's
// RTL version stops committing new roots after ~15 renders in one file).
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import Native from '../../../modules/ownvoice-native';
import Rewrite from '../Rewrite';
import { words } from '../../core/words';
import { CHATGPT_OFF } from '../../core/switch';
import { SOURCE_KEY } from '../../core/source';
import { store } from '../../core/store';
import { accountSessions } from '../../chatgpt/session';
const session = accountSessions.chatgpt.session;
import { wipeVoice } from '../../core/voiceStore';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })),
  rewriteInput: jest.fn(), finishRewrite: jest.fn(async () => {}),
  bubbleRules: jest.fn(async () => ({ paused: false, on: [], off: [] })),
} }));
jest.mock('../../core/localModel', () => ({ askLocal: jest.fn(), localModelState: jest.fn(), agreedToDownload: jest.fn(() => false) }));
import { askLocal, localModelState } from '../../core/localModel';
const mockAsk = askLocal as jest.MockedFunction<typeof askLocal>;
const mockState = localModelState as jest.MockedFunction<typeof localModelState>;
jest.mock('../../chatgpt/accounts', () => {
  const actual = jest.requireActual('../../chatgpt/accounts');
  actual.accounts.runtime = jest.fn(async () => ({
    getAuth: async () => ({ auth: { apiKey: 'fixture-access' } }),
    readCredential: async () => ({ type: 'oauth', accountId: 'fixture-account' }),
  }));
  actual.accounts.failed = jest.fn(async (_member: string, _key: string, error: { kind: string; until: number }) => ({ kind: error.kind, until: error.until }));
  actual.accounts.respond = jest.fn(actual.accounts.respond.bind(actual.accounts));
  return { ...actual, codexAuth: jest.fn(async () => ({ access: 'fixture-access', accountId: 'fixture-account' })), reportFailure: jest.fn(async () => ({})) };
});
jest.mock('expo/fetch', () => ({ fetch: (...args: Parameters<typeof fetch>) => (global.fetch as typeof fetch)(...args) }));
jest.mock('../../chatgpt/session', () => ({
  signOutGuard: () => ({ active: false, epoch: 0 }),
  accountSessions: { chatgpt: { session: { current: jest.fn(async () => ({ signedIn: true })), start: jest.fn(), cancel: jest.fn(), signOut: jest.fn() }, now: () => ({ signedIn: true }) } },
}));

const native = Native as unknown as { rewriteInput: jest.Mock; finishRewrite: jest.Mock; bubbleRules: jest.Mock };

const renderRewrite = async (input: { text: string; editable: boolean } | null) => {
  native.rewriteInput.mockReturnValue(input);
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Rewrite />
    </SafeAreaProvider>);
  await act(async () => { await Promise.resolve(); });
  return screen;
};

const visibleStrings = (screen: { toJSON: () => unknown }): string[] => {
  const strings: string[] = [];
  const walk = (node: unknown) => {
    if (node == null) return;
    if (typeof node === 'string') { strings.push(node); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node !== 'object') return;
    const item = node as Record<string, unknown>;
    if (Array.isArray(item.children)) item.children.forEach(walk);
  };
  walk(screen.toJSON());
  return strings;
};

const SELECTION = 'I think we should move the call to Tuesday. Really.';

beforeEach(() => { jest.clearAllMocks(); wipeVoice(); store.set(SOURCE_KEY, null); mockState.mockResolvedValue({ phase: 'ready' }); native.bubbleRules.mockResolvedValue({ paused: false, on: [], off: [] }); });

const sse = (text: string) => new ReadableStream<Uint8Array>({ start(controller) {
  const enc = new TextEncoder();
  controller.enqueue(enc.encode(`data: {"type":"response.output_text.delta","delta":${JSON.stringify(text)}}\n\n`));
  controller.enqueue(enc.encode('data: {"type":"response.completed"}\n\n'));
  controller.close();
} });
const chatgptFetch = (body: ReadableStream<Uint8Array>) => jest.fn(async () => ({ ok: true, body } as Response));
// P4: the selection rewrite follows the writing choice.
test('ChatGPT chosen rewrites in one call while the phone still checks the meaning', async () => {
  store.set(SOURCE_KEY, 'chatgpt');
  (global as unknown as { fetch: unknown }).fetch = chatgptFetch(sse('Move the call to Tuesday.'));
  mockAsk.mockImplementation(async (prompt: string) =>
    prompt.startsWith('Compare a rewrite') ? 'GENERIC: 2\nSPECIFICITY: 8\nMEANING: pass' : '');
  const screen = await renderRewrite({ text: SELECTION, editable: true });
  fireEvent.press(screen.getByRole('button', { name: 'Shorter' }));
  await waitFor(() => expect(visibleStrings(screen)).toContain('Move the call to Tuesday.'));
  const fetch = (global as unknown as { fetch: jest.Mock }).fetch;
  expect(fetch).toHaveBeenCalledWith('https://chatgpt.com/backend-api/codex/responses', expect.objectContaining({ method: 'POST' }));
  expect(String(fetch.mock.calls[0][1].body)).toContain('Rewrite the text below. Make it shorter and tighter.');
  expect(String(fetch.mock.calls[0][1].body)).not.toContain('json_object');
  expect(session.current).toHaveBeenCalled();
  // The phone did only the meaning check, never the rewrite itself.
  expect(mockAsk).toHaveBeenCalledTimes(1);
  expect(mockAsk).toHaveBeenCalledWith(expect.stringContaining('Compare a rewrite'), 80);
  expect(visibleStrings(screen)).toContain('Same meaning as yours');
});

test.each(['chatgpt', 'phone'] as const)('%s selection rewrite also cases the actual newly split boundary', async source => {
  store.set(SOURCE_KEY, source);
  (global as unknown as { fetch: unknown }).fetch = chatgptFetch(sse('autosave locally. make export easy.'));
  mockAsk.mockImplementation(async (prompt: string) => prompt.startsWith('Compare a rewrite')
    ? 'GENERIC: 2\nSPECIFICITY: 8\nMEANING: pass' : 'autosave locally. make export easy.');
  const screen = await renderRewrite({ text: 'autosave locally and make export easy.', editable: true });
  fireEvent.press(screen.getByRole('button', { name: 'Shorter' }));
  await waitFor(() => expect(visibleStrings(screen)).toContain('autosave locally. Make export easy.'));
  expect(visibleStrings(screen)).not.toContain('autosave locally. make export easy.');
});

test('ChatGPT chosen without a phone writer still rewrites, with only the number check', async () => {
  store.set(SOURCE_KEY, 'chatgpt');
  mockState.mockResolvedValue({ phase: 'unsupported' });
  (global as unknown as { fetch: unknown }).fetch = chatgptFetch(sse('We should move the call to Friday at 7:30.'));
  const screen = await renderRewrite({ text: 'Can we move the call?', editable: false });
  fireEvent.press(screen.getByRole('button', { name: 'Shorter' }));
  await waitFor(() => expect(visibleStrings(screen).some(s => s.startsWith('Check this:'))).toBe(true));
  expect(visibleStrings(screen).join(' ')).toContain('7:30');
  expect(mockAsk).not.toHaveBeenCalled();
});

test('a paused bubble keeps the rewrite on the phone, saying the phone wrote it', async () => {
  store.set(SOURCE_KEY, 'chatgpt');
  native.bubbleRules.mockResolvedValue({ paused: true, on: [], off: [] });
  (global as unknown as { fetch: unknown }).fetch = jest.fn();
  mockAsk.mockImplementation(async (prompt: string) =>
    prompt.startsWith('Compare a rewrite') ? 'MEANING: pass' : 'Tuesday works.');
  const screen = await renderRewrite({ text: SELECTION, editable: true });
  fireEvent.press(screen.getByRole('button', { name: 'Shorter' }));
  await waitFor(() => expect(visibleStrings(screen)).toContain('Tuesday works.'));
  expect(visibleStrings(screen)).toContain(words.phoneWrote);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('a switched-off ChatGPT keeps the rewrite on the phone under the switch line', async () => {
  store.set(SOURCE_KEY, 'chatgpt');
  (global as unknown as { fetch: unknown }).fetch = jest.fn();
  mockAsk.mockImplementation(async (prompt: string) =>
    prompt.startsWith('Compare a rewrite') ? 'MEANING: pass' : 'Tuesday works.');
  const screen = await renderRewrite({ text: SELECTION, editable: true });
  store.set('chatgpt-switch', { seq: 1, chatgpt: 'off', fetchedAt: Date.now() });
  try {
    fireEvent.press(screen.getByRole('button', { name: 'Shorter' }));
    await waitFor(() => expect(visibleStrings(screen)).toContain('Tuesday works.'));
    expect(visibleStrings(screen)).toContain(CHATGPT_OFF);
    expect(global.fetch).not.toHaveBeenCalled();
  } finally { store.set('chatgpt-switch', null); }
});

test('a paused bubble with no phone writer says ChatGPT is off, not that the phone wrote', async () => {
  store.set(SOURCE_KEY, 'chatgpt');
  mockState.mockResolvedValue({ phase: 'failed' });
  native.bubbleRules.mockResolvedValue({ paused: true, on: [], off: [] });
  (global as unknown as { fetch: unknown }).fetch = jest.fn();
  const screen = await renderRewrite({ text: SELECTION, editable: true });
  fireEvent.press(screen.getByRole('button', { name: 'Shorter' }));
  await waitFor(() => expect(visibleStrings(screen)).toContain(words.gptOffNoPhone));
  expect(visibleStrings(screen)).not.toContain(words.phoneWrote);
  expect(global.fetch).not.toHaveBeenCalled();
  expect(mockAsk).not.toHaveBeenCalled();
});

test('a ChatGPT failure falls back to the phone with its plain line', async () => {
  store.set(SOURCE_KEY, 'chatgpt');
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ ok: false, status: 500, text: async () => '', body: null } as unknown as Response));
  mockAsk.mockImplementation(async (prompt: string) =>
    prompt.startsWith('Compare a rewrite') ? 'MEANING: pass' : 'Tuesday works.');
  const screen = await renderRewrite({ text: SELECTION, editable: true });
  fireEvent.press(screen.getByRole('button', { name: 'Shorter' }));
  await waitFor(() => expect(visibleStrings(screen)).toContain('Tuesday works.'));
  expect(visibleStrings(screen)).toContain(words.fallback);
});

test('no connection and no phone writer says to connect first', async () => {
  store.set(SOURCE_KEY, 'chatgpt');
  mockState.mockResolvedValue({ phase: 'unsupported' });
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => { throw new Error('fetch failed'); });
  const screen = await renderRewrite({ text: SELECTION, editable: true });
  fireEvent.press(screen.getByRole('button', { name: 'Shorter' }));
  await waitFor(() => expect(visibleStrings(screen)).toContain(words.offlineNoPhone));
  expect(mockAsk).not.toHaveBeenCalled();
});

test('no connection with a phone writer falls back to the phone with the offline line', async () => {
  store.set(SOURCE_KEY, 'chatgpt');
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => { throw new Error('fetch failed'); });
  mockAsk.mockImplementation(async (prompt: string) =>
    prompt.startsWith('Compare a rewrite') ? 'MEANING: pass' : 'Tuesday works.');
  const screen = await renderRewrite({ text: SELECTION, editable: true });
  fireEvent.press(screen.getByRole('button', { name: 'Shorter' }));
  await waitFor(() => expect(visibleStrings(screen)).toContain('Tuesday works.'));
  expect(visibleStrings(screen)).toContain(words.offlinePhone);
});


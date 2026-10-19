// The panel mic wiring: a fake DictateEngine handle drives listen/finish while the
// real message mapping turns kit failures into plain words; the heard text lands in
// the focused field through the same insert path as a draft.
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { DictateError } from '@byokit/dictation';
import Panel from '../Panel';
import { stubWriter } from '../stubWriter';
import { words } from '../../core/words';
import Native from '../../../modules/ownvoice-native';
import { ensureMic, ensurePack, dictateReady, listenForDictation } from '../dictate';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })),
  capture: jest.fn(), serviceState: jest.fn(async () => 'on'), insert: jest.fn(async () => ({ ok: true, newlinesLost: false })), copy: jest.fn(async () => {}),
  closePanel: jest.fn(), typingCheck: jest.fn(async () => false),
} }));
jest.mock('../dictate', () => { const actual = jest.requireActual('../dictate'); return { ...actual, ensureMic: jest.fn(), ensurePack: jest.fn(), dictateReady: jest.fn(), listenForDictation: jest.fn() }; });
jest.mock('../../core/localModel', () => ({ askLocal: jest.fn(), localModelState: jest.fn(async () => ({ phase: 'unsupported' })), agreedToDownload: jest.fn(() => false) }));

const native = Native as jest.Mocked<typeof Native>;
const mockMic = ensureMic as jest.Mock;
const mockPack = ensurePack as jest.Mock;
const mockReady = dictateReady as jest.Mock;
const mockListen = listenForDictation as jest.Mock;

type FinalListener = () => void;
let partialCb: ((text: string) => void) | null = null;
let errorCb: ((error: DictateError) => void) | null = null;
const fakeHandle = (text: string | Error) => {
  const finals = new Map<string, FinalListener>();
  const handle = {
    finals,
    on: jest.fn((type: string, fn: FinalListener) => { finals.set(type, fn); return () => {}; }),
    finish: jest.fn(async () => { if (text instanceof Error) throw text; return { text }; }),
    cancel: jest.fn(),
  };
  mockListen.mockImplementation((onPartial?: (text: string) => void, onError?: (error: DictateError) => void) => { partialCb = onPartial ?? null; errorCb = onError ?? null; return handle; });
  return handle;
};
const firePartial = async (text: string) => { await act(async () => { partialCb?.(text); }); };
const fireListenError = async (error: DictateError) => { await act(async () => { errorCb?.(error); }); };
const fireFinal = async (handle: { finals: Map<string, FinalListener> }) => { await act(async () => { handle.finals.get('final')?.(); }); };

const renderPanel = async () => {
  native.capture.mockResolvedValue({ conversation: 'Sam: Still on for Saturday?', written: 'Sam: Still on for Saturday?', nodes: [], fieldTop: null, typed: 'Yes, still on.', app: 'com.whatsapp', label: 'Chat', at: 0, id: 'tap-1', hasField: true });
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Panel writer={stubWriter({ delay: 10 })} />
    </SafeAreaProvider>);
  await act(async () => { await Promise.resolve(); });
  return screen;
};

beforeEach(() => {
  jest.clearAllMocks();
  partialCb = null;
  errorCb = null;
  mockMic.mockResolvedValue(true);
  mockPack.mockResolvedValue(true);
  mockReady.mockResolvedValue(null);
});

test('heard words land in the field through insert', async () => {
  const handle = fakeHandle('see you at six');
  const screen = await renderPanel();
  fireEvent.press(await screen.findByRole('button', { name: words.dictateListen }));
  await waitFor(() => expect(mockListen).toHaveBeenCalledTimes(1));
  await firePartial('see you');
  expect(await screen.findByText('see you')).toBeTruthy();
  await fireFinal(handle);
  await waitFor(() => expect(native.insert).toHaveBeenCalledWith('see you at six'));
});

test('a second tap finishes into the field', async () => {
  fakeHandle('on my way');
  const screen = await renderPanel();
  fireEvent.press(await screen.findByRole('button', { name: words.dictateListen }));
  await waitFor(() => expect(mockListen).toHaveBeenCalledTimes(1));
  fireEvent.press(await screen.findByRole('button', { name: words.dictateStop }));
  await waitFor(() => expect(native.insert).toHaveBeenCalledWith('on my way'));
});

test('hearing nothing says so and inserts nothing', async () => {
  const handle = fakeHandle('  ');
  const screen = await renderPanel();
  fireEvent.press(await screen.findByRole('button', { name: words.dictateListen }));
  await waitFor(() => expect(mockListen).toHaveBeenCalledTimes(1));
  await fireFinal(handle);
  await waitFor(() => expect(screen.getByText(words.dictateUnheard)).toBeTruthy());
  expect(native.insert).not.toHaveBeenCalled();
});

test('a refused microphone names the fix and never listens', async () => {
  mockMic.mockResolvedValue(false);
  const screen = await renderPanel();
  fireEvent.press(await screen.findByRole('button', { name: words.dictateListen }));
  await waitFor(() => expect(screen.getByText(words.dictateMic)).toBeTruthy());
  expect(mockListen).not.toHaveBeenCalled();
  expect(native.insert).not.toHaveBeenCalled();
});

test('a missing pack fetches itself, then listens', async () => {
  mockReady.mockResolvedValue(words.dictateLanguage);
  let releasePack!: (ready: boolean) => void;
  mockPack.mockImplementation(() => new Promise<boolean>(resolve => { releasePack = resolve; }));
  const handle = fakeHandle('see you at six');
  const screen = await renderPanel();
  fireEvent.press(await screen.findByRole('button', { name: words.dictateListen }));
  expect(await screen.findByText(words.dictateSpeechReady)).toBeTruthy();
  await waitFor(() => expect(mockPack).toHaveBeenCalledTimes(1));
  await act(async () => { releasePack(true); });
  await waitFor(() => expect(mockListen).toHaveBeenCalledTimes(1));
  await fireFinal(handle);
  await waitFor(() => expect(native.insert).toHaveBeenCalledWith('see you at six'));
});

test('a pack that never lands names it plainly', async () => {
  mockReady.mockResolvedValue(words.dictateLanguage);
  mockPack.mockResolvedValue(false);
  const screen = await renderPanel();
  fireEvent.press(await screen.findByRole('button', { name: words.dictateListen }));
  await waitFor(() => expect(screen.getByText(words.dictateLanguage)).toBeTruthy());
  expect(mockListen).not.toHaveBeenCalled();
  expect(native.insert).not.toHaveBeenCalled();
});

test('a missing recognizer names it plainly', async () => {
  mockReady.mockResolvedValue(words.dictateUnavailable);
  const screen = await renderPanel();
  fireEvent.press(await screen.findByRole('button', { name: words.dictateListen }));
  await waitFor(() => expect(screen.getByText(words.dictateUnavailable)).toBeTruthy());
  expect(mockListen).not.toHaveBeenCalled();
});

test('a failed finish names it plainly', async () => {
  const handle = fakeHandle(new DictateError('unsupported'));
  const screen = await renderPanel();
  fireEvent.press(await screen.findByRole('button', { name: words.dictateListen }));
  await waitFor(() => expect(mockListen).toHaveBeenCalledTimes(1));
  await fireFinal(handle);
  await waitFor(() => expect(screen.getByText(words.dictateUnavailable)).toBeTruthy());
  expect(native.insert).not.toHaveBeenCalled();
});

test('a native error mid-listen shows at once and frees the mic', async () => {
  const handle = fakeHandle('unused');
  const screen = await renderPanel();
  fireEvent.press(await screen.findByRole('button', { name: words.dictateListen }));
  await waitFor(() => expect(mockListen).toHaveBeenCalledTimes(1));
  await fireListenError(new DictateError('unsupported'));
  expect(await screen.findByText(words.dictateUnavailable)).toBeTruthy();
  expect(handle.cancel).toHaveBeenCalled();
  expect(screen.getByRole('button', { name: words.dictateListen })).toBeTruthy();
  expect(native.insert).not.toHaveBeenCalled();
});

test('a Listen tapped right after Stop waits for the last words to land', async () => {
  const handle = fakeHandle('first words');
  let land!: (transcript: { text: string }) => void;
  handle.finish.mockImplementation(() => new Promise(resolve => { land = resolve; }));
  const screen = await renderPanel();
  fireEvent.press(await screen.findByRole('button', { name: words.dictateListen }));
  await waitFor(() => expect(mockListen).toHaveBeenCalledTimes(1));
  fireEvent.press(await screen.findByRole('button', { name: words.dictateStop }));
  fireEvent.press(await screen.findByRole('button', { name: words.dictateListen }));
  expect(await screen.findByText(words.dictateSettling)).toBeTruthy();
  expect(mockListen).toHaveBeenCalledTimes(1);
  await act(async () => { land({ text: 'first words' }); });
  await waitFor(() => expect(mockListen).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(native.insert).toHaveBeenCalledWith('first words'));
});

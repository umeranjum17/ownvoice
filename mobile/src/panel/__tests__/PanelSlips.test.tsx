// With "Check my spelling as I type" on, a tap lists what to check in what they typed; each Fix puts
// their own text back with that one slip fixed, only when they press it. Off, the panel is as before.
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import Panel from '../Panel';
import { stubWriter } from '../stubWriter';
import type { Writer } from '../../core/writers';
import { technicalWords, words } from '../../core/words';
import Native from '../../../modules/ownvoice-native';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })),
  capture: jest.fn(), serviceState: jest.fn(async () => 'on'), insert: jest.fn(async () => ({ ok: true, newlinesLost: false })), copy: jest.fn(),
  closePanel: jest.fn(), typingCheck: jest.fn(),
} }));
jest.mock('../../core/speller', () => ({
  speller: async () => {
    const { readFileSync } = require('fs');
    const dir = `${__dirname}/../../../assets/dictionary/`;
    return require('nspell')(readFileSync(dir + 'en-affixes.aff', 'utf8'), readFileSync(dir + 'en-words.dic', 'utf8'));
  },
}));

const native = Native as jest.Mocked<typeof Native>;
jest.mock('../../core/localModel', () => ({ askLocal: jest.fn(), localModelState: jest.fn(), agreedToDownload: jest.fn(() => false) }));
import { askLocal, localModelState } from '../../core/localModel';
const mockAsk = askLocal as jest.MockedFunction<typeof askLocal>;
const mockState = localModelState as jest.MockedFunction<typeof localModelState>;
const TYPED = 'Its a good plan, I shoud be there by the the evening.';

const renderPanel = async (typingOn: boolean) => {
  native.typingCheck.mockResolvedValue(typingOn);
  native.capture.mockResolvedValue({ conversation: '', written: '', nodes: [], fieldTop: null, typed: TYPED, app: 'com.whatsapp', label: 'WhatsApp', at: 0, id: 'tap-1', hasField: true });
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Panel writer={stubWriter({ delay: 10 })} />
    </SafeAreaProvider>);
  await act(async () => { await Promise.resolve(); });
  return screen;
};

beforeEach(() => jest.clearAllMocks());

test('each slip gets its own Fix, which inserts their text with only that slip fixed', async () => {
  const screen = await renderPanel(true);
  expect(await screen.findByText(words.slipsTitle)).toBeTruthy();
  expect(screen.getByText(words.slipRepeat, { exact: false })).toBeTruthy();
  const fixes = screen.getAllByRole('button', { name: words.fix });
  expect(fixes).toHaveLength(3);
  expect(native.insert).not.toHaveBeenCalled();
  fireEvent.press(fixes[1]);
  await waitFor(() => expect(native.insert).toHaveBeenCalledWith('Its a good plan, I should be there by the the evening.'));
});

test('the slips speak plainly', async () => {
  const screen = await renderPanel(true);
  await screen.findByText(words.slipsTitle);
  const shown: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') shown.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(screen.toJSON());
  expect(shown).toContain(words.slipsTitle);
  expect(shown.filter(line => technicalWords.test(line))).toEqual([]);
});

test('with the typing check off, the panel lists no slips', async () => {
  const screen = await renderPanel(false);
  await waitFor(() => expect(screen.getByText('Yours')).toBeTruthy());
  expect(screen.queryByText(words.slipsTitle)).toBeNull();
  expect(screen.queryByRole('button', { name: words.fix })).toBeNull();
});

test('original spelling evidence survives regeneration and retry, and refreshes for changed text', async () => {
  const conversation = 'Sam: Are we still on for Saturday?\nSam: I can bring the tent if you bring the stove.';
  const capture = { conversation, written: conversation, nodes: [], fieldTop: null, typed: 'I can definately bring the stove.', app: 'com.whatsapp', label: 'WhatsApp', at: 0, id: 'tap-regen', hasField: true };
  native.capture.mockResolvedValue(capture);
  native.typingCheck.mockResolvedValue(true);
  mockState.mockResolvedValue({ phase: 'ready' });
  mockAsk.mockImplementation(async (prompt) => prompt.startsWith('Below is the text') ? 'MESSAGE' :
    'GENERIC: 0\nSPECIFICITY: 10\nSPECIFIC: pass - names the stove\nCLEAR: pass - one clear point\nVOICE: pass - sounds like you\nFITS: pass - fits this chat\nCLAIMS: pass - makes nothing up\nANSWERS: pass - answers the question\nNEXT_STEP: pass - the time is clear');
  let writes = 0;
  const writer: Writer = { write: async (_request, events) => {
    if (++writes === 2) return { drafts: [] };
    events?.landed?.('I can bring the stove.', 0, 'Cleaned up');
    return { drafts: ['I can bring the stove.'] };
  } };
  const view = (selected: Writer) => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
    <Panel writer={selected} />
  </SafeAreaProvider>;
  const screen = await render(view(writer));
  const checkOriginal = async () => {
    await fireEvent.press(screen.getAllByRole('button', { name: words.why })[0]);
    await screen.findByText('Names the stove');
    expect(screen.getByText('There are possible slips to review.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByText(words.slipsTitle)).toBeTruthy();
    expect(screen.getByText('Check the wording')).toBeTruthy();
    expect(screen.queryByText('Sounds natural', { exact: false })).toBeNull();
  };
  await screen.findByText(words.slipsTitle);
  await screen.findByRole('button', { name: words.writeNew });
  await checkOriginal();
  let finishRefresh!: (enabled: boolean) => void;
  native.typingCheck.mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve; }));
  await fireEvent.press(screen.getByRole('button', { name: words.writeNew }));
  await screen.findByRole('button', { name: words.tryAgain });
  await checkOriginal();
  await fireEvent.press(screen.getByRole('button', { name: words.tryAgain }));
  await screen.findByRole('button', { name: words.writeNew });
  await checkOriginal();
  native.capture.mockResolvedValue({ ...capture, typed: 'I can bring the stove.', id: 'tap-changed' });
  await screen.rerender(view({ ...writer }));
  await waitFor(() => expect(screen.queryByText(words.slipsTitle)).toBeNull());
  await act(async () => { finishRefresh(true); });
  expect(screen.queryByText(words.slipsTitle)).toBeNull();
  expect(screen.queryByRole('button', { name: words.fix })).toBeNull();
  await fireEvent.press(screen.getAllByRole('button', { name: words.why })[0]);
  await screen.findByText('Names the stove');
  expect(screen.queryByText('There are possible slips to review.')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByText('Sounds natural', { exact: false })).toBeNull();
});

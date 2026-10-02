// Slice 8 panel polish: the shared verdict note. One render per file — RTL v14's queued
// cleanup can take a second Panel root in the same file before its drafts land.
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import Panel from '../Panel';
import Rewrite from '../../rewrite/Rewrite';
import { stubWriter } from '../stubWriter';
import Native from '../../../modules/ownvoice-native';
import type { Writer } from '../../core/writers';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })),
  capture: jest.fn(), serviceState: jest.fn(async () => 'on'), insert: jest.fn(), copy: jest.fn(),
  modelStatus: jest.fn(async () => 'unavailable'), ask: jest.fn(), closePanel: jest.fn(),
  typingCheck: jest.fn(async () => false), rewriteInput: jest.fn(), finishRewrite: jest.fn(),
} }));

const native = Native as jest.Mocked<typeof Native>;
const SAM = 'Sam: Are we still on for Saturday?\nSam: I can bring the tent if you bring the stove.';

test('automatic tones cannot approve original or generated stock phrases and slips', async () => {
  const original = 'i can bring the the stove, at the end of the day';
  const drafts = ['i can bring the tent, at the end of the day', 'I shoud bring the stove.', 'See you Saturday!'];
  native.modelStatus.mockResolvedValue('available');
  native.typingCheck.mockResolvedValue(false);
  native.ask.mockImplementation(async (_id, prompt) => prompt.startsWith('What tone') ? '1: natural\n2: natural\n3: natural\n4: friendly' : 'MESSAGE');
  native.capture.mockResolvedValue({ conversation: SAM, written: SAM, nodes: [], fieldTop: null, typed: original, app: 'com.whatsapp', label: 'WhatsApp', at: 0, id: 'tone-concerns', hasField: true });
  const writer: Writer = { write: async (_request, events) => {
    drafts.forEach((text, slot) => events?.landed?.(text, slot));
    return { drafts };
  } };
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Panel writer={writer} />
    </SafeAreaProvider>);
  await screen.findByText('Sounds friendly');
  expect(screen.getByText('Yours')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Why?' })).toHaveLength(4);
  expect(screen.queryByText('Sounds natural', { exact: false })).toBeNull();
  await fireEvent.press(screen.getAllByRole('button', { name: 'Why?' })[0]);
  expect(await screen.findByText('There are possible slips to review.')).toBeTruthy();
  expect(screen.getByText('“at the end of the day”', { exact: false })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  await fireEvent.press(screen.getAllByRole('button', { name: 'Why?' })[1]);
  expect(await screen.findByText('“at the end of the day”', { exact: false })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  await fireEvent.press(screen.getAllByRole('button', { name: 'Why?' })[2]);
  expect(await screen.findByText('There are possible slips to review.')).toBeTruthy();
});

test('cards without deeper evidence have no verdict line', async () => {
  native.capture.mockResolvedValue({ conversation: SAM, written: SAM, nodes: [], fieldTop: null, typed: '', app: 'dev.ownvoice.app', label: 'Ownvoice', at: 0, id: 'tap-1', hasField: true });
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Panel writer={stubWriter({ drafts: ['Yes, still on.', 'Saturday works.', "Let's delve in; at the end of the day, moving forward."] })} />
    </SafeAreaProvider>);
  await act(async () => { await Promise.resolve(); });
  await waitFor(() => expect(screen.getAllByRole('button', {name:'Why?'})).toHaveLength(3));
  const text = JSON.stringify(screen.toJSON());
  expect(text).not.toContain('Sounds natural');
  expect(text).not.toContain('you could say more simply');
});

test('original, generated and selection text stay unapproved without wording evidence', async () => {
  const text = 'I can definately bring the stove.';
  const full = 'GENERIC: 1\nSPECIFICITY: 9\n' + ['SPECIFIC', 'CLEAR', 'VOICE', 'FITS', 'CLAIMS', 'ANSWERS', 'NEXT_STEP', 'CONVERSATION', 'NOT_INTERESTED', 'HOOK', 'MEANING'].map(k => `${k}: pass - supported by the chat`).join('\n');
  native.modelStatus.mockResolvedValue('available');
  native.ask.mockImplementation(async (_id, prompt) => prompt.startsWith('Below is the text') ? 'MESSAGE' : prompt.startsWith('Rewrite the text') ? text : full);
  const capture = { conversation: SAM, written: SAM, nodes: [], fieldTop: null, typed: text, app: 'com.whatsapp', label: 'WhatsApp', at: 0, id: 'wording-original', hasField: true };
  native.capture.mockResolvedValue(capture);
  const wrap = (child: React.ReactNode) => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>{child}</SafeAreaProvider>;
  const screen = await render(wrap(<Panel writer={stubWriter()} />));
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Why?' }).length).toBeGreaterThan(1));
  const labels: (string | null)[] = [];
  const wording: boolean[] = [];
  const check = async () => {
    await fireEvent.press(screen.getAllByRole('button', { name: 'Why?' })[0]);
    await screen.findAllByText('Supported by the chat');
    wording.push(!!screen.queryByText('Wording has not been fully checked.'));
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    labels.push(screen.queryByText('Sounds natural', { exact: false }) ? 'Sounds natural' : null);
  };
  await check();
  native.capture.mockResolvedValue({ ...capture, typed: '', id: 'wording-generated' });
  await screen.rerender(wrap(<Panel writer={stubWriter({ drafts: [text, 'Great post!'] })} />));
  await waitFor(() => expect(screen.queryByText('Yours')).toBeNull());
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Why?' })).toHaveLength(2));
  await check();
  native.rewriteInput.mockReturnValue({ text, editable: true });
  await screen.rerender(wrap(<Rewrite />));
  await fireEvent.press(screen.getByRole('button', { name: 'Shorter' }));
  await screen.findByText('Same meaning as yours');
  labels.push(screen.queryByText('Sounds natural', { exact: false }) ? 'Sounds natural' : null);
  expect(labels).toEqual([null, null, null]);
  expect(wording).toEqual([true, true]);
  expect(await native.typingCheck.mock.results[0].value).toBe(false);
});

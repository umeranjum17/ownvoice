// A tap over an open Gmail thread offers reply drafts grounded on that thread. The thread has no
// message box, only Gmail's own Reply, so the card's main button is "Reply with this": the service
// opens that reply and puts the draft in its box, and the person presses Send. One render per
// file — RTL v14's queued cleanup can take a second Panel root in the same file before its drafts land.
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import Panel from '../Panel';
import Native from '../../../modules/ownvoice-native';
import { words } from '../../core/words';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })),
  capture: jest.fn(), serviceState: jest.fn(async () => 'on'), insert: jest.fn(async () => ({ ok: true, newlinesLost: false })), copy: jest.fn(),
  closePanel: jest.fn(), say: jest.fn(async () => {}),
} }));

const native = Native as jest.Mocked<typeof Native>;
jest.mock('../../core/localModel', () => ({ askLocal: jest.fn(), localModelState: jest.fn(async () => ({ phase: 'unsupported' })), agreedToDownload: jest.fn(() => false) }));
// What the service reads on an open Gmail thread: the subject, the sender and the newest mail's body.
const THREAD = 'Move Thursday review?\nSam Lee\nto me\nHi Umer, could we move Thursday\'s review to Friday at 10? I can bring the draft numbers.\nThanks, Sam';
const DRAFTS = ['Hi Sam, Friday at 10 works. See you then.', 'Hi Sam, Friday is hard for me. Could we keep Thursday?', 'Hi Sam, does Friday at 10 still leave time for the numbers?'];

test('an open Gmail thread offers grounded reply cards that open Gmail\'s own reply', async () => {
  native.capture.mockResolvedValue({ conversation: THREAD, written: THREAD, nodes: [], fieldTop: null, typed: '', app: 'com.google.android.gm', label: 'Gmail', at: 0, id: 'tap-1', hasField: false, opensReply: true });
  const write = jest.fn(async (_request: { conversation: string }, on: { landed?: (text: string, slot: number) => void }) => {
    DRAFTS.forEach((text, slot) => on.landed?.(text, slot));
    return { drafts: DRAFTS };
  });
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Panel writer={{ write }} />
    </SafeAreaProvider>);
  await act(async () => { await Promise.resolve(); });
  await waitFor(() => expect(screen.getByText(DRAFTS[0])).toBeTruthy());
  expect(write).toHaveBeenCalledTimes(1);
  expect(write.mock.calls[0][0].conversation).toBe(THREAD);
  for (const tag of [words.tagAccept, words.replyNo, words.replyAsk]) expect(screen.getByText(tag)).toBeTruthy();
  expect(screen.getByText(words.readyMail)).toBeTruthy();
  expect(screen.queryByText(words.replyWithheld)).toBeNull();
  expect(screen.queryByText(words.insert)).toBeNull();
  fireEvent.press(screen.getAllByText(words.replyWithThis)[0]);
  await waitFor(() => expect(native.insert).toHaveBeenCalledWith(DRAFTS[0]));
});

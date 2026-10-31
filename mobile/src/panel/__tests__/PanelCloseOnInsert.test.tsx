// An insert closes the panel from the native side (PanelActivity.finish()). The sheet must already be gone
// from the React tree by then: 1.0.12 let the activity destroy a mounted tree, and the Fabric mount batch
// that tore it down killed the app on a real Gmail thread. Here the insert promise itself checks the sheet
// is no longer rendered, which fails on the version that kept the cards up until after the activity closed.
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import Panel from '../Panel';
import Native, { type Capture } from '../../../modules/ownvoice-native';
import type { DraftRequest, WriterEvents } from '../../core/writers';
import { words } from '../../core/words';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })),
  capture: jest.fn(), serviceState: jest.fn(async () => 'on'), insert: jest.fn(async () => ({ ok: true, newlinesLost: false })), copy: jest.fn(),
  closePanel: jest.fn(), say: jest.fn(async () => {}),
} }));

const native = Native as jest.Mocked<typeof Native>;
jest.mock('../../core/localModel', () => ({ askLocal: jest.fn(), localModelState: jest.fn(async () => ({ phase: 'unsupported' })), agreedToDownload: jest.fn(() => false) }));

const MAIL = 'Move the review?\nSam Lee\nto me\nCould we move Thursday to Friday at 10? I can bring the numbers.';
const DRAFTS = ['Hi Sam, Friday at 10 works for me.', 'Hi Sam, Friday is hard. Could we keep Thursday?', 'Hi Sam, does Friday leave time for the numbers?'];
const THREAD: Capture = { conversation: MAIL, written: MAIL, nodes: [], fieldTop: null, typed: '', app: 'com.google.android.gm',
  label: 'Gmail', at: 0, id: 'tap-close', hasField: false, opensReply: true };

test('the sheet is already unmounted when the insert closes the panel', async () => {
  native.capture.mockResolvedValue(THREAD);
  const write = async (_request: DraftRequest, on: WriterEvents = {}) => {
    await Promise.resolve();
    DRAFTS.forEach((text, slot) => on.landed?.(text, slot));
    return { drafts: [...DRAFTS] };
  };
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Panel writer={{ write }} />
    </SafeAreaProvider>);
  await waitFor(() => expect(screen.getByText(DRAFTS[0])).toBeTruthy());

  native.insert.mockResolvedValue({ ok: true, newlinesLost: false });

  await act(async () => {
    fireEvent.press(screen.getAllByText(words.mailReply)[0]);
    await Promise.resolve();
  });
  await waitFor(() => expect(native.insert).toHaveBeenCalledWith(DRAFTS[0]));
  // The activity that insert() finishes has nothing left of the sheet to take down.
  expect(screen.queryByText(DRAFTS[0])).toBeNull();
  expect(screen.queryByText(words.mailReply)).toBeNull();
});

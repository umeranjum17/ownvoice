// Each draft card has one main button; copy and the hand-off are quiet icons named for screen readers,
// and copying says so on that card for a moment.
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import Panel from '../Panel';
import { stubWriter } from '../stubWriter';
import { words } from '../../core/words';
import Native from '../../../modules/ownvoice-native';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })),
  capture: jest.fn(), serviceState: jest.fn(async () => 'on'), insert: jest.fn(), copy: jest.fn(async () => {}),
  closePanel: jest.fn(), typingCheck: jest.fn(async () => false),
} }));

const native = Native as jest.Mocked<typeof Native>;
jest.mock('../../core/localModel', () => ({ askLocal: jest.fn(), localModelState: jest.fn(async () => ({ phase: 'unsupported' })), agreedToDownload: jest.fn(() => false) }));

const renderPanel = async (app: string) => {
  native.capture.mockResolvedValue({ conversation: 'Sam: Still on for Saturday?', written: 'Sam: Still on for Saturday?', nodes: [], fieldTop: null, typed: 'Yes, still on for Saturday.', app, label: 'Chat', at: 0, id: 'tap-1', hasField: true });
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Panel writer={stubWriter({ delay: 10 })} />
    </SafeAreaProvider>);
  await act(async () => { await Promise.resolve(); });
  return screen;
};

test('every card offers Use this, a named copy and hand-off, and Why?', async () => {
  const screen = await renderPanel('com.whatsapp');
  await waitFor(() => expect(screen.getAllByRole('button', { name: words.useThis })).toHaveLength(3));
  expect(screen.getAllByRole('button', { name: words.copy })).toHaveLength(3);
  expect(screen.getAllByRole('button', { name: words.openInWhatsapp })).toHaveLength(3);
  // Reply cards are withheld: no card offers the reply-mode Insert label.
  expect(screen.queryByRole('button', { name: words.insert })).toBeNull();
  // The icons carry no visible words of their own.
  expect(screen.queryByText(words.openInWhatsapp)).toBeNull();
  expect(screen.queryByText(words.copy)).toBeNull();
});

test('copying a card says Copied on that card only', async () => {
  const screen = await renderPanel('com.example.chat');
  await waitFor(() => expect(screen.getAllByRole('button', { name: words.copy }).length).toBeGreaterThan(1));
  fireEvent.press(screen.getAllByRole('button', { name: words.copy })[0]);
  await waitFor(() => expect(screen.getAllByRole('button', { name: words.copied })).toHaveLength(1));
  expect(native.copy).toHaveBeenCalledTimes(1);
  expect(screen.getAllByRole('button', { name: words.shareText }).length).toBeGreaterThan(1);
});

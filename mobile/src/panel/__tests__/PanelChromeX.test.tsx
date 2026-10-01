import React from 'react';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import Panel from '../Panel';
import Native, { type Capture } from '../../../modules/ownvoice-native';
import type { DraftRequest, WriterEvents } from '../../core/writers';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })), capture: jest.fn(),
  modelStatus: jest.fn(async () => 'unavailable'), closePanel: jest.fn(),
  typingCheck: jest.fn(async () => false),
} }));

test('captured Chrome X context reaches writer, reply labels and hand-off without an empty flash', async () => {
  let captured!: (value: Capture) => void;
  (Native.capture as jest.Mock).mockReturnValue(new Promise(resolve => { captured = resolve; }));
  const write = jest.fn(async (_request: DraftRequest, on: WriterEvents = {}) => {
    on.landed?.('the first five users found the bug. shipping helped.', 0);
    return { drafts: ['the first five users found the bug. shipping helped.'] };
  });
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const screen = await render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><Panel writer={{ write }} /></SafeAreaProvider>);
  expect(screen.queryByText('Nothing to reply to yet')).toBeNull();
  expect(screen.getAllByText('Writing…').length).toBeGreaterThan(0);
  await act(async () => captured({ conversation: 'Demo Maker: Ship one small fix.', written: 'Demo Maker: Ship one small fix.', nodes: [{ text: 'x.com/demo/status/1', left: 0, top: 0, bottom: 30, clickable: false, viewId: 'com.android.chrome:id/url_bar' }], fieldTop: null, typed: '', app: 'com.android.chrome', label: 'Chrome', at: 0, id: 'x-web', hasField: true }));
  await waitFor(() => expect(screen.getByText('Agree')).toBeTruthy());
  expect(write.mock.calls[0][0].platform).toMatchObject({ id: 'x', limit: 280 });
  expect(screen.getByText(/· X$/)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Open in X with this text' }));
  expect(open).toHaveBeenCalledWith('https://twitter.com/intent/tweet?text=the%20first%20five%20users%20found%20the%20bug.%20shipping%20helped.');
});

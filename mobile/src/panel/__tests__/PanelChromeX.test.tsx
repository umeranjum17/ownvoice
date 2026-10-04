import React from 'react';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, waitFor } from '@testing-library/react-native';
import Panel from '../Panel';
import Native, { type Capture } from '../../../modules/ownvoice-native';
import { words } from '../../core/words';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })), capture: jest.fn(),
  modelStatus: jest.fn(async () => 'unavailable'), closePanel: jest.fn(),
  typingCheck: jest.fn(async () => false),
} }));

test('empty-field Chrome X reply withholds before any writer or hand-off, without an empty flash', async () => {
  let captured!: (value: Capture) => void;
  (Native.capture as jest.Mock).mockReturnValue(new Promise(resolve => { captured = resolve; }));
  const write = jest.fn(async () => ({ drafts: [] as string[] }));
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const screen = await render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><Panel writer={{ write }} /></SafeAreaProvider>);
  expect(screen.queryByText('Nothing to reply to yet')).toBeNull();
  expect(screen.getAllByText('Writing…').length).toBeGreaterThan(0);
  await act(async () => captured({ conversation: 'Demo Maker: Ship one small fix.', written: 'Demo Maker: Ship one small fix.', nodes: [{ text: 'x.com/demo/status/1', left: 0, top: 0, bottom: 30, clickable: false, viewId: 'com.android.chrome:id/url_bar' }], fieldTop: null, typed: '', app: 'com.android.chrome', label: 'Chrome', at: 0, id: 'x-web', hasField: true }));
  await waitFor(() => expect(screen.getByText(words.replyWithheld)).toBeTruthy());
  expect(write).not.toHaveBeenCalled();
  expect(screen.queryByText('Agree')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Open in X with this text' })).toBeNull();
  expect(open).not.toHaveBeenCalled();
});

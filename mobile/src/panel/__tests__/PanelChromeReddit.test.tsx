import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, waitFor } from '@testing-library/react-native';
import Panel from '../Panel';
import Native from '../../../modules/ownvoice-native';
import type { DraftRequest, WriterEvents } from '../../core/writers';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })), capture: jest.fn(),
  modelStatus: jest.fn(async () => 'unavailable'), closePanel: jest.fn(),
  typingCheck: jest.fn(async () => false),
} }));

test('Chrome Reddit comment grows from their point with Reddit context and names the place', async () => {
  (Native.capture as jest.Mock).mockResolvedValue({ conversation: 'Demo author: What should I build first?', written: 'Demo author: What should I build first?', nodes: [{ text: 'reddit.com/r/demo/comments/1', left: 0, top: 0, bottom: 30, clickable: false, viewId: 'com.android.chrome:id/url_bar' }], fieldTop: null, typed: 'i would start with reliable offline saving.', app: 'com.android.chrome', label: 'Chrome', at: 0, id: 'reddit-web', hasField: true });
  const write = jest.fn(async (_request: DraftRequest, on: WriterEvents = {}) => {
    on.landed?.('reliable offline saving comes first.', 1);
    return { drafts: ['reliable offline saving comes first.'] };
  });
  const screen = await render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><Panel writer={{ write }} /></SafeAreaProvider>);
  await waitFor(() => expect(screen.getByText('Suggested replies · Reddit')).toBeTruthy());
  expect(write.mock.calls[0][0]).toMatchObject({ platform: { id: 'reddit', limit: 10000 }, typed: '', point: 'i would start with reliable offline saving.' });
  expect(screen.getByText('Yours')).toBeTruthy();
  expect(screen.getByText('Disagree')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Share this text' })).toBeTruthy();
});

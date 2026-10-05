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

// The same X screen with a real post above the composer: the panel grounds the
// reply cards on the post it read and routes to the writer (no withhold).
test('X reply with a readable post above the composer offers grounded reply cards', async () => {
  const write = jest.fn(async (_request: unknown, on?: { landed?: (text: string, slot: number) => void }) => {
    ['Agreeing with this.', 'Pushing back, kindly.', 'Asking a question.']
      .forEach((text, slot) => on?.landed?.(text, slot));
    return { drafts: ['Agreeing with this.', 'Pushing back, kindly.', 'Asking a question.'] };
  });
  (Native.capture as jest.Mock).mockResolvedValue({
    conversation: 'Umer @umer · 2h\nShipped the fix for the reply flow. The quoted post below was the spec.\nSpec @spec · 2h\nOriginal spec post with a long body that wraps on a phone.',
    written: 'Umer @umer · 2h\nShipped the fix for the reply flow. The quoted post below was the spec.',
    nodes: [
      { text: 'x.com/umer/status/42', left: 0, top: 0, bottom: 20, clickable: false, viewId: 'com.android.chrome:id/url_bar' },
      { text: 'Umer @umer · 2h', left: 8, top: 40, bottom: 56, clickable: false },
      { text: 'Shipped the fix for the reply flow. The quoted post below was the spec.', left: 8, top: 60, bottom: 96, clickable: false },
      { text: 'Spec @spec · 2h', left: 20, top: 104, bottom: 120, clickable: false },
      { text: 'Original spec post with a long body that wraps on a phone.', left: 20, top: 124, bottom: 156, clickable: false },
    ],
    fieldTop: 400, typed: '', app: 'com.android.chrome', label: 'Chrome', at: 0, id: 'x-web-2', hasField: true,
  });
  const screen = await render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}><Panel writer={{ write }} /></SafeAreaProvider>);
  await waitFor(() => expect(screen.getByText('Agreeing with this.')).toBeTruthy());
  expect(write).toHaveBeenCalled();
  expect(screen.queryByText(words.replyWithheld)).toBeNull();
  // Reply mode names the X reply slots and offers Insert.
  expect(screen.getAllByText(words.tagPushBack).length).toBeGreaterThan(0);
  expect(screen.getAllByRole('button', { name: words.insert }).length).toBe(3);
});

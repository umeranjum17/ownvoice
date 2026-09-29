// Each reply card says what it is for, in slot order. One render per file — RTL v14's queued
// cleanup can take a second Panel root in the same file before its drafts land.
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, waitFor } from '@testing-library/react-native';
import Panel from '../Panel';
import { stubWriter } from '../stubWriter';
import Native from '../../../modules/ownvoice-native';
import { words } from '../../core/words';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })),
  capture: jest.fn(), serviceState: jest.fn(async () => 'on'), insert: jest.fn(), copy: jest.fn(),
  modelStatus: jest.fn(async () => 'unavailable'), ask: jest.fn(), closePanel: jest.fn(),
} }));

const native = Native as jest.Mocked<typeof Native>;
const SAM = 'Sam: Are we still on for Saturday?\nSam: I can bring the tent if you bring the stove.';

test('reply cards are tagged Say yes, Say no kindly and Ask first, in slot order', async () => {
  native.capture.mockResolvedValue({ conversation: SAM, written: SAM, nodes: [], fieldTop: null, typed: '', app: 'dev.ownvoice.app', label: 'Ownvoice', at: 0, id: 'tap-1', hasField: true });
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Panel writer={stubWriter()} />
    </SafeAreaProvider>);
  await act(async () => { await Promise.resolve(); });
  await waitFor(() => expect(screen.queryByText(words.replyAsk)).toBeTruthy());
  const text = JSON.stringify(screen.toJSON());
  const at = (s: string) => text.indexOf(`"${s}"`);
  expect(at(words.replyYes)).toBeGreaterThan(-1);
  expect(at(words.replyYes)).toBeLessThan(at(words.replyNo));
  expect(at(words.replyNo)).toBeLessThan(at(words.replyAsk));
});

// Slice 8 panel polish: the shared verdict note. One render per file — RTL v14's queued
// cleanup can take a second Panel root in the same file before its drafts land.
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, waitFor } from '@testing-library/react-native';
import Panel from '../Panel';
import { stubWriter } from '../stubWriter';
import Native, { type Capture } from '../../../modules/ownvoice-native';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })),
  capture: jest.fn(), serviceState: jest.fn(async () => 'on'), insert: jest.fn(), copy: jest.fn(),
  modelStatus: jest.fn(async () => 'unavailable'), ask: jest.fn(), closePanel: jest.fn(),
} }));

const native = Native as jest.Mocked<typeof Native>;
const SAM = 'Sam: Are we still on for Saturday?\nSam: I can bring the tent if you bring the stove.';

test('cards that differ keep every verdict line', async () => {
  native.capture.mockResolvedValue({ conversation: SAM, written: SAM, nodes: [], fieldTop: null, typed: '', app: 'dev.ownvoice.app', label: 'Ownvoice', at: 0, hasField: true } as Capture);
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Panel writer={stubWriter({ drafts: ['Yes, still on.', 'Saturday works.', "Let's delve in; at the end of the day, moving forward."] })} />
    </SafeAreaProvider>);
  await act(async () => { await Promise.resolve(); });
  await waitFor(() => expect(JSON.stringify(screen.toJSON())).toContain('A bit stock'));
  const text = JSON.stringify(screen.toJSON());
  expect(text).toContain('Sounds natural');
  expect(text).toContain('you could say more simply');
});

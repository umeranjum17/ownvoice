// Slack's reply cards use Slack's own slot words. One render per file — RTL v14's queued
// cleanup can take a second Panel root in the same file before its drafts land.
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, waitFor } from '@testing-library/react-native';
import Panel from '../Panel';
import Native from '../../../modules/ownvoice-native';
import { words } from '../../core/words';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })),
  capture: jest.fn(), serviceState: jest.fn(async () => 'on'), insert: jest.fn(), copy: jest.fn(),
  closePanel: jest.fn(),
} }));

const native = Native as jest.Mocked<typeof Native>;
jest.mock('../../core/localModel', () => ({ askLocal: jest.fn(), localModelState: jest.fn(async () => ({ phase: 'unsupported' })), agreedToDownload: jest.fn(() => false) }));
const SAM = 'Sam: Are we still on for Saturday?\nSam: I can bring the tent if you bring the stove.';

test('Slack empty-field reply withholds instead of tagging reply cards', async () => {
  native.capture.mockResolvedValue({ conversation: SAM, written: SAM, nodes: [], fieldTop: null, typed: '', app: 'com.Slack', label: 'Slack', at: 0, id: 'tap-1', hasField: true });
  const write = jest.fn(async () => ({ drafts: [] as string[] }));
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Panel writer={{ write }} />
    </SafeAreaProvider>);
  await act(async () => { await Promise.resolve(); });
  await waitFor(() => expect(screen.queryByText(words.replyWithheld)).toBeTruthy());
  expect(write).not.toHaveBeenCalled();
  for (const tag of [words.tagConfirm, words.tagBlocker, words.tagUnclear, words.replyYes]) expect(screen.queryByText(tag)).toBeNull();
  expect(screen.queryByText(words.tryAgain)).toBeNull();
  expect(screen.queryByText(words.writeNew)).toBeNull();
});

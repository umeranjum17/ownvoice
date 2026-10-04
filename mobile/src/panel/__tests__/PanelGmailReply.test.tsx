// An empty Gmail reply compose shows the honest empty state. The reply opens a
// fresh compose screen where `written` holds only short header labels, so there
// is nothing to ground reply drafts on and the panel withholds like everywhere
// else. One render per file — RTL v14's queued cleanup can take a second Panel
// root in the same file before its drafts land.
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, waitFor } from '@testing-library/react-native';
import Panel from '../Panel';
import Native from '../../../modules/ownvoice-native';
import { words } from '../../core/words';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })),
  capture: jest.fn(), serviceState: jest.fn(async () => 'on'), insert: jest.fn(), copy: jest.fn(),
  modelStatus: jest.fn(async () => 'unavailable'), ask: jest.fn(), closePanel: jest.fn(),
} }));

const native = Native as jest.Mocked<typeof Native>;
// What the service captures in a Gmail reply compose: the long subject lives in an
// editable field off focus, so `written` holds only the short header labels while
// `conversation` still carries the subject line.
const SUBJECT = 'Re: ACTION REQUIRED: Alert ALT-21031 created - Prod-Ledger-service-Failed-events';
const WRITTEN = 'From\nOneUptime\nExternal recipient';

test('empty Gmail reply compose shows the empty state instead of reply cards', async () => {
  native.capture.mockResolvedValue({ conversation: `${SUBJECT}\n${WRITTEN}`, written: WRITTEN, nodes: [], fieldTop: null, typed: '', app: 'com.google.android.gm', label: 'Gmail', at: 0, id: 'tap-1', hasField: true });
  const write = jest.fn(async () => ({ drafts: [] as string[] }));
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Panel writer={{ write }} />
    </SafeAreaProvider>);
  await act(async () => { await Promise.resolve(); });
  await waitFor(() => expect(screen.queryByText(words.writeFirst)).toBeTruthy());
  expect(write).not.toHaveBeenCalled();
  expect(screen.queryByText(words.tagAccept)).toBeNull();
  expect(screen.queryByText(words.replyWithheld)).toBeNull();
});

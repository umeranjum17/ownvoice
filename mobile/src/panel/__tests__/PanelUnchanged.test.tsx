// An already-minimal text that comes back unchanged gets a calm "Looks good as it is" card with Copy,
// never the "Couldn't polish" line; a real failure still says it couldn't.
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import Panel from '../Panel';
import { stubWriter, type StubOptions } from '../stubWriter';
import { words } from '../../core/words';
import Native from '../../../modules/ownvoice-native';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })),
  capture: jest.fn(), serviceState: jest.fn(async () => 'on'), insert: jest.fn(), copy: jest.fn(async () => {}),
  modelStatus: jest.fn(async () => 'unavailable'), ask: jest.fn(), closePanel: jest.fn(),
} }));

const native = Native as jest.Mocked<typeof Native>;
const TYPED = 'Quick update:\n\n1. Pack the stove\n2. Meet Saturday';

const renderPanel = async (options: StubOptions) => {
  native.capture.mockResolvedValue({ conversation: '', written: '', nodes: [], fieldTop: null, typed: TYPED, app: 'dev.ownvoice.app', label: 'Ownvoice', at: 0, id: 'tap-1', hasField: true });
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Panel writer={stubWriter({ delay: 10, ...options })} />
    </SafeAreaProvider>);
  await act(async () => { await Promise.resolve(); });
  return screen;
};

test('unchanged shows their text as looking good, with Copy and no Use this', async () => {
  const screen = await renderPanel({ unchanged: true });
  await waitFor(() => expect(screen.getByText(words.looksGood)).toBeTruthy());
  expect(screen.getByText(words.looksGoodNote)).toBeTruthy();
  expect(screen.queryByText(words.noVersions)).toBeNull();
  expect(screen.queryByText(words.useThis)).toBeNull();
  expect(screen.queryByText('Yours')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: words.copy }));
  expect(native.copy).toHaveBeenCalledWith(TYPED);
});

test('a failed polish still says it couldn\'t, not that it looks good', async () => {
  const screen = await renderPanel({ empty: true });
  await waitFor(() => expect(screen.getByText(words.noVersions)).toBeTruthy());
  expect(screen.queryByText(words.looksGood)).toBeNull();
  expect(screen.getByText('Yours')).toBeTruthy();
});

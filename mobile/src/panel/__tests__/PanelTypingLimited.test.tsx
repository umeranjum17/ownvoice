// A limited (capped-prefix) capture must never write the whole field: the panel discloses the
// partial read and disables spelling Fix and draft Insert, while an ordinary capture keeps them.
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import Panel from '../Panel';
import { stubWriter } from '../stubWriter';
import { words } from '../../core/words';
import Native from '../../../modules/ownvoice-native';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })),
  capture: jest.fn(), serviceState: jest.fn(async () => 'on'), insert: jest.fn(async () => ({ ok: true, newlinesLost: false })), copy: jest.fn(),
  closePanel: jest.fn(), typingCheck: jest.fn(),
} }));
jest.mock('../../core/speller', () => ({
  speller: async () => {
    const { readFileSync } = require('fs');
    const dir = `${__dirname}/../../../assets/dictionary/`;
    return require('nspell')(readFileSync(dir + 'en-affixes.aff', 'utf8'), readFileSync(dir + 'en-words.dic', 'utf8'));
  },
}));

const native = Native as jest.Mocked<typeof Native>;
jest.mock('../../core/localModel', () => ({ askLocal: jest.fn(), localModelState: jest.fn(), agreedToDownload: jest.fn(() => false) }));

const TYPED = 'Its a good plan, I shoud be there by the the evening.';
const capture = (typingLimited?: boolean) => ({
  conversation: '', written: '', nodes: [], fieldTop: null,
  typed: TYPED, app: 'com.android.chrome', label: 'Chrome', at: 0, id: 'tap-limited', hasField: true, typingLimited,
});

const renderPanel = async (typingLimited?: boolean) => {
  native.typingCheck.mockResolvedValue(true);
  native.capture.mockResolvedValue(capture(typingLimited));
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Panel writer={stubWriter({ delay: 10 })} />
    </SafeAreaProvider>);
  await act(async () => { await Promise.resolve(); });
  return screen;
};

const disabledOf = (element: unknown) =>
  (element as { props: { accessibilityState?: { disabled?: boolean } } }).props.accessibilityState?.disabled;

beforeEach(() => jest.clearAllMocks());

test('a limited capture discloses the partial read and disables Fix and Insert', async () => {
  const screen = await renderPanel(true);
  expect(await screen.findByText(words.typingLimited)).toBeTruthy();
  expect(await screen.findByText(words.slipsTitle)).toBeTruthy();
  const fixes = screen.getAllByRole('button', { name: words.fix });
  expect(fixes.length).toBeGreaterThan(0);
  expect(fixes.map(disabledOf)).toEqual(fixes.map(() => true));
  const inserts = await screen.findAllByRole('button', { name: words.useThis });
  expect(inserts.map(disabledOf)).toEqual(inserts.map(() => true));
  fireEvent.press(fixes[0]);
  fireEvent.press(inserts[0]);
  await act(async () => { await Promise.resolve(); });
  expect(native.insert).not.toHaveBeenCalled();
});

test('an ordinary capture keeps Fix and Insert enabled', async () => {
  const screen = await renderPanel(false);
  await waitFor(() => expect(screen.queryByText(words.typingLimited)).toBeNull());
  expect(await screen.findByText(words.slipsTitle)).toBeTruthy();
  const fixes = screen.getAllByRole('button', { name: words.fix });
  expect(fixes.map(disabledOf)).toEqual(fixes.map(() => false));
  fireEvent.press(fixes[0]);
  await waitFor(() => expect(native.insert).toHaveBeenCalled());
  const inserts = await screen.findAllByRole('button', { name: words.useThis });
  expect(disabledOf(inserts[0])).toBe(false);
});

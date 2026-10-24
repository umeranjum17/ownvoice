// A card never stays a grey placeholder: "Still working" after a while, then the run stops at its writer's
// deadline. 1.0.8 on the owner's phone left the middle card loading forever on "Looks nice".
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, cleanup as screenCleanup, fireEvent, render } from '@testing-library/react-native';
import Panel from '../Panel';
import { words } from '../../core/words';
import Native from '../../../modules/ownvoice-native';
import type { DraftRequest, WriterEvents } from '../../core/writers';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })),
  capture: jest.fn(), serviceState: jest.fn(async () => 'on'), insert: jest.fn(), copy: jest.fn(async () => {}),
  closePanel: jest.fn(async () => {}), openRoute: jest.fn(async () => {}), typingCheck: jest.fn(async () => false),
} }));
jest.mock('../../core/localModel', () => ({ askLocal: jest.fn(async () => { throw new Error('offline'); }), localModelState: jest.fn(async () => ({ phase: 'unsupported' })), agreedToDownload: jest.fn(() => false) }));
jest.mock('../../core/speller', () => ({ speller: async () => null }));

const native = Native as jest.Mocked<typeof Native>;
const never = new Promise<never>(() => {});

beforeEach(() => { jest.useFakeTimers(); });
afterEach(async () => { await screenCleanup(); jest.useRealTimers(); });

const wait = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms); for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const renderPanel = async (write: (request: DraftRequest, on: WriterEvents) => Promise<{ drafts: string[] }>) => {
  native.capture.mockResolvedValue({ conversation: '', written: '', nodes: [], fieldTop: null, typed: 'Looks nice', app: 'com.twitter.android', label: 'X', at: 0, id: 'tap-1', hasField: true });
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Panel writer={{ write }} />
    </SafeAreaProvider>);
  await wait(0);
  return screen;
};

test('a writer that never answers says it is still working, then took too long, with Try again and another writer', async () => {
  const write = jest.fn(() => never);
  const screen = await renderPanel(write);
  expect(screen.queryAllByTestId('placeholder').length).toBe(2);
  await wait(20_000);
  expect(screen.getByText(words.stillWorkingCloud)).toBeTruthy();
  await wait(70_000);
  expect(screen.getByText(words.tookTooLong)).toBeTruthy();
  expect(screen.queryAllByTestId('placeholder')).toHaveLength(0);
  expect(screen.getByRole('button', { name: words.claudeChooseWriter })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: words.tryAgain }));
  expect(write).toHaveBeenCalledTimes(2);
});

test('on the phone writer the deadline waits for the slow phone, and a card that never comes collapses', async () => {
  let on!: WriterEvents;
  const screen = await renderPanel(async (_request, events) => { on = events; events.fallback?.(); return never; });
  await act(async () => { on.landed?.('Looks really nice.', 2, 'Main point first'); });
  expect(screen.getByText('Looks really nice.')).toBeTruthy();
  // Only Shorter is still coming: Cleaned up comes from the spelling fix at once, never from the writer.
  expect(screen.queryAllByTestId('placeholder')).toHaveLength(1);
  await wait(20_000);
  expect(screen.getByText(words.stillWorking)).toBeTruthy();
  // A cloud deadline would have stopped by now; the phone's own is longer.
  await wait(100_000);
  expect(screen.queryAllByTestId('placeholder')).toHaveLength(1);
  await wait(200_000);
  expect(screen.queryAllByTestId('placeholder')).toHaveLength(0);
  expect(screen.getByText('Looks really nice.')).toBeTruthy();
  expect(screen.queryByText(words.tookTooLong)).toBeNull();
  // A late card from the stopped run is not mixed in.
  await act(async () => { on.landed?.("I'm late.", 1, 'Shorter'); });
  expect(screen.queryByText("I'm late.")).toBeNull();
});

test('every version dropped ends on a plain line with Try again and another writer, never an empty card', async () => {
  const screen = await renderPanel(async () => ({ drafts: [] }));
  expect(screen.getByText(words.noVersions)).toBeTruthy();
  expect(screen.queryAllByTestId('placeholder')).toHaveLength(0);
  expect(screen.getByRole('button', { name: words.tryAgain })).toBeTruthy();
  expect(screen.getByRole('button', { name: words.claudeChooseWriter })).toBeTruthy();
});

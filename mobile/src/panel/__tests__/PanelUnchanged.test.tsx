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
  closePanel: jest.fn(), typingCheck: jest.fn(async () => false),
} }));

const native = Native as jest.Mocked<typeof Native>;
jest.mock('../../core/localModel', () => ({ askLocal: jest.fn(), localModelState: jest.fn(async () => ({ phase: 'unsupported' })), agreedToDownload: jest.fn(() => false) }));
const TYPED = 'Quick update:\n\n1. Pack the stove\n2. Meet Saturday';

const renderPanel = async (options: StubOptions, typed = TYPED) => {
  native.capture.mockResolvedValue({ conversation: '', written: '', nodes: [], fieldTop: null, typed, app: 'dev.ownvoice.app', label: 'Ownvoice', at: 0, id: 'tap-1', hasField: true });
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
  expect(screen.getByRole('button', { name: words.tryAgain })).toBeTruthy();
});

// Main279 actual nonsense panel: semantic refusal was rendered as a transient failure, without header Dot.
test('captured nonsense has honest refusal, no retry, retained repeat fix and the normal header mascot', async () => {
  native.typingCheck.mockResolvedValue(true);
  try {
    const screen = await renderPanel({ declined: true }, 'purple toaster clouds ate the database backwards banana banana');
    await waitFor(() => expect(screen.getByText(words.unclearPolish)).toBeTruthy());
    await waitFor(() => expect(screen.getByRole('button', { name: words.fix })).toBeTruthy());
    expect(screen.getByText(words.slipsTitle)).toBeTruthy();
    expect(screen.queryByText(words.noVersions)).toBeNull();
    expect(screen.queryByRole('button', { name: words.tryAgain })).toBeNull();
    const sizes: number[] = [];
    const walk = (node: unknown) => {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (!node || typeof node !== 'object') return;
      const item = node as { type?: string; props?: { width?: number }; children?: unknown[] };
      if (item.type === 'RNSVGSvgView' && [44, 72].includes(item.props?.width ?? 0)) sizes.push(item.props!.width!);
      item.children?.forEach(walk);
    };
    walk(screen.toJSON());
    expect(sizes).toEqual([44]);
  } finally { native.typingCheck.mockResolvedValue(false); }
});

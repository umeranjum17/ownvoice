// Edit before insert: Umer can change a suggested card in the panel. Insert then puts exactly
// the edited text in the box, the ratings follow the edited text, Cancel inserts nothing, and
// the panel never offers to send or post.
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Panel from '../Panel';
import { words } from '../../core/words';
import type { DraftRequest, WriterEvents } from '../../core/writers';
import Native, { type Capture } from '../../../modules/ownvoice-native';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })),
  capture: jest.fn(), serviceState: jest.fn(async () => 'on'), insert: jest.fn(async () => {}), copy: jest.fn(),
  modelStatus: jest.fn(async () => 'unavailable'), ask: jest.fn(), closePanel: jest.fn(),
} }));

const native = Native as jest.Mocked<typeof Native>;
const POST = 'Shipping one small fix beats another week polishing the launch page.';
const DRAFTS = [
  'Week twelve is where retention showed up for us. Did the drop come before or after your pricing change?',
  'Agreed, the first five users taught me more than any landing page did.',
  'Which fix did you ship first?',
];
// Empty-field replies withhold every card in 1.0.3, so the edit suite drives polish:
// typed text plus a writer landing the same three drafts the reply path used to show.
const TYPED = 'My take: shipping one small fix beats more polishing.';
const X: Capture = { conversation: `Dana Lee @danabuilds · 2h\n${POST}`, written: POST, nodes: [], fieldTop: null, typed: TYPED,
  app: 'com.twitter.android', label: 'X', at: 0, id: 'tap-edit', hasField: true };

const open = async () => {
  native.capture.mockResolvedValue(X);
  const write = async (_request: DraftRequest, on: WriterEvents = {}) => {
    await new Promise(resolve => setTimeout(resolve, 1));
    DRAFTS.forEach((text, slot) => on.landed?.(text, slot));
    return { drafts: [...DRAFTS] };
  };
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Panel writer={{ write }} />
    </SafeAreaProvider>);
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(3));
  return screen;
};
// Index 0 is the Yours card for the typed text; index 1 is the first landed draft.
const firstRating = (screen: Awaited<ReturnType<typeof open>>) => screen.getAllByLabelText(/^Engagement on /)[1].props.accessibilityLabel as string;

beforeEach(() => native.insert.mockClear());

test('an edited card inserts exactly the edited text and is rated as edited', async () => {
  const screen = await open();
  expect(firstRating(screen)).toMatch(/^Engagement on X: Nothing flagged\./);
  await fireEvent.press(screen.getAllByRole('button', { name: 'Edit' })[0]);
  const edited = 'Week twelve, for us. More at https://example.com';
  await fireEvent.changeText(screen.getByLabelText('Edit this draft'), edited);
  expect(firstRating(screen)).toMatch(/^Engagement on X: Worth a second look\. Has a link\./);
  await fireEvent.press(screen.getAllByRole('button', { name: words.useThis })[0]);
  await waitFor(() => expect(native.insert).toHaveBeenCalledTimes(1));
  expect(native.insert).toHaveBeenCalledWith(edited);
});

test('Cancel inserts nothing and brings back the original card and its rating', async () => {
  const screen = await open();
  const before = firstRating(screen);
  await fireEvent.press(screen.getAllByRole('button', { name: 'Edit' })[0]);
  await fireEvent.changeText(screen.getByLabelText('Edit this draft'), 'See https://example.com');
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByLabelText('Edit this draft')).toBeNull();
  expect(firstRating(screen)).toBe(before);
  expect(JSON.stringify(screen.toJSON())).toContain(DRAFTS[0]);
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(native.insert).not.toHaveBeenCalled();
});

test('an emptied edit cannot be inserted, and nothing offers to send or post', async () => {
  const screen = await open();
  await fireEvent.press(screen.getAllByRole('button', { name: 'Edit' })[0]);
  await fireEvent.changeText(screen.getByLabelText('Edit this draft'), '   ');
  await fireEvent.press(screen.getAllByRole('button', { name: words.useThis })[0]);
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(native.insert).not.toHaveBeenCalled();
  expect(screen.queryAllByRole('button', { name: /^(send|post|reply|tweet)\b/i })).toEqual([]);
});

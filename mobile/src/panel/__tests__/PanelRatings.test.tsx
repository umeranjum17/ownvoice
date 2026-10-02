// X first slice: every reply card on a feed app carries an engagement rating built from
// concrete things its text shows on that platform, plus a separate stock-wording rating.
// Text checks only flag what holds a post back: nothing rates a draft up, reach is never
// predicted, a missing post is said out loud, and chats keep their cards as they were.
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Panel from '../Panel';
import { stubWriter } from '../stubWriter';
import Native, { type Capture } from '../../../modules/ownvoice-native';
import { technicalWords } from '../../core/words';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })),
  capture: jest.fn(), serviceState: jest.fn(async () => 'on'), insert: jest.fn(async () => {}), copy: jest.fn(),
  modelStatus: jest.fn(async () => 'unavailable'), ask: jest.fn(), closePanel: jest.fn(),
} }));

const native = Native as jest.Mocked<typeof Native>;

// Fictional X reply screen: the parent post's header, its body, the action row, then Umer's reply box at 900.
const POST = 'Shipping one small fix beats another week polishing the launch page.';
const X_NODES = [
  { text: 'Dana Lee @danabuilds · 2h', left: 40, top: 200, bottom: 240, clickable: false },
  { text: POST, left: 40, top: 250, bottom: 330, clickable: false },
  { text: '', description: '12 replies', left: 40, top: 340, bottom: 380, clickable: true },
];
const DRAFTS = [
  'Week twelve is where retention showed up for us. Did the drop come before or after your pricing change?',
  'Great post! Wrote more on this at https://example.com',
  'Shipping one small fix beats polishing the launch page.',
];
// Flattery plus words the post never used: new words alone must not read as a good reply.
const NONSENSE = 'Great post! Purple turbines whisper banana logistics forever.';

const capture = (over: Partial<Capture> = {}): Capture => ({
  conversation: `Dana Lee @danabuilds · 2h\n${POST}`, written: POST, nodes: X_NODES, fieldTop: 900, typed: '',
  app: 'com.twitter.android', label: 'X', at: 0, id: 'tap-x', hasField: true, ...over,
});

const open = async (value: Capture, drafts = DRAFTS) => {
  native.capture.mockResolvedValue(value);
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Panel writer={stubWriter({ drafts, delay: 1 })} />
    </SafeAreaProvider>);
  await waitFor(() => expect(screen.getAllByRole('button', { name: value.typed.trim() ? 'Use this' : 'Insert' }).length).toBeGreaterThan(0));
  return screen;
};
const ratingsOf = (screen: Awaited<ReturnType<typeof open>>) => screen.queryAllByLabelText(/^Engagement on /).map(node => node.props.accessibilityLabel as string);

test('each X reply card shows its own engagement and stock-wording rating, and none rates a draft up', async () => {
  const labels = ratingsOf(await open(capture()));
  expect(labels).toHaveLength(3);
  const [question, linked, repeat] = labels;
  // A question mark is reported as a plain fact, never as a reason the reply will do well.
  expect(question).toBe("Engagement on X: Nothing flagged. Asks a question. Text alone can't predict reach. Stock wording: None found.");
  expect(linked).toMatch(/^Engagement on X: Holds it back\. Has a link\./);
  expect(linked).toMatch(/Stock wording: Some\. “Great post!”: starts with flattery/);
  // The repeat is a literal word-overlap fact under stock wording, not an engagement judgement.
  expect(repeat).toMatch(/^Engagement on X: Nothing flagged\. Text alone can't predict reach\./);
  expect(repeat).toContain("Stock wording: Some. Reuses most of the post's words.");
  for (const label of labels) {
    expect(label).not.toMatch(/Helps|Adds something|until you post|viral|will get|\d/i);
    expect(technicalWords.test(label)).toBe(false);
  }
});

test('flattery with words the post never used is not rated up', async () => {
  const [label] = ratingsOf(await open(capture(), [NONSENSE, DRAFTS[0], DRAFTS[2]]));
  expect(label).toMatch(/^Engagement on X: Nothing flagged\./);
  expect(label).toMatch(/Stock wording: Some\. “Great post!”: starts with flattery/);
});

test('the post the writer drafted from counts as read even when the layout shows no post block', async () => {
  const labels = ratingsOf(await open(capture({ nodes: [], fieldTop: null })));
  expect(labels).toHaveLength(3);
  for (const label of labels) expect(label).not.toContain("Couldn't read the post");
  expect(labels[2]).toContain("Reuses most of the post's words");
});

test('a new post with nothing on screen makes no parent comparison and reports no missing post', async () => {
  const labels = ratingsOf(await open(capture({ conversation: '', written: '', nodes: [], fieldTop: null, typed: 'Shipping one small fix beats another week polishing the launch page.' })));
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) expect(label).not.toMatch(/Couldn't read the post|Reuses most of the post's words|Tags people/);
});

test('Insert still puts the exact rated card text in the box and never posts', async () => {
  const screen = await open(capture());
  fireEvent.press(screen.getAllByRole('button', { name: 'Insert' })[0]);
  await waitFor(() => expect(native.insert).toHaveBeenCalledWith(DRAFTS[0]));
});

test.each([['com.whatsapp', 'WhatsApp'], ['dev.ownvoice.app', 'Ownvoice']])('%s cards carry no engagement rating', async (app, label) => {
  const screen = await open(capture({ app, label, nodes: [], fieldTop: null }));
  expect(ratingsOf(screen)).toEqual([]);
  expect(JSON.stringify(screen.toJSON())).not.toContain('Stock wording');
});

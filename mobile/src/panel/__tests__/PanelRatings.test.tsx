// X first slice: every reply card on a feed app carries an engagement rating built from
// concrete things its text shows on that platform, plus a separate stock-wording rating.
// Text checks only flag what holds a post back: nothing rates a draft up, reach is never
// predicted, a missing post is said out loud, and chats keep their cards as they were.
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Panel from '../Panel';
import { technicalWords, words } from '../../core/words';
import type { DraftRequest, WriterEvents } from '../../core/writers';
import Native, { type Capture } from '../../../modules/ownvoice-native';

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

// Empty-field replies withhold every card in 1.0.3, so the rating suite drives polish:
// typed text plus a writer landing the same drafts the reply path used to show.
const TYPED = 'My take: shipping one small fix beats more polishing.';
const capture = (over: Partial<Capture> = {}): Capture => ({
  conversation: `Dana Lee @danabuilds · 2h\n${POST}`, written: POST, nodes: X_NODES, fieldTop: 900, typed: TYPED,
  app: 'com.twitter.android', label: 'X', at: 0, id: 'tap-x', hasField: true, ...over,
});

const open = async (value: Capture, drafts = DRAFTS) => {
  native.capture.mockResolvedValue(value);
  const write = async (_request: DraftRequest, on: WriterEvents = {}) => {
    await new Promise(resolve => setTimeout(resolve, 1));
    drafts.forEach((text, slot) => on.landed?.(text, slot));
    return { drafts: [...drafts] };
  };
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Panel writer={{ write }} />
    </SafeAreaProvider>);
  await waitFor(() => expect(screen.getAllByRole('button', { name: value.typed.trim() ? 'Use this' : 'Insert' }).length).toBeGreaterThan(0));
  return screen;
};
// Index 0 is the Yours card for the typed text; the rest are the landed drafts.
const ratingsOf = (screen: Awaited<ReturnType<typeof open>>) => screen.queryAllByLabelText(/^(Engagement on |Stock wording)/).slice(1).map(node => node.props.accessibilityLabel as string);

test('each X reply card shows only the checks that found something, and none rates a draft up', async () => {
  const labels = ratingsOf(await open(capture()));
  // The question card asks a question, so it carries the engagement row and no stock row; the link
  // card carries both (a link and flattery); the repeat carries only stock wording, not engagement.
  expect(labels).toHaveLength(3);
  const [question, linked, repeat] = labels;
  expect(question).toBe("Engagement on X: Nothing flagged. Asks a question. Text alone can't predict reach.");
  expect(linked).toMatch(/^Engagement on X: Worth a second look\. Has a link\./);
  expect(linked).toMatch(/Stock wording: Some\. “Great post!”: starts with flattery/);
  // The repeat is a literal word-overlap fact under stock wording, not an engagement judgement, so it
  // gets a stock row only.
  expect(repeat).toMatch(/^Stock wording: Some\. Shares most of its wording with the post\.$/);
  for (const label of labels) {
    expect(label).not.toMatch(/None found|rate the fit|Helps|Adds something|until you post|viral|will get/);
    expect(technicalWords.test(label)).toBe(false);
  }
});

test('a card with nothing to flag carries no rating rows at all', async () => {
  const clean = await open(capture(), ['Purple turbines whisper banana logistics.']);
  expect(ratingsOf(clean)).toEqual([]);
});

test('flattery with words the post never used is not rated up', async () => {
  const [label] = ratingsOf(await open(capture(), [NONSENSE, DRAFTS[0], DRAFTS[2]]));
  expect(label).toMatch(/^Stock wording: Some\. “Great post!”: starts with flattery/);
  expect(label).not.toMatch(/Engagement on X/);
});

test('the post the writer drafted from counts as read even when the layout shows no post block', async () => {
  const labels = ratingsOf(await open(capture({ nodes: [], fieldTop: null })));
  expect(labels).toHaveLength(3);
  for (const label of labels) expect(label).not.toContain("Couldn't read the post");
  expect(labels[2]).toContain("Shares most of its wording with the post");
});

test('a new post with nothing on screen makes no parent comparison and reports no missing post', async () => {
  const labels = ratingsOf(await open(capture({ conversation: '', written: '', nodes: [], fieldTop: null, typed: 'Shipping one small fix beats another week polishing the launch page.' })));
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) expect(label).not.toMatch(/Couldn't read the post|Shares most of its wording with the post|Tags people/);
});

test('a card with four engagement signals reads all four aloud, concerns included', async () => {
  const draft = `@stranger what do you think? See https://example.com ${'x'.repeat(300)}`;
  const labels = ratingsOf(await open(capture(), [draft]));
  expect(labels).toHaveLength(1);
  for (const signal of ['Too long for X', 'Has a link', "Tags people who aren't in the post", 'Asks a question']) {
    expect(labels[0]).toContain(signal);
  }
});

test('Insert still puts the exact rated card text in the box and never posts', async () => {
  const screen = await open(capture());
  fireEvent.press(screen.getAllByRole('button', { name: words.useThis })[0]);
  await waitFor(() => expect(native.insert).toHaveBeenCalledWith(DRAFTS[0]));
});

test.each([['com.whatsapp', 'WhatsApp'], ['dev.ownvoice.app', 'Ownvoice']])('%s cards carry no engagement rating', async (app, label) => {
  const screen = await open(capture({ app, label, nodes: [], fieldTop: null }));
  expect(ratingsOf(screen)).toEqual([]);
  expect(JSON.stringify(screen.toJSON())).not.toContain('Stock wording');
});

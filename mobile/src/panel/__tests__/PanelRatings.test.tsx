// X first slice: every reply card on a feed app carries an engagement rating built from
// concrete things its text shows on that platform, plus a separate stock-wording rating.
// Text checks only flag what holds a post back: nothing rates a draft up, reach is never
// predicted, a missing post is said out loud, and chats keep their cards as they were.
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import Panel from '../Panel';
import { technicalWords, words } from '../../core/words';
import * as FitModule from '../../grow/fit';
import { LEVELS, UNSURE, type Fit } from '../../grow/fit';
import type { DraftRequest, WriterEvents } from '../../core/writers';
import Native, { type Capture } from '../../../modules/ownvoice-native';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })),
  capture: jest.fn(), serviceState: jest.fn(async () => 'on'), insert: jest.fn(async () => {}), copy: jest.fn(),
  closePanel: jest.fn(),
} }));

const native = Native as jest.Mocked<typeof Native>;
jest.mock('../../core/localModel', () => ({ askLocal: jest.fn(), localModelState: jest.fn(async () => ({ phase: 'unsupported' })), agreedToDownload: jest.fn(() => false) }));

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
  const screen = await open(capture());
  const labels = ratingsOf(screen);
  // The question card asks a question, so it carries the engagement row and no stock row; the link
  // card carries its bar (bottom level, flag reason) plus stock wording; the repeat carries only
  // stock wording, not engagement. One card, one fit verdict: no engagement row repeats a bar level.
  expect(labels).toHaveLength(3);
  const [question, linked, repeat] = labels;
  expect(question).toBe("Engagement on X: Nothing flagged. Asks a question. Text alone can't predict reach.");
  expect(linked).toMatch(/Stock wording: Some\. “Great post!”: starts with flattery/);
  expect(linked).not.toMatch(/^Engagement on X/);
  expect(screen.getAllByLabelText(LEVELS[0])).toHaveLength(1);
  expect(screen.getByText('Has a link.')).toBeTruthy();
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

test('a clean card that could not read the post still says so', async () => {
  const labels = ratingsOf(await open(capture({ conversation: '', nodes: [], fieldTop: null }), ['Purple turbines whisper banana logistics.']));
  expect(labels).toHaveLength(1);
  expect(labels[0]).toContain("Couldn't read the post to compare");
  expect(labels[0]).not.toMatch(/None found|rate the fit/);
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

test('a card with four engagement signals reads all four aloud in its bar, bottom level', async () => {
  const draft = `@stranger what do you think? See https://example.com ${'x'.repeat(300)}`;
  const screen = await open(capture(), [draft]);
  await waitFor(() => expect(screen.getAllByTestId('fit-bar')).toHaveLength(1));
  expect(screen.getAllByLabelText(LEVELS[0])).toHaveLength(1);
  expect(screen.queryAllByLabelText(/^Engagement on /)).toEqual([]);
  expect(screen.getByText("Has a link. Too long for X. Tags people who aren't in the post. Asks a question.")).toBeTruthy();
});

test('Insert still puts the exact rated card text in the box and never posts', async () => {
  const screen = await open(capture());
  const card = (text: string) => within(screen.getByText(text).parent!);
  await fireEvent.press(card(DRAFTS[0]).getByRole('button', { name: words.useThis }));
  await waitFor(() => expect(native.insert).toHaveBeenCalledWith(DRAFTS[0]));
});

// Grow mode's fit bar: the cards land first and the bar fills in when the fit does. The real
// judgeFit runs everywhere below (no key means no fetch and every card rates unavailable); only
// the scripted levels are faked, per candidate text, through a spy on the module Panel calls.
describe('grow fit bar', () => {
  const CLEAN = [
    'Did the pricing change land before the retention drop showed up?',
    'Week twelve is where retention showed up for us. Did the drop come before or after your pricing change?',
    'Shipping one small fix beats polishing the launch page.',
  ];
  const fit = (over: Partial<Fit> = {}): Fit => ({ level: 3, words: LEVELS[3], probability: 0.7, voice: null, ...over });
  const bars = (screen: Awaited<ReturnType<typeof open>>) => screen.getAllByTestId('fit-bar');
  const fills = (bar: ReturnType<typeof bars>[number]) =>
    [0, 1, 2, 3].map(i => within(bar).getByTestId(`fit-segment-${i}`).props.style.backgroundColor);

  test('the cards land before the bar and each judged level fills its own segments', async () => {
    let resolveFit!: (fits: Fit[]) => void;
    const spy = jest.spyOn(FitModule, 'judgeFit').mockImplementation(() => new Promise(resolve => { resolveFit = resolve; }));
    try {
      const screen = await open(capture(), CLEAN);
      expect(screen.getByText('Suggested replies · X')).toBeTruthy();
      expect(spy).toHaveBeenCalled();
      // The fit has not landed: cards with their actions, but no bar yet.
      expect(screen.getAllByRole('button', { name: 'Use this' }).length).toBeGreaterThan(0);
      expect(screen.queryByTestId('fit-bar')).toBeNull();
      resolveFit([fit({ level: 3, words: LEVELS[3] }), fit({ level: 2, words: LEVELS[2] }), fit({ level: 1, words: LEVELS[1] }), fit({ level: 0, words: LEVELS[0] })]);
      await waitFor(() => expect(screen.getAllByTestId('fit-bar')).toHaveLength(4));
      // Yours first, then the drafts in their ranked slots: one bar per level word.
      for (const word of LEVELS) expect(screen.getAllByLabelText(word)).toHaveLength(1);
      // One fit verdict per card: the bar carries the level, so no engagement row repeats it.
      expect(screen.queryAllByLabelText(/^Engagement on /)).toEqual([]);
      const reasons = [
        'Reads like it moves the conversation forward.',
        'Asks a question. Reads on-topic, with a clear point.',
        'Asks a question. Reads relevant, but vague.',
        'Reads off-topic, or like bait.',
      ];
      for (const reason of reasons) expect(screen.getByText(reason)).toBeTruthy();
      for (const reason of reasons) { expect(reason).not.toMatch(/\d|%/); expect(technicalWords.test(reason)).toBe(false); }
      // Four segments each: the second-ranked bar fills three, the third two, the bottom one.
      const [, good, vague, skipped] = bars(screen);
      const distinct = (colors: unknown[]) => colors.filter((color, i, all) => all.indexOf(color) === i);
      expect(distinct(fills(good))).toHaveLength(2);
      const [first, second, third, fourth] = fills(vague);
      expect(second).toBe(first);
      expect(third).not.toBe(first);
      expect(fourth).toBe(third);
      const [bottomFirst, ...bottomRest] = fills(skipped);
      expect(bottomRest.every(color => color !== bottomFirst)).toBe(true);
      expect(bottomFirst).toBe(first);
      for (const label of LEVELS.map(word => screen.getByLabelText(word).props.accessibilityLabel as string)) {
        expect(label).not.toMatch(/\d|%/);
        expect(technicalWords.test(label)).toBe(false);
      }
    } finally { spy.mockRestore(); }
  });

  test('an abstained card says it is not sure, with an empty bar', async () => {
    const spy = jest.spyOn(FitModule, 'judgeFit')
      .mockResolvedValue([fit({ level: null, words: UNSURE, probability: null }), fit({ level: 2, words: LEVELS[2] })]);
    try {
      const screen = await open(capture(), [CLEAN[0]]);
      await waitFor(() => expect(screen.getAllByTestId('fit-bar')).toHaveLength(2));
      expect(screen.getAllByLabelText(UNSURE)).toHaveLength(1);
      expect(screen.queryAllByLabelText(/^Engagement on /)).toEqual([]);
      expect(screen.getByText(words.fitWhyUnsure)).toBeTruthy();
      expect(screen.getByText('Asks a question. Reads on-topic, with a clear point.')).toBeTruthy();
      const [unsure] = bars(screen);
      expect(new Set(fills(unsure)).size).toBe(1);
    } finally { spy.mockRestore(); }
  });

  test('a link card shows the bottom level and says why, over a strong level', async () => {
    const spy = jest.spyOn(FitModule, 'judgeFit').mockResolvedValue([fit(), fit()]);
    try {
      const screen = await open(capture(), ['See the full thread at https://example.com/launch-notes for the numbers.']);
      await waitFor(() => expect(screen.getAllByTestId('fit-bar')).toHaveLength(2));
      expect(screen.getAllByLabelText(LEVELS[3])).toHaveLength(1);
      expect(screen.getAllByLabelText(LEVELS[0])).toHaveLength(1);
      expect(screen.queryAllByLabelText(/^Engagement on /)).toEqual([]);
      expect(within(bars(screen)[1]).getByText('Has a link.')).toBeTruthy();
    } finally { spy.mockRestore(); }
  });

  test('a never-say card shows the bottom level and quotes the phrase back', async () => {
    const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;
    kv.set('voice', JSON.stringify({ never: ['circle back'], noDashes: false, statementEndings: false, note: '' }));
    const spy = jest.spyOn(FitModule, 'judgeFit').mockResolvedValue([fit(), fit({ level: 2, words: LEVELS[2] })]);
    try {
      const screen = await open(capture(), ["Let's circle back on the launch thread tomorrow."]);
      await waitFor(() => expect(screen.getAllByTestId('fit-bar')).toHaveLength(2));
      expect(screen.getAllByLabelText(LEVELS[0])).toHaveLength(1);
      const bar = bars(screen)[1];
      expect(within(bar).getByText(/on your never-say list/)).toBeTruthy();
      expect(within(bar).getByText(/circle back/i)).toBeTruthy();
    } finally { spy.mockRestore(); kv.delete('voice'); }
  });

  test('a too-long card shows the bottom level and says so', async () => {
    const spy = jest.spyOn(FitModule, 'judgeFit').mockResolvedValue([fit(), fit()]);
    try {
      const screen = await open(capture(), [`On X the detail is ${'x'.repeat(300)}`]);
      await waitFor(() => expect(screen.getAllByTestId('fit-bar')).toHaveLength(2));
      expect(screen.getAllByLabelText(LEVELS[0])).toHaveLength(1);
      expect(within(bars(screen)[1]).getByText('Too long for X.')).toBeTruthy();
    } finally { spy.mockRestore(); }
  });

  test('Why? carries the reach line once, off the card', async () => {
    let resolveFit!: (fits: Fit[]) => void;
    const spy = jest.spyOn(FitModule, 'judgeFit').mockImplementation(() => new Promise(resolve => { resolveFit = resolve; }));
    try {
      const screen = await open(capture(), [CLEAN[0]]);
      resolveFit([fit({ level: 2, words: LEVELS[2] }), fit({ level: 2, words: LEVELS[2] })]);
      await waitFor(() => expect(screen.getAllByTestId('fit-bar')).toHaveLength(2));
      expect(screen.queryByText("Text alone can't predict reach"))
        .toBeNull();
      await fireEvent.press(screen.getAllByRole('button', { name: words.why })[1]);
      await waitFor(() => expect(screen.getByText("Text alone can't predict reach")).toBeTruthy());
    } finally { spy.mockRestore(); }
  });

  test('an unrateable card carries no bar at all', async () => {
    const spy = jest.spyOn(FitModule, 'judgeFit');
    try {
      const screen = await open(capture(), ['Purple turbines whisper banana logistics.']);
      await waitFor(() => expect(spy).toHaveBeenCalled());
      await act(async () => { await spy.mock.results[0].value; });
      expect(screen.queryByTestId('fit-bar')).toBeNull();
    } finally { spy.mockRestore(); }
  });
});

test.each([['com.whatsapp', 'WhatsApp'], ['dev.ownvoice.app', 'Ownvoice']])('%s cards carry no engagement rating', async (app, label) => {
  const screen = await open(capture({ app, label, nodes: [], fieldTop: null }));
  expect(ratingsOf(screen)).toEqual([]);
  expect(JSON.stringify(screen.toJSON())).not.toContain('Stock wording');
});

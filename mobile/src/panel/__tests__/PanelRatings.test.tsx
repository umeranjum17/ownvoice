// X first slice: every reply card on a feed app carries an engagement rating built from
// concrete things its text shows on that platform, plus a separate stock-wording rating.
// Text checks only flag what holds a post back: nothing rates a draft up, reach is never
// predicted, a missing post is said out loud, and chats keep their cards as they were.
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { fakeLlama } from '@byokit/infer/testing';
import { initLlama } from 'llama.rn';
import Panel from '../Panel';
import { phoneWriter } from '../phoneWriter';
import { askLocal, localModelState } from '../../core/localModel';
import { technicalWords, words } from '../../core/words';
import * as FitModule from '../../grow/fit';
import { LEVELS, UNSURE, type Fit } from '../../grow/fit';
import { cloudWords, withPhoneFallback, type DraftRequest, type Writer, type WriterEvents } from '../../core/writers';
import Native, { type Capture } from '../../../modules/ownvoice-native';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })),
  capture: jest.fn(), serviceState: jest.fn(async () => 'on'), insert: jest.fn(async () => {}), copy: jest.fn(),
  closePanel: jest.fn(),
} }));

const native = Native as jest.Mocked<typeof Native>;
jest.mock('../../core/localModel', () => ({ askLocal: jest.fn(), localModelState: jest.fn(async () => ({ phase: 'unsupported' })), agreedToDownload: jest.fn(() => false) }));
jest.mock('llama.rn', () => ({ initLlama: jest.fn() }));
jest.mock('../../core/localStore', () => ({
  createLocalStore: () => ({
    path: (m: { file: string }) => `/models/${m.file}`,
    size: async (m: { bytes: number }) => m.bytes,
    sha256: async (m: { sha256: string }) => m.sha256,
    remove: async () => {},
  }),
}));
const askLocalMock = askLocal as jest.MockedFunction<typeof askLocal>;
const localModelStateMock = localModelState as jest.MockedFunction<typeof localModelState>;
const phoneModel = (phase: 'ready' | 'unsupported') => localModelStateMock.mockResolvedValue({ phase } as Awaited<ReturnType<typeof localModelState>>);

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

// This suite drives the typed grow path: a typed point under an X post plus the writer landing
// the same drafts. (An empty field over a readable post grounds reply cards instead.)
const TYPED = 'My take: shipping one small fix beats more polishing.';
const capture = (over: Partial<Capture> = {}): Capture => ({
  conversation: `Dana Lee @danabuilds · 2h\n${POST}`, written: POST, nodes: X_NODES, fieldTop: 900, typed: TYPED,
  app: 'com.twitter.android', label: 'X', at: 0, id: 'tap-x', hasField: true, ...over,
});

const open = async (value: Capture, drafts = DRAFTS, writer: Writer = { write: async (_request: DraftRequest, on: WriterEvents = {}) => {
    await new Promise(resolve => setTimeout(resolve, 1));
    drafts.forEach((text, slot) => on.landed?.(text, slot));
    return { drafts: [...drafts] };
  } }) => {
  native.capture.mockResolvedValue(value);
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Panel writer={writer} />
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
  // Yours carries a bare "Not sure" bar; the flagged draft carries the bottom level and its findings.
  await waitFor(() => expect(screen.getAllByTestId('fit-bar')).toHaveLength(2));
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

  test('after a ChatGPT failure the phone-written drafts are judged on the phone, and the typed reply too', async () => {
    const failing: Writer = { write: async () => { throw new Error('ChatGPT could not answer.'); } };
    const phone: Writer = { write: async (_request, on) => { CLEAN.forEach((text, slot) => on?.landed?.(text, slot)); return { drafts: [...CLEAN] }; } };
    const spy = jest.spyOn(FitModule, 'judgeFit').mockImplementation(async o => o.candidates.map(() => fit({ level: 2, words: LEVELS[2] })));
    phoneModel('ready');
    askLocalMock.mockResolvedValue('');
    try {
      const screen = await open(capture(), CLEAN, { write: (request, on) => withPhoneFallback(failing, phone, request, cloudWords('chatgpt'), on, undefined, 'ready') });
      await waitFor(() => expect(screen.getAllByTestId('fit-bar')).toHaveLength(CLEAN.length + 1));
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0].candidates).toEqual([TYPED, ...CLEAN]);
      expect(spy.mock.calls[0][0].backends.map(backend => backend.name)).toEqual(['phone']);
      expect(spy.mock.calls[0][0].voice).toBe(false);
      expect(screen.getAllByLabelText(LEVELS[2])).toHaveLength(CLEAN.length + 1);
      expect(screen.queryAllByLabelText(UNSURE)).toHaveLength(0);
    } finally { spy.mockRestore(); askLocalMock.mockReset(); phoneModel('unsupported'); }
  });

  test('a phone write that fails after landing a draft still judges that draft on the phone', async () => {
    const failing: Writer = { write: async () => { throw new Error('ChatGPT could not answer.'); } };
    const phone: Writer = { write: async (_request, on) => { on?.landed?.(CLEAN[0], 0); throw new Error('phone model stopped'); } };
    const spy = jest.spyOn(FitModule, 'judgeFit').mockImplementation(async o => o.candidates.map(() => fit({ level: 2, words: LEVELS[2] })));
    phoneModel('ready');
    try {
      await open(capture(), CLEAN, { write: (request, on) => withPhoneFallback(failing, phone, request, cloudWords('chatgpt'), on, undefined, 'ready') });
      await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
      expect(spy.mock.calls[0][0].candidates).toEqual([TYPED, CLEAN[0]]);
      expect(spy.mock.calls[0][0].backends.map(backend => backend.name)).toEqual(['phone']);
    } finally { spy.mockRestore(); phoneModel('unsupported'); }
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

  const own = { conversation: '', written: '', nodes: [], fieldTop: null, typed: 'Shipped offline saving today after a month of flaky sync.' };
  const versions = ['Shipped offline saving today. A month of flaky sync taught me to test with the network off.', 'Offline saving is live. What broke first for you when you added it?'];
  test.each([['com.twitter.android', 'X'], ['com.reddit.frontpage', 'Reddit']])('their own new post and its versions on %s carry the fit bar, rated as a post', async (app, place) => {
    const spy = jest.spyOn(FitModule, 'judgeFit').mockResolvedValue([fit({ level: 1, words: LEVELS[1] }), fit({ level: 3, words: LEVELS[3] }), fit({ level: 2, words: LEVELS[2] })]);
    try {
      const screen = await open(capture({ ...own, app, label: place }), versions);
      await waitFor(() => expect(screen.getAllByTestId('fit-bar')).toHaveLength(3));
      expect(spy.mock.calls[0][0]).toMatchObject({ kind: 'post', post: '', candidates: [own.typed, ...versions], platform: { id: place.toLowerCase() } });
      // Yours first, then each version: one level per card, never a second engagement verdict.
      for (const word of LEVELS.slice(1)) expect(screen.getAllByLabelText(word)).toHaveLength(1);
      expect(screen.queryAllByLabelText(/^Engagement on /)).toEqual([]);
    } finally { spy.mockRestore(); }
  });

  test('LinkedIn has no post rubric yet, so its own posts keep the text checks alone', async () => {
    const spy = jest.spyOn(FitModule, 'judgeFit');
    try {
      const screen = await open(capture({ ...own, app: 'com.linkedin.android', label: 'LinkedIn' }), versions);
      expect(spy).not.toHaveBeenCalled();
      expect(screen.queryByTestId('fit-bar')).toBeNull();
    } finally { spy.mockRestore(); }
  });

  test('a typed reply still gets its fit read when the writer fails', async () => {
    // The 2026-10-01 failure: the writer failed and the panel showed only its fallback, no fit read.
    const spy = jest.spyOn(FitModule, 'judgeFit');
    try {
      native.capture.mockResolvedValue(capture());
      const screen = await render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
          <Panel writer={{ write: async () => { throw new Error('no writer'); } }} />
        </SafeAreaProvider>);
      await waitFor(() => expect(screen.getAllByTestId('fit-bar').length).toBeGreaterThan(0));
      expect(screen.getAllByLabelText(UNSURE).length).toBeGreaterThan(0);
    } finally { spy.mockRestore(); }
  });

  test('a card the fit cannot judge still shows the plain unsure read', async () => {
    const spy = jest.spyOn(FitModule, 'judgeFit');
    try {
      const screen = await open(capture(), ['Purple turbines whisper banana logistics.']);
      await waitFor(() => expect(spy).toHaveBeenCalled());
      await act(async () => { await spy.mock.results[0].value; });
      // Every grow card carries an honest fit read: a bare "Not sure" bar when nothing was judged.
      expect(screen.getAllByTestId('fit-bar').length).toBeGreaterThan(0);
      expect(screen.getAllByLabelText(UNSURE).length).toBeGreaterThan(0);
    } finally { spy.mockRestore(); }
  });

  // The phone wrote every card and nothing leaves the phone, so the on-device model answers the rubric.
  const levelReply = (count: number, level: number) => Object.fromEntries(Array.from({ length: count }, (_, i) =>
    [`fit_${i}`, { probabilities: Object.fromEntries(LEVELS.map((_, k) => [String(k), k === level ? 0.7 : 0.1])) }]));
  const onPhone = async () => {
    native.capture.mockResolvedValue(capture());
    return render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <Panel select={async () => ({ writer: phoneWriter, note: null })} />
      </SafeAreaProvider>);
  };

  const writesAll = () => jest.spyOn(phoneWriter, 'write').mockImplementation(async (_request, on) => {
    CLEAN.forEach((text, slot) => on?.landed?.(text, slot));
    return { drafts: [...CLEAN] };
  });

  test('on the phone writer the fit shows its level from a fenced model reply', async () => {
    const phone = writesAll();
    phoneModel('ready');
    // The model wraps its JSON in a fence, as small local models often do.
    askLocalMock.mockImplementation(prompt => prompt.includes('An X reply.')
      ? Promise.resolve('```json\n' + JSON.stringify(levelReply(CLEAN.length + 1, 2)) + '\n```')
      : Promise.resolve(''));
    try {
      const screen = await onPhone();
      await waitFor(() => expect(screen.getAllByLabelText(LEVELS[2])).toHaveLength(CLEAN.length + 1));
      expect(screen.queryAllByLabelText(UNSURE)).toHaveLength(0);
    } finally { phone.mockRestore(); askLocalMock.mockReset(); phoneModel('unsupported'); }
  });

  test('on the phone writer a model that cannot answer still says not sure, plainly', async () => {
    const phone = writesAll();
    phoneModel('ready');
    askLocalMock.mockRejectedValue(new Error('model stopped'));
    try {
      const screen = await onPhone();
      await waitFor(() => expect(screen.getAllByLabelText(UNSURE)).toHaveLength(CLEAN.length + 1));
      expect(screen.getAllByText(new RegExp(words.fitWhyUnsure))).toHaveLength(CLEAN.length + 1);
    } finally { phone.mockRestore(); askLocalMock.mockReset(); phoneModel('unsupported'); }
  });

  test('on a phone that cannot write the fit abstains at once without asking the model', async () => {
    const phone = writesAll();
    askLocalMock.mockResolvedValue('');
    try {
      const screen = await onPhone();
      await waitFor(() => expect(screen.getAllByLabelText(UNSURE)).toHaveLength(CLEAN.length + 1));
      expect(askLocalMock.mock.calls.some(([prompt]) => String(prompt).includes('An X reply.'))).toBe(false);
    } finally { phone.mockRestore(); askLocalMock.mockReset(); }
  });

  test('a fit left over from a replaced capture never asks the model', async () => {
    const phone = writesAll();
    const readyChecks: Array<() => void> = [];
    localModelStateMock.mockImplementation(() => new Promise(resolve => {
      readyChecks.push(() => resolve({ phase: 'ready' } as Awaited<ReturnType<typeof localModelState>>));
    }));
    const prompts: string[] = [];
    askLocalMock.mockImplementation(async prompt => { prompts.push(String(prompt)); return ''; });
    try {
      const screen = await onPhone();
      await waitFor(() => expect(readyChecks.length).toBeGreaterThan(0));
      screen.unmount();
      readyChecks.forEach(ready => ready());
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(prompts).toEqual([]);
    } finally { phone.mockRestore(); askLocalMock.mockReset(); phoneModel('unsupported'); }
  });

  test('on the phone writer the fit rates once a pending tone call settles, through the real on-device queue', async () => {
    let release!: () => void;
    const toneGate = new Promise<void>(resolve => { release = resolve; });
    const llama = fakeLlama({ reply: async p => {
      if (String(p.messages.at(-1)?.content ?? '').includes('An X reply.')) return JSON.stringify(levelReply(CLEAN.length + 1, 2));
      await toneGate;
      return '';
    } });
    (initLlama as jest.Mock).mockImplementation(llama.initLlama);
    askLocalMock.mockImplementation(jest.requireActual<typeof import('../../core/localModel')>('../../core/localModel').askLocal);
    const phone = writesAll();
    phoneModel('ready');
    try {
      const screen = await onPhone();
      await waitFor(() => expect(llama.contexts.flatMap(context => context.completions)).toHaveLength(1));
      expect(screen.queryAllByLabelText(LEVELS[2])).toHaveLength(0);
      release();
      await waitFor(() => expect(screen.getAllByLabelText(LEVELS[2])).toHaveLength(CLEAN.length + 1));
      expect(screen.queryAllByLabelText(UNSURE)).toHaveLength(0);
    } finally { phone.mockRestore(); askLocalMock.mockReset(); phoneModel('unsupported'); }
  });
});

test.each([['com.whatsapp', 'WhatsApp'], ['dev.ownvoice.app', 'Ownvoice']])('%s cards carry no engagement rating', async (app, label) => {
  const screen = await open(capture({ app, label, nodes: [], fieldTop: null }));
  expect(ratingsOf(screen)).toEqual([]);
  expect(JSON.stringify(screen.toJSON())).not.toContain('Stock wording');
});

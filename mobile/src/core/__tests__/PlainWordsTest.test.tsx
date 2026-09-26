import { ERROR_CODES, message } from '../nano';
import { words, CHATGPT_TERMS, technicalWords } from '../words';
import { offeredApps } from '../onboarding';
import React from 'react';
const renderToStaticMarkup: (element: React.ReactElement) => string = require('react-dom/server').renderToStaticMarkup;
import Home from '../../../app/index';
import Panel from '../../panel/Panel';
import { stubWriter, type StubOptions } from '../../panel/stubWriter';
import * as Slop from '../slop';
import * as Judge from '../judge';
import * as Privacy from '../privacy';
import { CHATGPT_OFF } from '../switch';
import Native, { type Capture } from '../../../modules/ownvoice-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  addListener: jest.fn(() => ({ remove: () => {} })),
  capture: jest.fn(), serviceState: jest.fn(async () => 'on'), insert: jest.fn(), copy: jest.fn(),
  modelStatus: jest.fn(async () => 'unavailable'), ask: jest.fn(), closePanel: jest.fn(),
} }));

const native = Native as jest.Mocked<typeof Native>;

// The banned patterns grow here: no number may show either (look spec 4.3 and 6 E11).
const assertPlain = (shown: string[]) => { expect(shown.length).toBeGreaterThan(0); expect(shown.filter(x => technicalWords.test(x))).toEqual([]); };

const SAM = 'Sam: Are we still on for Saturday?\nSam: I can bring the tent if you bring the stove.';
const LIST = 'i can bring the stove, 4 chairs\n1. I will bring the stove.\n2. You can bring the tent.';
const fixture = (over: { typed?: string; written?: string; hasField?: boolean } = {}): Capture =>
  ({ conversation: over.written ?? SAM, written: over.written ?? SAM, nodes: [], fieldTop: null, typed: over.typed ?? '', app: 'dev.ownvoice.app', label: 'Ownvoice', at: 0, hasField: over.hasField ?? true });

const renderPanel = async (writer: ReturnType<typeof stubWriter>, over: { typed?: string; written?: string; hasField?: boolean; none?: boolean } = {}) => {
  native.capture.mockResolvedValue(over.none ? null : fixture(over));
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <Panel writer={writer} />
    </SafeAreaProvider>);
  await act(async () => { await Promise.resolve(); });
  return screen;
};

const visibleStrings = (screen: { toJSON: () => unknown }): string[] => {
  const strings: string[] = [];
  const walk = (node: unknown) => {
    if (node == null) return;
    if (typeof node === 'string') { strings.push(node); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node !== 'object') return;
    const item = node as Record<string, unknown>;
    if (Array.isArray(item.children)) item.children.forEach(walk);
  };
  walk(screen.toJSON());
  return strings;
};

test('errorMessages', () => { const msgs = [...ERROR_CODES, -1].map(message); expect(message(9)).toBe(words.busy); expect(message(27)).toBe(words.batteryQuota); expect(message(30)).toBe(words.backgroundBlocked); expect(message(501)).toBe(words.noSpace); expect(message(12)).toBe(words.requestTooLarge); expect(message(16)).toBe(words.unsupported); expect(message(604)).toBe(words.systemUpdate); assertPlain([...msgs, words.unsupported, words.gettingReady]); });
test('checksAndVerdicts', () => { const keys = ['SPECIFIC', 'CLEAR', 'VOICE', 'FITS', 'CLAIMS', 'ANSWERS', 'NEXT_STEP', 'CONVERSATION', 'NOT_INTERESTED', 'HOOK']; const shown = [Judge.GENERAL, Judge.WRITE_FIRST, Judge.quickChecks(null), Judge.quickChecks('Sam')]; for (const verdict of ['pass', 'concern']) for (const msg of [true, false]) for (const who of [null, 'Sam']) for (const generic of [0, 5, 10]) for (const draft of ['Saturday works.', 'Read this https://example.com ' + 'x'.repeat(300), "Let's circle back — who's in?"]) { const answer = `GENERIC: ${generic}\nSPECIFICITY: ${10 - generic}\n` + keys.map(k => `${k}: ${verdict}`).join('\n'); const s = Judge.scoreDraft(draft, answer, msg, { never: ['circle back'], noDashes: true, statementEndings: true, note: '' }, true, who); shown.push(...[...s.quality, ...s.reach].flatMap(x => [x.name, x.reason]), Judge.verdict(s).lead + Judge.verdict(s).rest); } for (const a of ['MEANING: pass', 'MEANING: concern - drops the date']) { const c = Judge.meaning('See you at 5', 'See you then', a); if (c) shown.push(c.name, c.reason); } const c = Judge.meaning('See you then', 'See you at 4', null); if (c) shown.push(c.name, c.reason); shown.push('Shorter', 'More like you', 'Start with a detail', 'Cleaned up'); assertPlain(shown); });
test('markedPhrases', () => { const text = "Here's a reply: Great post! Let's delve in. It's not just fast, but fun — quick, simple, and fun. #one #two 😀😀😀 What do you think?"; const reasons = [...Slop.hits(text, { ...Slop.NO_RULES, noDashes: true }, true).map(h => h.reason), ...Slop.hits('Is it on?', { ...Slop.NO_RULES, statementEndings: true }, true).map(h => h.reason)]; assertPlain([...new Set([...reasons, ...Array.from({ length: 101 }, (_, i) => Slop.words(i))])]); });
test('readLog', () => { const shown = (['REPLY', 'COMPOSE', 'EMPTY'] as Judge.Mode[]).flatMap(mode => [['', ''], ['chat', ''], ['', 'hi'], ['chat', 'hi']].map(([c, t]) => Privacy.summary(mode, c, t))).concat(['Reply drafts. 117 characters on screen, 0 in your field.', 'Compose boost. 0 characters on screen, 12 in your field.', 'Nothing to work on. 0 characters on screen, 0 in your field.'].map(Privacy.plain)); assertPlain(shown); });
test('displayedHomeCopy', () => { const html = renderToStaticMarkup(React.createElement(Home)); expect(html).toContain(words.home); assertPlain([html.replace(/<[^>]*>/g, ''), ...Object.values(words)]); });
test('offeredApps', () => { assertPlain(offeredApps(() => true).map(x => x[1])); });
test('switchMessage', () => assertPlain([CHATGPT_OFF, CHATGPT_TERMS]));
test('catchesATechnicalWord', () => { for (const bad of ['Scored by the judge', 'Slop: clean (10/100)', 'The on-device model is ready (nano-v3).', '117 characters on screen', 'Update AICore', 'Gemini Nano', 'Gemma', 'Done in 42%', '78 percent ready', '(500) something broke']) expect(technicalWords.test(bad)).toBe(true); for (const fine of ['Sounds natural and answers Sam', 'Getting Ownvoice ready… this happens once.', 'A bit stock']) expect(technicalWords.test(fine)).toBe(false); });

// The panel speaks in plain words in every state (spec 4.3: render it with a stub writer and scan the markup).
describe('panel copy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    native.capture.mockReset();
    native.ask.mockReset();
    native.serviceState.mockReset().mockResolvedValue('on');
    native.modelStatus.mockReset().mockResolvedValue('unavailable');
  });

  test.each<[string, StubOptions, { typed?: string; written?: string; hasField?: boolean }]>([
    ['reply-ready', {}, {}],
    ['polish-ready', {}, { typed: LIST }],
    ['compose-ready', {}, { typed: 'i can bring the stove, super excited', written: '' }],
    ['empty', {}, { typed: '', written: '' }],
    ['writing', { delay: 150 }, {}],
    ['download-progress', { download: true, delay: 150 }, {}],
  ])('%s speaks plainly', async (_name, options, over) => {
    const screen = await renderPanel(stubWriter(options), over);
    const shown = visibleStrings(screen);
    expect(shown.length).toBeGreaterThan(0);
    assertPlain([...shown, ...Object.values(words)]);
  });

  test('compose cards use post checks even before a model answer', async () => {
    const screen = await renderPanel(stubWriter(), { typed: 'Read https://example.com', written: '' });
    fireEvent.press((await screen.findAllByRole('button', { name: words.why }))[0]);
    await waitFor(() => expect(visibleStrings(screen)).toContain('Links can mean fewer views'));
  });

  test('compose keeps post checks with a model answer on a quiet screen', async () => {
    native.modelStatus.mockResolvedValue('available');
    native.ask.mockResolvedValueOnce('GENERIC: 2\nSPECIFICITY: 8\nSPECIFIC: pass\nCLEAR: pass\nVOICE: pass\nFITS: pass\nCLAIMS: pass\nCONVERSATION: concern - needs a question\nNOT_INTERESTED: pass\nHOOK: concern - start with the result').mockResolvedValueOnce('MEANING: pass');
    const screen = await renderPanel(stubWriter(), { typed: 'Shipped the fix today', written: '' });
    fireEvent.press((await screen.findAllByRole('button', { name: words.why }))[0]);
    await waitFor(() => expect(visibleStrings(screen)).toContain('Weak first line'));
    expect(visibleStrings(screen)).not.toContain('Answers the question');
    expect(native.ask).toHaveBeenCalledTimes(2);
  });

  test('Why hides technical model reasons in both draft and meaning checks', async () => {
    native.modelStatus.mockResolvedValue('available');
    native.ask.mockResolvedValueOnce('MESSAGE').mockResolvedValueOnce('GENERIC: 2\nSPECIFICITY: 8\nSPECIFIC: pass\nCLEAR: pass\nVOICE: concern - The model token limit was low\nFITS: pass\nCLAIMS: pass\nANSWERS: concern - The model token limit was low\nNEXT_STEP: pass').mockResolvedValueOnce('MEANING: concern - The model token limit was low');
    const screen = await renderPanel(stubWriter(), { typed: 'hello there' });
    fireEvent.press((await screen.findAllByRole('button', { name: words.why }))[0]);
    await waitFor(() => expect(visibleStrings(screen)).toContain('It may change what you meant.'));
    const shown = visibleStrings(screen);
    expect(shown).toContain("Doesn't sound like you.");
    expect(shown).toContain("Doesn't answer Sam.");
    expect(shown.join(' ')).not.toContain('The model token limit was low');
    assertPlain(shown);
  });

  test.each([['unclear kind', ['not sure'], 1], ['unreadable checks', ['MESSAGE', 'looks fine'], 2]] as const)('%s keeps quick checks when the model cannot answer', async (_name, answers, calls) => {
    native.modelStatus.mockResolvedValue('available');
    for (const answer of answers) native.ask.mockResolvedValueOnce(answer);
    const screen = await renderPanel(stubWriter());
    const button = (await screen.findAllByRole('button', { name: words.why }))[0];
    await act(async () => { fireEvent.press(button); await Promise.resolve(); });
    await waitFor(() => expect(visibleStrings(screen)).toContain(words.noChecks));
    expect(native.ask).toHaveBeenCalledTimes(calls);
  });

  test('no capture shows only its own line', async () => {
    const screen = await renderPanel(stubWriter(), { none: true });
    await waitFor(() => expect(JSON.stringify(screen.toJSON())).toContain(words.noCapture));
    const text = JSON.stringify(screen.toJSON());
    expect(text).not.toContain(words.noField);
    expect(text).not.toContain(words.readyReply);
  });

  test('a phone that cannot write shows only the plain line, not the insert hint', async () => {
    const screen = await renderPanel(stubWriter({ fail: true }), { hasField: false });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 280)); });
    await waitFor(() => expect(JSON.stringify(screen.toJSON())).toContain(words.unsupported));
    const text = JSON.stringify(screen.toJSON());
    expect(text).not.toContain(words.noField);
    expect(text).not.toContain(words.gettingReady);
  });

  test('the Dot sits in the header in every state', async () => {
    for (const options of [{}, { fail: true }, { empty: true }, { download: true, delay: 150 }] as StubOptions[]) {
      const screen = await renderPanel(stubWriter(options), options.empty ? { typed: '', written: '' } : {});
      await waitFor(() => expect(JSON.stringify(screen.toJSON())).toContain('RNSVGSvgView'));
    }
  });

  test('two rapid insert taps make one native request', async () => {
    let settle!: (value: 'on') => void;
    native.serviceState.mockImplementation(() => new Promise(resolve => { settle = resolve; }));
    const screen = await renderPanel(stubWriter());
    const button = (await screen.findAllByRole('button', { name: words.insert }))[0];
    fireEvent.press(button);
    fireEvent.press(button);
    await act(async () => { settle('on'); await Promise.resolve(); });
    expect(native.serviceState).toHaveBeenCalledTimes(1);
    expect(native.insert).toHaveBeenCalledTimes(1);
  });
});

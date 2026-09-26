import { AppState } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import Home from '../index';
import Apps from '../apps';
import Voice, { foundLines } from '../voice';
import Reads from '../reads';
import Native, { type TapFact } from '../../modules/ownvoice-native';
import { words } from '../../src/core/words';
import { readLog } from '../../src/core/readLog';
import { loadVoice } from '../../src/core/voice';

jest.mock('../../modules/ownvoice-native', () => ({
  __esModule: true,
  default: {
    serviceState: jest.fn(), turnOff: jest.fn(), modelStatus: jest.fn(), downloadModel: jest.fn(),
    bubbleRules: jest.fn(), setBubbleRules: jest.fn(), launcherApps: jest.fn(), takeTapFacts: jest.fn(),
    clearTapFacts: jest.fn(), forget: jest.fn(), addListener: jest.fn(),
  },
}));

jest.mock('expo-file-system', () => ({ File: { pickFileAsync: jest.fn() } }));

const native = Native as jest.Mocked<typeof Native>;
const picker = jest.requireMock('expo-file-system').File as { pickFileAsync: jest.Mock };
const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;
const show = async (element: React.ReactElement) => render(element);

const rules = { paused: false, on: ['com.netflix.netflix'], off: ['com.google.android.gm'] };
const apps = [
  { app: 'com.whatsapp', label: 'WhatsApp', icon: null },
  { app: 'com.google.android.gm', label: 'Gmail', icon: null },
  { app: 'com.netflix.netflix', label: 'Netflix', icon: null },
  { app: 'com.android.chrome', label: 'Chrome', icon: null },
];
const fact = (over: Partial<TapFact> = {}): TapFact => ({ at: Date.now(), app: 'com.whatsapp', label: 'WhatsApp', screen: true, typed: false, replying: true, ...over });

beforeEach(() => {
  kv.clear();
  kv.set('setup-done', '"done"');
  jest.clearAllMocks();
  native.serviceState.mockResolvedValue('on');
  native.modelStatus.mockResolvedValue('available');
  native.bubbleRules.mockResolvedValue(rules);
  native.setBubbleRules.mockResolvedValue(undefined);
  native.launcherApps.mockResolvedValue(apps);
  native.takeTapFacts.mockResolvedValue([]);
  native.clearTapFacts.mockResolvedValue(undefined);
  native.forget.mockResolvedValue(undefined);
  native.turnOff.mockResolvedValue(undefined);
  native.downloadModel.mockResolvedValue(undefined);
  (native.addListener as jest.Mock).mockReturnValue({ remove: () => {} });
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: () => {} });
  picker.pickFileAsync.mockRejectedValue(new Error('no picker in jest'));
});

const homeCopy = async () => {
  const screen = await show(<Home />);
  await screen.findByText(words.statusReady);
  return screen;
};

// ---- H1: the status card ----
test('the card says off, with the switch waiting for the permission screen', async () => {
  native.serviceState.mockResolvedValue('off');
  const screen = await show(<Home />);
  expect(await screen.findByText(words.statusOff)).toBeTruthy();
  expect(screen.getByText(words.statusOffNote)).toBeTruthy();
  fireEvent.press(screen.getByLabelText(words.powerRow));
  expect(native.turnOff).not.toHaveBeenCalled();
  expect(screen.getByLabelText(words.powerRow)).toBeTruthy();
});

test('the card gets ready with a bar, never a number', async () => {
  native.modelStatus.mockResolvedValue('downloading');
  const screen = await show(<Home />);
  expect(await screen.findByText(words.statusGettingReady)).toBeTruthy();
  expect(screen.getByText(words.gettingReady)).toBeTruthy();
  expect(screen.toJSON()).not.toContain('%');
});

test('a phone that cannot write offers Try again in plain words', async () => {
  native.modelStatus.mockResolvedValue('unavailable');
  const screen = await show(<Home />);
  expect(await screen.findByText(words.statusNotReady)).toBeTruthy();
  expect(screen.getByText(words.unsupported)).toBeTruthy();
  fireEvent.press(screen.getByText(words.tryAgain));
  await waitFor(() => expect(native.downloadModel).toHaveBeenCalled());
});

test('the card pauses, and the switch hides the bubble everywhere', async () => {
  const screen = await homeCopy();
  await act(async () => { fireEvent(screen.getByLabelText(words.powerRow), 'valueChange', false); });
  expect(native.turnOff).toHaveBeenCalled();
  fireEvent.press(screen.getByText(words.rowPause));
  await waitFor(() => expect(native.setBubbleRules).toHaveBeenCalledWith({ ...rules, paused: true }));
});

test('a dropped service asks to be turned back on', async () => {
  native.serviceState.mockResolvedValue('stuck');
  const screen = await show(<Home />);
  expect(await screen.findByText(words.turnBackOn)).toBeTruthy();
});

// ---- H2: the rows ----
test('the rows say where it shows, how many phrases and what it read this week', async () => {
  kv.set('voice', JSON.stringify({ never: ['delve', 'circle back'], noDashes: false, statementEndings: false, note: '' }));
  kv.set('reads', JSON.stringify([
    { time: Date.now() - 3600_000, app: 'com.whatsapp', label: 'WhatsApp', summary: 'Suggested replies. Read the chat on screen.' },
    { time: Date.now() - 7200_000, app: 'com.whatsapp', label: 'WhatsApp', summary: 'Suggested replies. Read the chat on screen.' },
  ]));
  const screen = await homeCopy();
  expect(screen.getByText('WhatsApp and Netflix')).toBeTruthy();   // chosen app plus one default, Gmail switched off
  expect(screen.getByText('2 phrases you never say')).toBeTruthy();
  expect(screen.getByText('2 times this week')).toBeTruthy();
  expect(screen.getByText(words.rowRewriteNote)).toBeTruthy();
});

test('one phrase and one read read as one', async () => {
  kv.set('voice', JSON.stringify({ never: ['delve'], noDashes: false, statementEndings: false, note: '' }));
  kv.set('reads', JSON.stringify([{ time: Date.now() - 3600_000, app: 'a', label: 'A', summary: 'Suggested replies. Nothing was on screen.' }]));
  const screen = await homeCopy();
  expect(screen.getByText('1 phrase you never say')).toBeTruthy();
  expect(screen.getByText(words.onceWeek)).toBeTruthy();
});

test('a fresh phone has nothing to show yet', async () => {
  native.launcherApps.mockResolvedValue([]);
  const screen = await homeCopy();
  expect(screen.getByText(words.noApps)).toBeTruthy();
  expect(screen.getByText(words.noPhrases)).toBeTruthy();
  expect(screen.getByText(words.nothingWeek)).toBeTruthy();
});

test('the rows come back fresh whenever the app is in front', async () => {
  let shown: ((state: string) => void) | null = null;
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, cb) => { shown = cb as never; return { remove: () => {} }; });
  const screen = await homeCopy();
  expect(screen.getByText(words.nothingWeek)).toBeTruthy();
  kv.set('reads', JSON.stringify([{ time: Date.now() - 3600_000, app: 'a', label: 'A', summary: 'Suggested replies. Nothing was on screen.' }]));
  await act(async () => { shown!('active'); });
  await waitFor(() => expect(screen.getByText(words.onceWeek)).toBeTruthy());
  screen.unmount();
  spy.mockRestore();
});

// ---- H3: Where the bubble shows ----
test('the app list is on-apps first, keeps the note, and saves a switch', async () => {
  const screen = await show(<Apps />);
  expect(await screen.findByText(words.appsScreenNote)).toBeTruthy();
  const text = JSON.stringify(screen.toJSON());
  const at = (name: string) => text.indexOf(`"${name}"`);
  expect(Math.min(at('Netflix'), at('WhatsApp'))).toBeLessThan(at('Chrome'));   // chosen and default apps before the rest
  expect(at('Gmail')).toBeGreaterThan(at('Chrome'));
  fireEvent.press(screen.getByText('Gmail'));
  await waitFor(() => expect(native.setBubbleRules).toHaveBeenCalledWith(expect.objectContaining({ on: expect.arrayContaining(['com.google.android.gm']), off: [] })));
});

test('the list narrows as you type', async () => {
  const screen = await show(<Apps />);
  await screen.findByText('WhatsApp');
  fireEvent.changeText(screen.getByLabelText(words.findAnApp), 'chro');
  await waitFor(() => expect(screen.queryByText('WhatsApp')).toBeNull());
  expect(screen.getByText('Chrome')).toBeTruthy();
});

// ---- H4: Your voice ----
test('an import previews what it found before adding anything', async () => {
  picker.pickFileAsync.mockResolvedValue({ canceled: false, result: { text: async () => '# Never say\n- "delve"\n- "circle back"\n\nNo em dashes anywhere.\n' } });
  const screen = await show(<Voice />);
  fireEvent.press(screen.getByText(words.importFile));
  expect(await screen.findByText(/Found in the file:/)).toBeTruthy();
  expect(screen.getByText(/“delve”, “circle back”/)).toBeTruthy();
  expect(screen.getByText(/Nothing else in the file is kept/)).toBeTruthy();
  expect(loadVoice().never).toEqual([]);                                     // nothing saved until Add these
  fireEvent.press(screen.getByText(words.addThese));
  await waitFor(() => expect(loadVoice().never).toEqual(['delve', 'circle back']));
  expect(screen.getByText(words.added)).toBeTruthy();
});

test('a file with nothing to add says so', async () => {
  picker.pickFileAsync.mockResolvedValue({ canceled: false, result: { text: async () => 'just a paragraph' } });
  const screen = await show(<Voice />);
  fireEvent.press(screen.getByText(words.importFile));
  expect(await screen.findByText(words.foundNothing)).toBeTruthy();
  expect(screen.queryByText(words.addThese)).toBeNull();
});

test('an unreadable file says so', async () => {
  picker.pickFileAsync.mockResolvedValue({ canceled: false, result: { text: async () => { throw new Error('gone'); } } });
  const screen = await show(<Voice />);
  fireEvent.press(screen.getByText(words.importFile));
  expect(await screen.findByText(words.cantOpen)).toBeTruthy();
});

test('a cancelled pick leaves the screen alone', async () => {
  picker.pickFileAsync.mockResolvedValue({ canceled: true, result: null });
  const screen = await show(<Voice />);
  fireEvent.press(screen.getByText(words.importFile));
  await waitFor(() => expect(picker.pickFileAsync).toHaveBeenCalled());
  expect(screen.queryByText(words.foundNothing)).toBeNull();
});

test('the rules, the note and the never-say list all save', async () => {
  const screen = await show(<Voice />);
  await act(async () => { fireEvent.press(screen.getByText(words.ruleDashes)); });
  await act(async () => { fireEvent.changeText(screen.getByLabelText(words.howIWrite), 'short sentences'); });
  await act(async () => { fireEvent.changeText(screen.getByLabelText(words.neverSay), 'delve\ncircle back\n'); });
  await waitFor(() => expect(loadVoice()).toEqual({ never: ['delve', 'circle back'], noDashes: true, statementEndings: false, note: 'short sentences' }));
  expect(screen.getByText(words.neverSayHelp)).toBeTruthy();
  expect(screen.getByText(words.wipeElsewhere)).toBeTruthy();
});

test('an import preview reads in plain words, both skipped counts', () => {
  expect(foundLines({ never: ['delve'], noDashes: true, statementEndings: false, skipped: 0 }))
    .toBe('Found in the file:\nNever say (1): “delve”\nRule: No long dashes (—)\nNothing else in the file is kept. Add these to Your voice?');
  expect(foundLines({ never: [], noDashes: false, statementEndings: true, skipped: 1 })).toContain(SKIP_ONE);
  expect(foundLines({ never: [], noDashes: false, statementEndings: true, skipped: 3 })).toContain('Left out 3 notes that read as advice, not phrases.');
});
const SKIP_ONE = 'Left out 1 note that reads as advice, not a phrase.';

// ---- H5: What Ownvoice read ----
test('a tap is logged with the app and the time, and never any text', async () => {
  native.takeTapFacts.mockResolvedValue([fact()]);
  const screen = await show(<Reads />);
  await waitFor(() => expect(readLog().length).toBe(1));
  expect(screen.getByText('Suggested replies in WhatsApp')).toBeTruthy();
  expect(screen.getByText(/Read the chat on screen · Today, /)).toBeTruthy();
  expect(JSON.stringify(kv.get('reads'))).not.toMatch(/Sam|tent|stove/i);
});

test('an empty log says so in plain words', async () => {
  const screen = await show(<Reads />);
  expect(screen.getByText(words.nothingRead)).toBeTruthy();
  expect(screen.getByText(words.wipeVoiceNote)).toBeTruthy();
});

test('Wipe everything clears the log, Your voice and what is held in memory', async () => {
  native.takeTapFacts.mockResolvedValue([fact()]);
  const screen = await show(<Reads />);
  await waitFor(() => expect(readLog().length).toBe(1));
  expect(screen.getByText('Suggested replies in WhatsApp')).toBeTruthy();
  kv.set('voice', JSON.stringify({ never: ['delve'], noDashes: true, statementEndings: true, note: '' }));
  fireEvent.press(screen.getByText(words.wipe));
  await waitFor(() => expect(screen.getByText(words.nothingRead)).toBeTruthy());
  expect(readLog()).toEqual([]);
  expect(loadVoice().never).toEqual([]);
  expect(native.forget).toHaveBeenCalled();
  expect(native.clearTapFacts).toHaveBeenCalled();
});

test('an entry older than 30 days has already gone', async () => {
  native.takeTapFacts.mockResolvedValue([]);
  kv.set('reads', JSON.stringify([{ time: Date.now() - 31 * 24 * 3600_000, app: 'a', label: 'A', summary: 'Suggested replies. Nothing was on screen.' }]));
  const screen = await show(<Reads />);
  expect(screen.getByText(words.nothingRead)).toBeTruthy();
});

import { AppState } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import Home from '../index';
import Apps from '../apps';
import Voice, { foundLines, toggleStyle } from '../voice';
import Reads from '../reads';
import Source from '../source';
import { router } from 'expo-router';
import { session, nothing, type GptState } from '../../src/chatgpt/session';
import { AGREED_KEY } from '../../src/core/phoneDownload';
import { SOURCE_KEY, setSource, storedSource } from '../../src/core/source';
import Native, { type TapFact } from '../../modules/ownvoice-native';
import { words } from '../../src/core/words';
import { space } from '../../src/ui/theme';
import { readLog } from '../../src/core/readLog';
import { loadVoice } from '../../src/core/voiceStore';

jest.mock('../../modules/ownvoice-native', () => ({
  __esModule: true,
  default: {
    serviceState: jest.fn(), turnOff: jest.fn(), modelStatus: jest.fn(), downloadModel: jest.fn(), deleteModel: jest.fn(), cancelModelDownload: jest.fn(),
    bubbleRules: jest.fn(), setBubbleRules: jest.fn(), launcherApps: jest.fn(), takeTapFacts: jest.fn(),
    clearTapFacts: jest.fn(), forget: jest.fn(), addListener: jest.fn(), sharedMarkdown: jest.fn(), finishRewrite: jest.fn(),
    typingCheck: jest.fn(), setTypingCheck: jest.fn(),
  },
}));

jest.mock('expo-file-system', () => ({ File: { pickFileAsync: jest.fn() } }));
jest.mock('../../src/chatgpt/session', () => ({
  NAME: 'ChatGPT',
  GPT_APPS_KEY: 'chatgpt-apps',
  mocked: false,
  nothing: { signedIn: false, waiting: false, code: null, url: null, note: null, resting: null },
  sessionNow: jest.fn(() => ({ signedIn: false })),
  signOutGuard: jest.fn(() => ({ active: false, epoch: 0 })),
  session: { current: jest.fn(), start: jest.fn(), cancel: jest.fn(), signOut: jest.fn() },
}));
const gpt = session as jest.Mocked<typeof session>;
const connected: GptState = { ...nothing, signedIn: true, note: 'ChatGPT is connected.' };

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
let sequence = 0;
const fact = (over: Partial<TapFact> = {}): TapFact => ({ id: String(++sequence), at: Date.now(), app: 'com.whatsapp', label: 'WhatsApp', screen: true, typed: false, replying: true, sent: false, ...over });

beforeEach(() => {
  kv.clear();
  sequence = 0;
  kv.set('setup-done', '"done"');
  jest.clearAllMocks();
  for (const method of Object.values(native)) if (jest.isMockFunction(method)) method.mockReset();
  picker.pickFileAsync.mockReset();
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
  native.deleteModel.mockResolvedValue(undefined);
  native.typingCheck.mockResolvedValue(false);
  native.setTypingCheck.mockResolvedValue(undefined);
  (native.addListener as jest.Mock).mockReturnValue({ remove: () => {} });
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: () => {} });
  picker.pickFileAsync.mockRejectedValue(new Error('no picker in jest'));
  gpt.current.mockResolvedValue(nothing);
});

const homeCopy = async () => {
  const screen = await show(<Home />);
  await screen.findByText(words.statusReady);
  return screen;
};

test('Home places its title beneath the status bar inset', async () => {
  const screen = await render(<SafeAreaInsetsContext.Provider value={{ top: 32, bottom: 0, left: 0, right: 0 }}><Home /></SafeAreaInsetsContext.Provider>);
  const page = screen.toJSON() as unknown as { props: { contentContainerStyle: unknown } };
  expect(page.props.contentContainerStyle).toEqual(expect.arrayContaining([expect.objectContaining({ paddingTop: 32 + space.xl })]));
}, 10_000);

test('Home has no Try a writing task row outside lab builds', async () => {
  expect((await homeCopy()).queryByText(words.agentRow)).toBeNull();
});

test('in a lab build, Home\'s Try a writing task row opens the task screen', async () => {
  process.env.EXPO_PUBLIC_PHONE_AGENT = '1';
  try {
    const screen = await homeCopy();
    await fireEvent.press(screen.getByText(words.agentRow));
    expect(router.push).toHaveBeenCalledWith('/agent');
  } finally { delete process.env.EXPO_PUBLIC_PHONE_AGENT; }
});

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

test('off shows a Turn on button that opens the permission screen', async () => {
  native.serviceState.mockResolvedValue('off');
  const screen = await show(<Home />);
  await fireEvent.press(await screen.findByText(words.turnOn));
  expect(router.push).toHaveBeenCalledWith('/setup');
});

test('the card gets ready with a bar, never a number', async () => {
  native.modelStatus.mockResolvedValue('downloading');
  const screen = await show(<Home />);
  expect(await screen.findByText(words.statusGettingReady)).toBeTruthy();
  expect(screen.getByText(words.gettingReady)).toBeTruthy();
  expect(screen.toJSON()).not.toContain('%');
});

test('off hides Try again even when the model is not ready', async () => {
  native.serviceState.mockResolvedValue('off');
  native.modelStatus.mockResolvedValue('downloadable');
  const screen = await show(<Home />);
  expect(await screen.findByText(words.statusOff)).toBeTruthy();
  expect(screen.queryByText(words.tryAgain)).toBeNull();
  expect(native.downloadModel).not.toHaveBeenCalled();
});

test('a phone that cannot write asks how Ownvoice should write, never a dead end', async () => {
  native.modelStatus.mockResolvedValue('unavailable');
  kv.set(SOURCE_KEY, '"phone"');
  const screen = await show(<Home />);
  expect(await screen.findByText(words.needWriter)).toBeTruthy();
  expect(screen.getByText(words.needWriterNote)).toBeTruthy();
  expect(screen.getByText(words.rowSourceNone)).toBeTruthy();
  expect(JSON.stringify(screen.toJSON())).not.toContain(words.unsupported);
  expect(screen.queryByText(words.tryAgain)).toBeNull();
  // This phone was chosen but can't write any more: the choice goes back to not chosen.
  expect(storedSource()).toBeNull();
  await fireEvent.press(screen.getByText(words.gptButton));
  expect(router.push).toHaveBeenCalledWith('/source?start=chatgpt');
  expect(native.downloadModel).not.toHaveBeenCalled();
});

test('nothing chosen on a phone that can write offers the choice', async () => {
  setSource(null);
  const screen = await show(<Home />);
  expect(await screen.findByText(words.needWriter)).toBeTruthy();
  expect(screen.getByText(words.sourceNote)).toBeTruthy();
  await fireEvent.press(screen.getByText(words.continueLabel));
  expect(router.push).toHaveBeenCalledWith('/source');
});

test('Home says who writes, and one row leads to How Ownvoice writes', async () => {
  kv.set(SOURCE_KEY, '"phone"');
  const phone = await homeCopy();
  expect(phone.getByText(words.homePhone)).toBeTruthy();
  expect(phone.getByText(words.rowSourcePhone)).toBeTruthy();
  expect(phone.queryByText(words.gptButton)).toBeNull();
  await fireEvent.press(phone.getByText(words.rowSource));
  expect(router.push).toHaveBeenCalledWith('/source');
  await phone.unmount();
  kv.set(SOURCE_KEY, '"chatgpt"');
  gpt.current.mockResolvedValue(connected);
  const chatgpt = await homeCopy();
  expect(chatgpt.getByText(words.homeGpt)).toBeTruthy();
  expect(chatgpt.getByText(words.rowSourceGpt)).toBeTruthy();
});

test('ChatGPT chosen and connected on a phone that cannot write reads ready, never the old dead end', async () => {
  native.modelStatus.mockResolvedValue('unavailable');
  kv.set(SOURCE_KEY, '"chatgpt"');
  gpt.current.mockResolvedValue(connected);
  const screen = await show(<Home />);
  expect(await screen.findByText(words.statusReady)).toBeTruthy();
  expect(screen.getByText(words.statusReadyNote)).toBeTruthy();
  expect(screen.getByText(words.homeGpt)).toBeTruthy();
  expect(screen.getByText(words.rowSourceGpt)).toBeTruthy();
  const text = JSON.stringify(screen.toJSON());
  for (const gone of [words.unsupported, words.statusNotReady, words.tryAgain, words.gptButton]) expect(text).not.toContain(gone);
  expect(storedSource()).toBe('chatgpt');
});

test('ChatGPT chosen but signed out: the card asks to sign in again, and this phone writes until then', async () => {
  kv.set(SOURCE_KEY, '"chatgpt"');
  const screen = await show(<Home />);
  expect(await screen.findByText('ChatGPT needs you to sign in again.')).toBeTruthy();
  expect(screen.getByText(words.restingPhone)).toBeTruthy();
  await fireEvent.press(screen.getByText(words.gptButton));
  expect(router.push).toHaveBeenCalledWith('/source?start=chatgpt');
});

test('ChatGPT resting says so in its own words', async () => {
  kv.set(SOURCE_KEY, '"chatgpt"');
  gpt.current.mockResolvedValue({ ...connected, note: 'ChatGPT is resting until 3:40pm.', resting: 'ChatGPT is resting until 3:40pm.' });
  const screen = await show(<Home />);
  expect(await screen.findByText('ChatGPT is resting until 3:40pm.')).toBeTruthy();
  expect(screen.getByText(words.restingPhone)).toBeTruthy();
});

test.each([['writing'], ['chatgpt']])('the old %s page lands on How Ownvoice writes', async name => {
  const Moved = require(`../${name}`).default;
  const screen = await show(<Moved />);
  expect(screen.toJSON()).toMatchObject({ type: 'Redirect', props: { href: '/source' } });
});

test('a phone that needs its download asks first, with the size, and downloads nothing on its own', async () => {
  native.modelStatus.mockResolvedValue('downloadable');
  const screen = await show(<Home />);
  expect(await screen.findByText(words.readyTitle)).toBeTruthy();
  expect(screen.getByText(words.readyNote)).toBeTruthy();
  expect(screen.getByText(words.getReady)).toBeTruthy();
  expect(screen.queryByText(words.gettingReady)).toBeNull();
  expect(screen.queryByText(words.tryAgain)).toBeNull();
  await act(async () => { await Promise.resolve(); });
  expect(native.downloadModel).not.toHaveBeenCalled();
  expect(kv.has(AGREED_KEY)).toBe(false);
});

test('with ChatGPT chosen, Home never asks for the phone download', async () => {
  kv.set(SOURCE_KEY, '"chatgpt"');
  gpt.current.mockResolvedValue(connected);
  native.modelStatus.mockResolvedValue('downloadable');
  const screen = await show(<Home />);
  expect(await screen.findByText(words.statusReady)).toBeTruthy();
  expect(screen.queryByText(words.getReady)).toBeNull();
});

test('Get it ready is the yes: it downloads on Wi-Fi with a bar, and Home is ready after', async () => {
  native.modelStatus.mockResolvedValueOnce('downloadable').mockResolvedValue('available');
  let finish!: () => void;
  let progress!: (fraction: number) => void;
  native.downloadModel.mockImplementation((_opts, onProgress) => new Promise(resolve => { finish = resolve; progress = onProgress; }));
  const screen = await show(<Home />);
  await fireEvent.press(await screen.findByText(words.getReady));
  await waitFor(() => expect(native.downloadModel).toHaveBeenCalledWith({ allowMobileData: false }, expect.any(Function)));
  expect(kv.get(AGREED_KEY)).toBe('true');
  expect(await screen.findByText(words.statusGettingReady)).toBeTruthy();
  await act(async () => { progress(0.4); });
  expect(screen.toJSON()).not.toContain('%');
  await act(async () => { finish(); });
  expect(await screen.findByText(words.statusReady)).toBeTruthy();
});

test('a stopped download says what to do, and can use mobile data instead', async () => {
  kv.set(AGREED_KEY, 'true');
  native.modelStatus.mockResolvedValue('downloadable');
  native.downloadModel.mockRejectedValueOnce(new Error('not on Wi-Fi'));
  const screen = await show(<Home />);
  // The agreed download picks up by itself on the way in, and stops without Wi-Fi.
  await waitFor(() => expect(native.downloadModel).toHaveBeenCalledWith({ allowMobileData: false }, expect.any(Function)));
  expect(await screen.findByText(words.readyStopped)).toBeTruthy();
  expect(screen.getByText(words.tryAgain)).toBeTruthy();
  await fireEvent.press(screen.getByText(words.useMobileData));
  await waitFor(() => expect(native.downloadModel).toHaveBeenLastCalledWith({ allowMobileData: true }, expect.any(Function)));
});

test('Settings asks for the download only where this phone is the chosen writer', async () => {
  native.modelStatus.mockResolvedValue('downloadable');
  kv.set(SOURCE_KEY, '"chatgpt"');
  const chatgpt = await show(<Source />);
  await act(async () => { await Promise.resolve(); });
  expect(chatgpt.queryByText(words.readyTitle)).toBeNull();
  await chatgpt.unmount();
  kv.set(SOURCE_KEY, '"phone"');
  const screen = await show(<Source />);
  expect(await screen.findByText(words.readyTitle)).toBeTruthy();
  expect(screen.getByText(words.readyNote)).toBeTruthy();
  await fireEvent.press(screen.getByText(words.getReady));
  await waitFor(() => expect(native.downloadModel).toHaveBeenCalledWith({ allowMobileData: false }, expect.any(Function)));
  expect(kv.get(AGREED_KEY)).toBe('true');
});

test('Free up space removes the download after a second tap, and the phone asks again', async () => {
  kv.set(AGREED_KEY, 'true');
  kv.set(SOURCE_KEY, '"phone"');
  native.modelStatus.mockResolvedValue('available');
  const screen = await show(<Source />);
  await fireEvent.press(await screen.findByText(words.removeRow));
  expect(screen.getByText(words.removeAsk)).toBeTruthy();
  await fireEvent.press(screen.getByText(words.removeNo));
  expect(native.deleteModel).not.toHaveBeenCalled();
  native.modelStatus.mockResolvedValue('downloadable');
  await fireEvent.press(screen.getByText(words.removeRow));
  await fireEvent.press(screen.getByText(words.removeYes));
  await waitFor(() => expect(native.deleteModel).toHaveBeenCalled());
  expect(kv.has(AGREED_KEY)).toBe(false);
  expect(await screen.findByText(words.readyTitle)).toBeTruthy();
});

test('a failed Free up space keeps the card and says so plainly', async () => {
  kv.set(AGREED_KEY, 'true');
  kv.set(SOURCE_KEY, '"phone"');
  native.modelStatus.mockResolvedValue('available');
  native.deleteModel.mockRejectedValueOnce(new Error('locked'));
  const screen = await show(<Source />);
  await fireEvent.press(await screen.findByText(words.removeRow));
  await fireEvent.press(screen.getByText(words.removeYes));
  expect(await screen.findByText(words.removeFailed)).toBeTruthy();
  expect(kv.get(AGREED_KEY)).toBe('true');
  expect(screen.getByText(words.removeRow)).toBeTruthy();
});

test('a writer the phone came with has nothing to remove', async () => {
  native.modelStatus.mockResolvedValue('available');
  const screen = await show(<Source />);
  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByText(words.removeRow)).toBeNull();
});

test('a setup download finishing refreshes Home without a foreground change', async () => {
  let settled!: () => void;
  (native.addListener as jest.Mock).mockImplementation((name, callback) => {
    if (name === 'onModelSettled') settled = callback;
    return { remove: () => {} };
  });
  native.modelStatus.mockResolvedValueOnce('downloading').mockResolvedValue('available');
  const screen = await show(<Home />);
  expect(await screen.findByText(words.statusGettingReady)).toBeTruthy();
  await act(async () => { settled(); });
  expect(await screen.findByText(words.statusReady)).toBeTruthy();
});

test('the card pauses, and the switch hides the bubble everywhere', async () => {
  const screen = await homeCopy();
  await act(async () => { fireEvent(screen.getByLabelText(words.powerRow), 'valueChange', false); });
  expect(native.turnOff).toHaveBeenCalled();
  fireEvent.press(screen.getByText(words.rowPause));
  await waitFor(() => expect(native.setBubbleRules).toHaveBeenCalledWith({ ...rules, paused: true }));
});

test('a failed power-off keeps the switch on and tells the user', async () => {
  native.turnOff.mockRejectedValueOnce(new Error('cannot turn off'));
  const screen = await homeCopy();
  fireEvent(screen.getByLabelText(words.powerRow), 'valueChange', false);
  expect(await screen.findByText(words.failed)).toBeTruthy();
  expect(screen.getByLabelText(words.powerRow).props.value).toBe(true);
});

test('a failed pause choice stays off, explains the failure, and can be retried', async () => {
  native.setBubbleRules.mockRejectedValueOnce(new Error('could not save'));
  const screen = await homeCopy();
  fireEvent.press(screen.getByText(words.rowPause));
  expect(await screen.findByText(words.failed)).toBeTruthy();
  expect(native.setBubbleRules).toHaveBeenCalledWith({ ...rules, paused: true });
  fireEvent.press(screen.getByText(words.rowPause));
  await waitFor(() => expect(screen.queryByText(words.failed)).toBeNull());
  expect(native.setBubbleRules).toHaveBeenCalledTimes(2);
});

test('checking spelling as you type starts off, and one tap switches it on', async () => {
  const screen = await homeCopy();
  expect(screen.getByText(words.rowTypingNote)).toBeTruthy();
  fireEvent.press(screen.getByText(words.rowTyping));
  await waitFor(() => expect(native.setTypingCheck).toHaveBeenCalledWith(true));
});

test('a failed typing check choice says so and stays off', async () => {
  native.setTypingCheck.mockRejectedValueOnce(new Error('could not save'));
  const screen = await homeCopy();
  fireEvent.press(screen.getByText(words.rowTyping));
  expect(await screen.findByText(words.failed)).toBeTruthy();
  fireEvent.press(screen.getByText(words.rowTyping));
  await waitFor(() => expect(native.setTypingCheck).toHaveBeenLastCalledWith(true));
});

test('a dropped service asks to be turned back on', async () => {
  native.serviceState.mockResolvedValue('stuck');
  const screen = await show(<Home />);
  expect(await screen.findByText(words.turnBackOn)).toBeTruthy();
});

// ---- H2: the rows ----
test('the rows say where it shows, how many phrases and what it read this week', async () => {
  kv.set('voice', JSON.stringify({ never: ['delve', 'circle back'], noDashes: false, statementEndings: false, note: '' }));
  native.takeTapFacts.mockResolvedValue([fact({ at: Date.now() - 3600_000 }), fact({ at: Date.now() - 7200_000 })]);
  const screen = await homeCopy();
  expect(screen.getByText('WhatsApp and Netflix')).toBeTruthy();   // chosen app plus one default, Gmail switched off
  expect(screen.getByText('2 phrases you never say')).toBeTruthy();
  expect(screen.getByText('2 times this week')).toBeTruthy();
  expect(screen.getByText(words.rowRewriteNote)).toBeTruthy();
});

test('one phrase and one read read as one', async () => {
  kv.set('voice', JSON.stringify({ never: ['delve'], noDashes: false, statementEndings: false, note: '' }));
  native.takeTapFacts.mockResolvedValue([fact({ at: Date.now() - 3600_000 })]);
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

test('returning to Home refreshes voice, apps, and reads without backgrounding', async () => {
  const screen = await homeCopy();
  kv.set('voice', JSON.stringify({ never: ['delve'], noDashes: false, statementEndings: false, note: '' }));
  native.takeTapFacts.mockResolvedValue([fact()]);
  native.bubbleRules.mockResolvedValue({ paused: false, on: ['com.android.chrome'], off: ['com.google.android.gm', 'com.whatsapp'] });
  const focus = (jest.requireMock('expo-router').useFocusEffect as jest.Mock).mock.calls.at(-1)[0];
  await act(async () => { focus(); });
  expect(await screen.findByText('1 phrase you never say')).toBeTruthy();
  expect(screen.getByText(words.onceWeek)).toBeTruthy();
  expect(screen.getByText('Chrome')).toBeTruthy();
});

test('the rows come back fresh whenever the app is in front', async () => {
  let shown: ((state: string) => void) | null = null;
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, cb) => { shown = cb as never; return { remove: () => {} }; });
  const screen = await homeCopy();
  expect(screen.getByText(words.nothingWeek)).toBeTruthy();
  native.takeTapFacts.mockResolvedValue([fact({ at: Date.now() - 3600_000 })]);
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

test('quick app choices build on each completed write', async () => {
  let saved = rules;
  native.bubbleRules.mockImplementation(async () => saved);
  native.setBubbleRules.mockImplementation(async next => { saved = next; });
  const screen = await show(<Apps />);
  await screen.findByText('Chrome');
  await act(async () => {
    fireEvent.press(screen.getByText('Chrome'));
    fireEvent.press(screen.getByText('Gmail'));
  });
  expect(native.setBubbleRules).toHaveBeenCalledTimes(2);
  expect(saved.on).toEqual(expect.arrayContaining(['com.netflix.netflix', 'com.android.chrome', 'com.google.android.gm']));
  expect(saved.off).toEqual([]);
});

test('a failed app choice stays off, explains the failure, and can be retried', async () => {
  native.setBubbleRules.mockRejectedValueOnce(new Error('could not save'));
  const screen = await show(<Apps />);
  await screen.findByText('Chrome');
  fireEvent.press(screen.getByText('Chrome'));
  expect(await screen.findByText(words.failed)).toBeTruthy();
  expect(screen.getByLabelText('Chrome').props.value).toBe(false);
  fireEvent.press(screen.getByText('Chrome'));
  await waitFor(() => expect(screen.queryByText(words.failed)).toBeNull());
  expect(screen.getByLabelText('Chrome').props.value).toBe(true);
  expect(native.setBubbleRules).toHaveBeenCalledTimes(2);
});

test('the list narrows as you type', async () => {
  const screen = await show(<Apps />);
  await screen.findByText('WhatsApp');
  fireEvent.changeText(screen.getByLabelText(words.findAnApp), 'chro');
  await waitFor(() => expect(screen.queryByText('WhatsApp')).toBeNull());
  expect(screen.getByText('Chrome')).toBeTruthy();
});

test('a switched row stays where it was, under its own group', async () => {
  const screen = await show(<Apps />);
  await screen.findByText('Gmail');
  expect(screen.getByText(words.appsShown)).toBeTruthy();
  fireEvent.press(screen.getByText('Gmail'));
  await waitFor(() => expect(screen.getByLabelText('Gmail').props.value).toBe(true));
  const text = JSON.stringify(screen.toJSON());
  expect(text.indexOf('"Gmail"')).toBeGreaterThan(text.indexOf(`"${words.appsOther}"`));   // still with the other apps until next visit
});

test('a search with no match says so, and Clear brings the list back', async () => {
  const screen = await show(<Apps />);
  await screen.findByText('WhatsApp');
  fireEvent.changeText(screen.getByLabelText(words.findAnApp), 'zzz');
  expect(await screen.findByText(words.appsNoMatch)).toBeTruthy();
  fireEvent.press(screen.getByLabelText(words.clearSearch));
  expect(await screen.findByText('WhatsApp')).toBeTruthy();
  expect(screen.queryByText(words.appsNoMatch)).toBeNull();
});

test('an app list that fails to load offers Try again', async () => {
  native.launcherApps.mockRejectedValueOnce(new Error('no'));
  const screen = await show(<Apps />);
  expect(await screen.findByText(words.gptAppsUnavailable)).toBeTruthy();
  fireEvent.press(screen.getByText(words.tryAgain));
  expect(await screen.findByText('WhatsApp')).toBeTruthy();
});

// ---- H4: Your voice ----
test('an import previews what it found before adding anything', async () => {
  picker.pickFileAsync.mockResolvedValue({ canceled: false, result: { text: async () => '# Never say\n- "delve"\n- "circle back"\n\nNo em dashes anywhere.\n## How I reply\n- private reply\n' } });
  const screen = await show(<Voice />);
  fireEvent.press(screen.getByText(words.importFile));
  expect(await screen.findByText(/Found in the file:/)).toBeTruthy();
  expect(screen.getByText(/“delve”, “circle back”/)).toBeTruthy();
  expect(screen.getByText(/Nothing else in the file is kept/)).toBeTruthy();
  expect(loadVoice().never).toEqual([]);                                     // nothing saved until Add these
  fireEvent.press(screen.getByText(words.addThese));
  await waitFor(() => expect(loadVoice().never).toEqual(['delve', 'circle back']));
  expect(screen.getByText(words.added)).toBeTruthy();
  expect(loadVoice().samples).toEqual([]);
  expect(JSON.parse(kv.get('voice')!)).toEqual({ never: ['delve', 'circle back'], noDashes: true, statementEndings: false, note: '', samples: [] });
});

test('a markdown share previews and adds through Your voice without a picker', async () => {
  native.sharedMarkdown.mockResolvedValue('# Never say\n- "circle back"\n\nNo em dashes.\n## How I reply\n- private reply');
  const screen = await show(<Voice shared />);
  expect(await screen.findByText(/“circle back”/)).toBeTruthy();
  expect(loadVoice().never).toEqual([]);
  expect(picker.pickFileAsync).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText(words.addThese));
  await waitFor(() => expect(loadVoice()).toEqual(expect.objectContaining({ never: ['circle back'], noDashes: true })));
  expect(loadVoice().samples).toEqual([]);
  expect(JSON.parse(kv.get('voice')!)).toEqual({ never: ['circle back'], noDashes: true, statementEndings: false, note: '', samples: [] });
  fireEvent.press(screen.getByLabelText(words.back));
  expect(native.finishRewrite).toHaveBeenCalledWith(null, false);
});

test('an import includes phrases beyond the first 5,000 lines', async () => {
  picker.pickFileAsync.mockResolvedValue({ canceled: false, result: { text: async () => '# Never say\n' + 'filler\n'.repeat(5000) + '- "later phrase"' } });
  const screen = await show(<Voice />);
  fireEvent.press(screen.getByText(words.importFile));
  expect(await screen.findByText(/later phrase/)).toBeTruthy();
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

test('phrases join as chips on Add or a new line, once each, and a chip tap removes it', async () => {
  const screen = await show(<Voice />);
  expect(screen.getByText(words.neverSayNone)).toBeTruthy();
  const field = screen.getByLabelText(words.neverSay);
  await act(async () => { fireEvent.changeText(field, 'delve'); });
  expect(loadVoice().never).toEqual([]);                                     // a half-typed phrase isn't saved
  await act(async () => { fireEvent.press(screen.getByLabelText(words.addPhrase)); });
  expect(loadVoice().never).toEqual(['delve']);
  expect(screen.getByLabelText(words.neverSay).props.value).toBe('');
  await act(async () => { fireEvent.changeText(field, 'Delve\ncircle back\nsyn'); });
  expect(loadVoice().never).toEqual(['delve', 'circle back']);
  expect(screen.getByLabelText(words.neverSay).props.value).toBe('syn');
  await act(async () => { fireEvent(field, 'submitEditing'); });
  expect(loadVoice().never).toEqual(['delve', 'circle back', 'syn']);
  await act(async () => { fireEvent.press(screen.getByLabelText(`${words.removePhrase} circle back`)); });
  expect(loadVoice().never).toEqual(['delve', 'syn']);
  expect(screen.queryByText('circle back')).toBeNull();
});

test('an empty never-say list offers one-tap phrases, which join like typed ones', async () => {
  const screen = await show(<Voice />);
  await act(async () => { fireEvent.press(screen.getByLabelText('Kind regards')); });
  expect(loadVoice().never).toEqual(['Kind regards']);
  expect(screen.queryByText(words.neverSayNone)).toBeNull();
  expect(screen.queryByLabelText('Cheers')).toBeNull();                      // the ideas only fill an empty list
});

test('style ideas add to and take out of the note, keeping what was typed', async () => {
  const screen = await show(<Voice />);
  await act(async () => { fireEvent.changeText(screen.getByLabelText(words.howIWrite), 'lowercase'); });
  await act(async () => { fireEvent.press(screen.getByLabelText('Friendly')); });
  expect(loadVoice().note).toBe('lowercase, friendly');
  expect(screen.getByLabelText('Friendly').props.accessibilityState).toMatchObject({ selected: true });
  await act(async () => { fireEvent.press(screen.getByLabelText('Friendly')); });
  expect(loadVoice().note).toBe('lowercase');
  expect(toggleStyle('', 'Short sentences')).toBe('Short sentences');
  expect(toggleStyle('Short sentences, casual', 'Casual')).toBe('Short sentences');
});

test('the rules, the note and the never-say list all save', async () => {
  const screen = await show(<Voice />);
  await act(async () => { fireEvent.press(screen.getByText(words.ruleDashes)); });
  await act(async () => { fireEvent.changeText(screen.getByLabelText(words.howIWrite), 'short sentences'); });
  await act(async () => { fireEvent.changeText(screen.getByLabelText(words.neverSay), 'delve\ncircle back\n'); });
  await waitFor(() => expect(loadVoice()).toEqual({ never: ['delve', 'circle back'], noDashes: true, statementEndings: false, note: 'short sentences', samples: [] }));
  expect(screen.getByText(words.neverSayHelp)).toBeTruthy();
  expect(screen.getByText(words.wipeElsewhere)).toBeTruthy();
});

test('failed voice saves leave switches, notes and phrases unchanged', async () => {
  const storage = jest.requireMock('expo-sqlite/kv-store').default;
  const set = jest.spyOn(storage, 'setItemSync');
  try {
    const screen = await show(<Voice />);
    set.mockImplementationOnce(() => { throw new Error('disk full'); });
    await act(async () => { fireEvent.press(screen.getByText(words.ruleDashes)); });
    expect(screen.getByText(words.failed)).toBeTruthy();
    expect(loadVoice().noDashes).toBe(false);
    await act(async () => { fireEvent.press(screen.getByText(words.ruleDashes)); });
    expect(loadVoice().noDashes).toBe(true);
    set.mockImplementationOnce(() => { throw new Error('disk full'); });
    await act(async () => { fireEvent.changeText(screen.getByLabelText(words.howIWrite), 'short'); });
    expect(screen.getByLabelText(words.howIWrite).props.value).toBe('');
    await act(async () => { fireEvent.changeText(screen.getByLabelText(words.neverSay), 'delve'); });
    set.mockImplementationOnce(() => { throw new Error('disk full'); });
    await act(async () => { fireEvent.press(screen.getByLabelText(words.addPhrase)); });
    expect(screen.getByLabelText(words.neverSay).props.value).toBe('delve');  // kept to try again
    expect(loadVoice().never).toEqual([]);
    await act(async () => { fireEvent.press(screen.getByLabelText(words.addPhrase)); });
    expect(loadVoice().never).toEqual(['delve']);
    expect(screen.queryByText(words.failed)).toBeNull();
  } finally { set.mockRestore(); }
});

test('a failed import keeps its preview available to retry', async () => {
  picker.pickFileAsync.mockResolvedValue({ canceled: false, result: { text: async () => '# Never say\n- "delve"' } });
  const storage = jest.requireMock('expo-sqlite/kv-store').default;
  const set = jest.spyOn(storage, 'setItemSync');
  try {
    const screen = await show(<Voice />);
    fireEvent.press(screen.getByText(words.importFile));
    await screen.findByText(words.addThese);
    set.mockImplementationOnce(() => { throw new Error('disk full'); });
    await act(async () => { fireEvent.press(screen.getByText(words.addThese)); });
    expect(screen.getByText(words.failed)).toBeTruthy();
    expect(screen.getByText(words.addThese)).toBeTruthy();
    expect(loadVoice().never).toEqual([]);
    await act(async () => { fireEvent.press(screen.getByText(words.addThese)); });
    expect(loadVoice().never).toEqual(['delve']);
  } finally { set.mockRestore(); }
});

test('an import preview reads in plain words, both skipped counts', () => {
  expect(foundLines({ never: ['delve'], noDashes: true, statementEndings: false, samples: [], skipped: 0 }))
    .toBe('Found in the file:\nNever say (1): “delve”\nRule: No long dashes (—)\nNothing else in the file is kept. Add these to Your voice?');
  expect(foundLines({ never: [], noDashes: false, statementEndings: true, samples: [], skipped: 1 })).toContain(SKIP_ONE);
  expect(foundLines({ never: [], noDashes: false, statementEndings: true, samples: [], skipped: 3 })).toContain('Left out 3 notes that read as advice, not phrases.');
});
const SKIP_ONE = 'Left out 1 note that reads as advice, not a phrase.';

// ---- H5: What Ownvoice read ----
test('a tap is logged with the app and the time, and never any text', async () => {
  native.takeTapFacts.mockResolvedValue([fact()]);
  const screen = await show(<Reads />);
  await waitFor(() => expect(readLog().length).toBe(1));
  expect(screen.getByText('Suggested replies in WhatsApp')).toBeTruthy();
  expect(screen.getByText('Read the chat on screen')).toBeTruthy();
  expect(screen.getByText(words.today)).toBeTruthy();
  expect(kv.has('reads')).toBe(false);
});

test('Wipe everything asks once, and Keep it keeps everything', async () => {
  native.takeTapFacts.mockResolvedValue([fact()]);
  const screen = await show(<Reads />);
  await waitFor(() => expect(readLog().length).toBe(1));
  fireEvent.press(screen.getByText(words.wipe));
  expect(await screen.findByText(words.wipeAsk)).toBeTruthy();
  expect(native.forget).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText(words.removeNo));
  await waitFor(() => expect(screen.queryByText(words.wipeAsk)).toBeNull());
  expect(readLog()).toHaveLength(1);
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
  fireEvent.press(await screen.findByText(words.wipeYes));
  await waitFor(() => expect(screen.getByText(words.nothingRead)).toBeTruthy());
  expect(readLog()).toEqual([]);
  expect(loadVoice().never).toEqual([]);
  expect(native.forget).toHaveBeenCalled();
  expect(native.clearTapFacts).toHaveBeenCalled();
});

test('a failed native wipe keeps saved choices and offers a retry', async () => {
  native.takeTapFacts.mockResolvedValue([fact()]);
  native.clearTapFacts.mockRejectedValueOnce(new Error('could not clear'));
  const screen = await show(<Reads />);
  await waitFor(() => expect(readLog()).toHaveLength(1));
  kv.set('voice', JSON.stringify({ never: ['delve'], noDashes: true, statementEndings: false, note: '' }));
  fireEvent.press(screen.getByText(words.wipe));
  fireEvent.press(await screen.findByText(words.wipeYes));
  expect(await screen.findByText(words.failed)).toBeTruthy();
  expect(readLog()).toHaveLength(1);
  expect(loadVoice().never).toEqual(['delve']);
  fireEvent.press(screen.getByText(words.wipe));
  fireEvent.press(await screen.findByText(words.wipeYes));
  await waitFor(() => expect(readLog()).toEqual([]));
});

test('Home includes taps still waiting in the phone', async () => {
  native.takeTapFacts.mockResolvedValueOnce([fact()]).mockResolvedValue([]);
  const screen = await homeCopy();
  expect(await screen.findByText(words.onceWeek)).toBeTruthy();
  expect(readLog()).toHaveLength(1);
});

test('an entry older than 30 days has already gone', async () => {
  native.takeTapFacts.mockResolvedValue([fact({ at: Date.now() - 31 * 24 * 3600_000 })]);
  const screen = await show(<Reads />);
  expect(screen.getByText(words.nothingRead)).toBeTruthy();
});

test('a wipe waits for Home transfer and cannot be undone by it', async () => {
  const tap = fact();
  let deliver!: (facts: TapFact[]) => void;
  native.takeTapFacts.mockImplementationOnce(() => new Promise(resolve => { deliver = resolve; })).mockResolvedValue([]);
  const home = await show(<Home />);
  await waitFor(() => expect(native.takeTapFacts).toHaveBeenCalledTimes(1));
  home.unmount();
  const screen = await show(<Reads />);
  fireEvent.press(screen.getByText(words.wipe));
  fireEvent.press(await screen.findByText(words.wipeYes));
  await act(async () => { await Promise.resolve(); });
  expect(native.clearTapFacts).not.toHaveBeenCalled();
  await act(async () => { deliver([tap]); });
  await waitFor(() => expect(native.clearTapFacts).toHaveBeenCalled());
  await waitFor(() => expect(readLog()).toEqual([]));
  expect(screen.getByText(words.nothingRead)).toBeTruthy();
});

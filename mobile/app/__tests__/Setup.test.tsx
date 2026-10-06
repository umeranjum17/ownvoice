import React from 'react';
import { AccessibilityInfo, BackHandler, Linking, StyleSheet } from 'react-native';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Setup from '../setup';
import Home from '../index';
import Native from '../../modules/ownvoice-native';
import { words, technicalWords } from '../../src/core/words';
import { session, nothing, type GptState } from '../../src/chatgpt/session';
import { AGREED_KEY } from '../../src/core/phoneDownload';

jest.mock('../../modules/ownvoice-native', () => ({
  __esModule: true,
  default: {
    serviceState: jest.fn(), launcherApps: jest.fn(),
    bubbleRules: jest.fn(), setBubbleRules: jest.fn(), setPractice: jest.fn(), clearSetupReturn: jest.fn(),
    openAccessibilitySettings: jest.fn(), openAppInfo: jest.fn(), addListener: jest.fn(), copy: jest.fn(), typingCheck: jest.fn(async () => false),
  },
}));
jest.mock('../../src/chatgpt/session', () => ({
  ...jest.requireActual('../../src/chatgpt/session'),
  session: { current: jest.fn(), start: jest.fn(), cancel: jest.fn(), signOut: jest.fn() },
}));

const native = Native as jest.Mocked<typeof Native>;
jest.mock('../../src/core/localModel', () => ({
  AGREED_KEY: 'local-model-agreed',
  MOBILE_KEY: 'local-model-mobile-data',
  getLocalModel: jest.fn(() => ({ state: { phase: 'installing' } })),
  localModelState: jest.fn(),
  agreedToDownload: jest.fn(),
  installLocalModel: jest.fn(),
  removeLocalModel: jest.fn(),
}));
jest.mock('../../src/chatgpt/accounts', () => {
  let signInView: any = null;
  let statusResult: any = { account: 'owner', name: 'ChatGPT', state: 'signed_out', words: 'Not signed in.' };

  const mockSignIn = jest.fn(async (_provider?: string) => {
    // Simulate starting sign-in: set view to waiting state
    signInView = { state: 'waiting', via: 'code', code: 'KQPT-MXVD', url: 'https://chatgpt.com/code' };
  });
  const mockSignOut = jest.fn(async (_provider?: string) => {
    signInView = null;
    statusResult = { account: 'owner', name: 'ChatGPT', state: 'signed_out', words: 'Not signed in.' };
  });
  const mockSignInState = jest.fn((_provider?: string) => signInView);
  const mockStatus = jest.fn(async (_provider?: string) => statusResult);
  const mockCancelSignIn = jest.fn((_provider?: string) => {
    signInView = null;
  });
  const mockRefresh = jest.fn(async () => {});
  const mockAccounts = {
    providers: [{ key: 'chatgpt', name: 'ChatGPT', company: 'OpenAI', billing: 'subscription' as const }],
    __mockState: {
      getSignInView: () => signInView,
      getStatusResult: () => statusResult,
      setSignInView: (v: any) => { signInView = v; },
      setStatusResult: (s: any) => { statusResult = s; }
    },
  };

  // Helper to simulate sign-in completion (for tests to call)
  (mockStatus as any).mockConnected = () => {
    signInView = null;
    statusResult = { account: 'owner', name: 'ChatGPT', state: 'ready', words: 'ChatGPT is connected.' };
  };

  return {
    accounts: mockAccounts,
    signIn: mockSignIn,
    signOut: mockSignOut,
    refresh: mockRefresh,
    signInState: mockSignInState,
    status: mockStatus,
    cancelSignIn: mockCancelSignIn,
  };
});
import { agreedToDownload, installLocalModel, localModelState } from '../../src/core/localModel';
import { status as accountsStatus, accounts, signIn as accountsSignIn, signOut as accountsSignOut, cancelSignIn as accountsCancel } from '../../src/chatgpt/accounts';
const mockState = localModelState as jest.MockedFunction<typeof localModelState>;
const mockAgreed = agreedToDownload as jest.MockedFunction<typeof agreedToDownload>;
const mockInstall = installLocalModel as jest.MockedFunction<typeof installLocalModel>;
const gpt = session as jest.Mocked<typeof session>;
const simulateSignInComplete = () => (accountsStatus as any).mockConnected();
const setAccountsWaiting = () => (accounts as any).__mockState.setSignInView({ state: 'waiting', via: 'code', code: 'KQPT-MXVD', url: 'https://chatgpt.com/code' });
// The accounts mock keeps its sign-in view and status in module-closure state that
// jest.clearAllMocks() never touches, so reset it here: without this, a test that
// connects leaks a ready status into every later test in this file.
const resetAccountsMock = () => {
  (accounts as any).__mockState.setSignInView(null);
  (accounts as any).__mockState.setStatusResult({ account: 'owner', name: 'ChatGPT', state: 'signed_out', words: 'Not signed in.' });
};
const waitingCode: GptState = { ...nothing, waiting: true, code: 'KQPT-MXVD', url: 'https://chatgpt.com/code', note: 'Sign in on the ChatGPT page that just opened.' };
const connected: GptState = { ...nothing, signedIn: true, note: 'ChatGPT is connected.' };
const kv = (jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>);
const events: Record<string, (event: { state?: string; ok?: boolean; newlinesLost?: boolean; practice?: boolean }) => void> = {};
// Every root must be unmounted before the next test renders, or the next render comes up empty.
const live: Array<() => Promise<void>> = [];
const renderSetup = async () => {
  const screen = await render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><Setup /></SafeAreaProvider>);
  live.push(() => screen.unmount());
  return screen;
};
afterEach(async () => {
  for (const un of live.splice(0)) await un();
});
const backHandlers: Array<() => boolean> = [];

beforeEach(() => {
  kv.clear();
  for (const key of Object.keys(events)) delete events[key];
  backHandlers.length = 0;
  jest.clearAllMocks();
  resetAccountsMock();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  mockState.mockResolvedValue({ phase: 'ready' });
  mockAgreed.mockImplementation(() => kv.get(AGREED_KEY) === 'true');
  mockInstall.mockResolvedValue(undefined);
  native.serviceState.mockResolvedValue('off');
  native.launcherApps.mockResolvedValue([
    { app: 'com.google.android.gm', label: 'Gmail', icon: null },
    { app: 'com.whatsapp', label: 'WhatsApp', icon: null },
    { app: 'com.android.chrome', label: 'Chrome', icon: null },
  ]);
  native.bubbleRules.mockResolvedValue({ paused: false, on: [], off: [] });
  native.setBubbleRules.mockResolvedValue(undefined as never);
  native.setPractice.mockResolvedValue(undefined as never);
  native.clearSetupReturn.mockResolvedValue(undefined as never);
  native.openAccessibilitySettings.mockResolvedValue(undefined as never);
  native.openAppInfo.mockResolvedValue(undefined as never);
  native.copy.mockResolvedValue(undefined as never);
  native.typingCheck.mockResolvedValue(false);
  gpt.current.mockResolvedValue(nothing);
  gpt.start.mockResolvedValue(waitingCode);
  gpt.cancel.mockResolvedValue({ ...nothing, note: 'Sign-in stopped. Nothing was kept.' });
  gpt.signOut.mockResolvedValue(nothing);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  (native.addListener as unknown as jest.Mock).mockImplementation((event: string, cb: (event: never) => void) => {
    events[event] = cb as never;
    return { remove: () => {} };
  });
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((_event: string, cb: () => boolean) => {
    backHandlers.push(cb);
    return { remove: () => {} };
  }) as never);
});

const at = (step: string, inserted = false) => kv.set('setup', JSON.stringify({ step, inserted }));

test.each(['WELCOME', 'CHOOSE', 'PERMISSION', 'TRY', 'APPS'])('%s uses plain visible wording', async step => {
  at(step, true);
  const screen = await renderSetup();
  await screen.findByText(({ WELCOME: words.welcomeTitle, CHOOSE: words.tradePlan3.replace('{name}', 'ChatGPT'), PERMISSION: words.permissionTitle, TRY: words.tryDoneTitle, APPS: words.appsTitle } as Record<string, string>)[step]);
  const visible: string[] = [];
  const collect = (node: unknown): void => {
    if (typeof node === 'string') visible.push(node);
    else if (Array.isArray(node)) node.forEach(collect);
    else if (node && typeof node === 'object' && 'children' in node) collect((node as { children: unknown }).children);
  };
  collect(screen.toJSON());
  expect(visible.length).toBeGreaterThan(0);
  expect(visible.filter(text => technicalWords.test(text))).toEqual([]);
});

test('unfinishedSetupResumesEvenWhenServiceIsOn', async () => {
  at('APPS');
  native.serviceState.mockResolvedValue('on');
  const screen = await render(<Home />);
  live.push(() => screen.unmount());
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/setup'));
  expect(native.serviceState).not.toHaveBeenCalled();
});

test('homeSettingsDoesNotRequestASetupReturn', async () => {
  kv.set('setup-done', 'true');
  const screen = await render(<Home />);
  live.push(() => screen.unmount());
  await fireEvent(screen.getByLabelText(words.powerRow), 'valueChange', true);
  expect(router.push).toHaveBeenCalledWith('/setup');
  await fireEvent.press(screen.getByText(words.rowApps));
  expect(router.push).toHaveBeenCalledWith('/apps');
});

test('welcomeDownloadsNothingAndMovesToTheChoice', async () => {
  mockState.mockResolvedValue({ phase: 'not-installed' });
  const screen = await renderSetup();
  expect(await screen.findByText(words.welcomeTitle)).toBeTruthy();
  const continueButton = screen.getByRole('button', { name: words.continueLabel });
  expect(StyleSheet.flatten(continueButton.parent?.props.style).alignItems).toBeUndefined();
  await act(async () => { await Promise.resolve(); });
  expect(mockInstall).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText(words.continueLabel));
  expect(await screen.findByText(words.chooseTitle)).toBeTruthy();
  expect(kv.get('setup')).toContain('CHOOSE');
  await screen.unmount();
  // The step survives process death (S7), so a remount comes back to it.
  const again = await renderSetup();
  expect(await again.findByText(words.chooseTitle)).toBeTruthy();
});

test('alreadyOnSkipsThePermission', async () => {
  native.serviceState.mockResolvedValue('on');
  const screen = await renderSetup();
  expect(await screen.findByText(words.welcomeTitle)).toBeTruthy();
  await fireEvent.press(screen.getByText(words.continueLabel));
  await screen.findByText(words.tradePhone1);
  await fireEvent.press(screen.getByText(words.continueLabel));
  expect(await screen.findByText(words.tryTitle)).toBeTruthy();
});

test('with the typing check on, the permission promise says it reads as you type', async () => {
  native.typingCheck.mockResolvedValue(true);
  at('PERMISSION');
  const screen = await renderSetup();
  expect(await screen.findByText(words.promiseTapTyping)).toBeTruthy();
  expect(screen.getByText(words.promiseTapTypingNote)).toBeTruthy();
  expect(screen.queryByText(words.promiseTap)).toBeNull();
  expect(screen.queryByText(words.promiseTapNote)).toBeNull();
});

test('permissionExplainsAndOpensTheSwitch', async () => {
  at('PERMISSION');
  const screen = await renderSetup();
  expect(await screen.findByText(words.permissionSubtitle)).toBeTruthy();
  expect(screen.getByText(words.promiseTap)).toBeTruthy();
  expect(await screen.findByText(words.promiseStays)).toBeTruthy();
  expect(screen.getByText(words.promiseStaysNote)).toBeTruthy();
  expect(screen.queryByText(words.promiseGpt)).toBeNull();
  expect(screen.getByText(words.promiseSend)).toBeTruthy();
  expect(screen.getByText(words.switchRowAction, { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getByText(words.stepApp)).toBeTruthy();
  expect(screen.getByText(words.stepSwitch)).toBeTruthy();
  expect(screen.getByText(words.stepAllow)).toBeTruthy();
  expect(screen.getByText(words.fullControl)).toBeTruthy();
  await fireEvent.press(screen.getByText(words.turnOn));
  expect(native.openAccessibilitySettings).toHaveBeenCalledWith(true);
  expect(screen.queryByText(words.greyedHelp)).toBeNull();
  await fireEvent.press(screen.getByText(words.switchGreyed));
  expect(native.openAppInfo).toHaveBeenCalled();
  expect(screen.getByText(words.greyedHelp)).toBeTruthy();
});

test('serviceOnAdvancesThePermissionByItself', async () => {
  at('PERMISSION');
  const screen = await renderSetup();
  expect(await screen.findByText(words.permissionTitle)).toBeTruthy();
  events.onServiceChange?.({ state: 'on' });
  expect(await screen.findByText(words.tryTitle)).toBeTruthy();
});

const throughTheChoice = async (screen: Awaited<ReturnType<typeof renderSetup>>) => {
  await fireEvent.press(await screen.findByText(words.continueLabel));
  await screen.findByText(words.tradePhone1);
  await fireEvent.press(screen.getByText(words.continueLabel));
};

test('notNowSkipsPracticeWhenAppsRemain', async () => {
  const screen = await renderSetup();
  await throughTheChoice(screen);
  await fireEvent.press(await screen.findByText(words.notNow));
  expect(await screen.findByText(words.appsTitle)).toBeTruthy();
  expect(native.launcherApps).toHaveBeenCalledWith(expect.arrayContaining(['com.whatsapp', 'com.google.android.gm']));
  // Only installed apps among the offered ones, in the list's order (S5).
  expect(screen.getByText('WhatsApp')).toBeTruthy();
  expect(screen.getByText('Gmail')).toBeTruthy();
  expect(screen.queryByText('X')).toBeNull();
  expect(screen.queryByText('Chrome')).toBeNull();
});

test('no offered apps finishes setup after the permission', async () => {
  native.setBubbleRules.mockRejectedValue(new Error('unneeded write'));
  native.launcherApps.mockResolvedValue([{ app: 'com.android.chrome', label: 'Chrome', icon: null }]);
  const screen = await renderSetup();
  await throughTheChoice(screen);
  await fireEvent.press(await screen.findByText(words.notNow));
  expect(native.setBubbleRules).not.toHaveBeenCalled();
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  expect(kv.get('setup-done')).toBe('true');
});

test('permission skip with no offered apps finishes setup', async () => {
  at('PERMISSION');
  native.setBubbleRules.mockRejectedValue(new Error('unneeded write'));
  native.launcherApps.mockResolvedValue([]);
  const screen = await renderSetup();
  await fireEvent.press(await screen.findByText(words.notNow));
  expect(native.setBubbleRules).not.toHaveBeenCalled();
  await waitFor(() => expect(kv.get('setup-done')).toBe('true'));
});

test('a step saved by an older version at its last offer finishes setup without touching app choices', async () => {
  at('CHATGPT');
  await renderSetup();
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  expect(kv.get('setup-done')).toBe('true');
  expect(native.setBubbleRules).not.toHaveBeenCalled();
});

test('appsSaveWhatTheyShowOnDone', async () => {
  at('APPS');
  const screen = await renderSetup();
  expect(await screen.findByText(words.appsNote)).toBeTruthy();
  // Everything starts on; tapping a row switches that app off.
  await fireEvent.press(screen.getByText('Gmail'));
  await fireEvent.press(screen.getByText(words.done));
  await waitFor(() => expect(native.setBubbleRules).toHaveBeenCalled());
  const saved = native.setBubbleRules.mock.calls[0][0];
  expect(saved.on).toContain('com.whatsapp');
  expect(saved.off).toContain('com.google.android.gm');
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  expect(native.clearSetupReturn).toHaveBeenCalledTimes(1);
  expect(kv.get('setup-done')).toBe('true');
});

test('choicesReplaceConflictingRulesAndWaitForTheWrite', async () => {
  at('APPS');
  native.bubbleRules.mockResolvedValue({ paused: false, on: ['com.google.android.gm'], off: ['com.whatsapp'] });
  let complete!: () => void;
  native.setBubbleRules.mockImplementation(() => new Promise<void>(resolve => { complete = resolve; }));
  const screen = await renderSetup();
  await screen.findByText('Gmail');
  await fireEvent.press(screen.getByText('Gmail'));
  await fireEvent.press(screen.getByText(words.done));
  await waitFor(() => expect(native.setBubbleRules).toHaveBeenCalled());
  expect(native.setBubbleRules.mock.calls[0][0]).toEqual({ paused: false, on: ['com.whatsapp'], off: ['com.google.android.gm'] });
  expect(kv.get('setup-done')).toBeUndefined();
  await fireEvent.press(screen.getByText('Gmail'));
  expect(native.setBubbleRules.mock.calls[0][0].off).toContain('com.google.android.gm');
  complete();
  await waitFor(() => expect(kv.get('setup-done')).toBe('true'));
});

test('failedAppWriteLeavesSetupRecoverable', async () => {
  at('APPS');
  native.setBubbleRules.mockRejectedValueOnce(new Error('write failed'));
  const screen = await renderSetup();
  await screen.findByText('Gmail');
  await fireEvent.press(screen.getByText(words.done));
  await waitFor(() => expect(native.setBubbleRules).toHaveBeenCalledTimes(1));
  expect(native.setBubbleRules).toHaveBeenCalledTimes(1);
  expect(kv.get('setup-done')).toBeUndefined();
  expect(router.replace).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText(words.done));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
});

test('failedReturnCleanupLeavesSetupUnfinished', async () => {
  at('APPS');
  native.clearSetupReturn.mockRejectedValueOnce(new Error('write failed'));
  const screen = await renderSetup();
  await screen.findByText('Gmail');
  await fireEvent.press(screen.getByText(words.done));
  await waitFor(() => expect(native.clearSetupReturn).toHaveBeenCalledTimes(1));
  expect(kv.get('setup-done')).toBeUndefined();
  expect(router.replace).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText(words.done));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
});

test('appChoicesWaitForTheInstalledList', async () => {
  at('APPS');
  let loaded!: (apps: { app: string; label: string; icon: null }[]) => void;
  native.launcherApps.mockImplementation(() => new Promise(resolve => { loaded = resolve; }));
  const screen = await renderSetup();
  await fireEvent.press(screen.getByText(words.done));
  expect(native.setBubbleRules).not.toHaveBeenCalled();
  expect(kv.get('setup-done')).toBeUndefined();
  loaded([{ app: 'com.whatsapp', label: 'WhatsApp', icon: null }]);
  await screen.findByText('WhatsApp');
  await fireEvent.press(screen.getByText(words.done));
  await waitFor(() => expect(kv.get('setup-done')).toBe('true'));
});

test('backCompletesSetupEvenWhileAppsAreUnknown', async () => {
  at('APPS');
  native.launcherApps.mockImplementation(() => new Promise(() => {}));
  const screen = await renderSetup();
  await screen.findByText(words.appsTitle);
  backHandlers.forEach(fire => fire());
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  expect(kv.get('setup-done')).toBe('true');
  expect(native.setBubbleRules).not.toHaveBeenCalled();
});

test('backCompletesSetupAfterAppQueryFails', async () => {
  at('APPS');
  native.launcherApps.mockRejectedValueOnce(new Error('query failed'));
  const screen = await renderSetup();
  await screen.findByText(words.appsUnavailable);
  backHandlers.forEach(fire => fire());
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  expect(kv.get('setup-done')).toBe('true');
  expect(native.setBubbleRules).not.toHaveBeenCalled();
});

test('launcherFailureDoesNotBecomeAnEmptyList', async () => {
  at('APPS');
  native.launcherApps.mockRejectedValueOnce(new Error('query failed'));
  const screen = await renderSetup();
  await screen.findByText(words.appsUnavailable);
  await fireEvent.press(screen.getByText(words.done));
  expect(kv.get('setup-done')).toBeUndefined();
  await fireEvent.press(screen.getByText(words.tryAgain));
  await screen.findByText('Gmail');
  await fireEvent.press(screen.getByText(words.done));
  await waitFor(() => expect(kv.get('setup-done')).toBe('true'));
});

test.each([
  ['PERMISSION', words.notNow, false],
  ['TRY', words.skip, false],
  ['TRY', words.continueLabel, true],
])('pendingAppQueryDisables%sAction', async (step, action, inserted) => {
  at(step, inserted);
  let loaded!: (apps: { app: string; label: string; icon: null }[]) => void;
  native.launcherApps.mockImplementation(() => new Promise(resolve => { loaded = resolve; }));
  const screen = await renderSetup();
  await screen.findByText(step === 'TRY' ? (inserted ? words.tryDoneTitle : words.tryTitle) : words.permissionTitle);
  await fireEvent.press(screen.getByText(action));
  expect(screen.queryByText(words.appsTitle)).toBeNull();
  await act(async () => { loaded([{ app: 'com.whatsapp', label: 'WhatsApp', icon: null }]); });
  await fireEvent.press(screen.getByText(action));
  expect(await screen.findByText(words.appsTitle)).toBeTruthy();
});

test.each([['PERMISSION', words.notNow], ['TRY', words.skip]])('failedAppQueryFrom%sOpensRetry', async (step, action) => {
  at(step);
  native.launcherApps.mockRejectedValueOnce(new Error('query failed'));
  const screen = await renderSetup();
  await screen.findByText(step === 'TRY' ? words.tryTitle : words.permissionTitle);
  await fireEvent.press(screen.getByText(action));
  expect(await screen.findByText(words.appsUnavailable)).toBeTruthy();
  expect(kv.get('setup')).toContain('APPS');
  expect(kv.get('setup-done')).toBeUndefined();
  await fireEvent.press(screen.getByText(words.tryAgain));
  expect(await screen.findByText('Gmail')).toBeTruthy();
});

test('failedSetupWriteDoesNotAdvanceOrComplete', async () => {
  at('PERMISSION');
  const storage = jest.requireMock('expo-sqlite/kv-store').default;
  const screen = await renderSetup();
  await screen.findByText(words.permissionTitle);
  jest.spyOn(storage, 'setItemSync').mockImplementationOnce(() => { throw new Error('disk full'); });
  await fireEvent.press(screen.getByText(words.notNow));
  expect(screen.getByText(words.permissionTitle)).toBeTruthy();
  expect(kv.get('setup')).toContain('PERMISSION');
  storage.setItemSync.mockRestore();
  await fireEvent.press(screen.getByText(words.notNow));
  await screen.findByText(words.appsTitle);
  jest.spyOn(storage, 'setItemSync').mockImplementationOnce(() => { throw new Error('disk full'); });
  await fireEvent.press(screen.getByText(words.done));
  expect(router.replace).not.toHaveBeenCalled();
  expect(kv.get('setup-done')).toBeUndefined();
  storage.setItemSync.mockRestore();
});

test('practiceLetsTheBubbleWorkOnlyThereAndEndsOnInsert', async () => {
  at('TRY');
  native.serviceState.mockResolvedValue('on');
  const screen = await renderSetup();
  expect(await screen.findByText(words.tryInsert)).toBeTruthy();
  await waitFor(() => expect(native.setPractice).toHaveBeenCalledWith(true));
  expect(screen.getByText(words.practiceNote)).toBeTruthy();
  expect(screen.getByText(words.skip)).toBeTruthy();
  events.onInserted?.({ ok: false, newlinesLost: false, practice: true });
  events.onInserted?.({ ok: true, newlinesLost: false, practice: false });
  expect(screen.queryByText(words.tryDone)).toBeNull();
  events.onInserted?.({ ok: true, newlinesLost: false, practice: true });
  expect(await screen.findByText(words.tryDone)).toBeTruthy();
  expect(screen.getByText(words.tryDoneTitle)).toBeTruthy();
  expect(screen.queryByText(words.tryTitle)).toBeNull();
  expect(screen.getByRole('button', { name: words.continueLabel })).toBeTruthy();
  expect(screen.queryByText(words.skip)).toBeNull();
  await screen.unmount();
  await waitFor(() => expect(native.setPractice).toHaveBeenLastCalledWith(false));
});

test('practiceStepRemembersItsInsert', async () => {
  at('TRY', true);
  const screen = await renderSetup();
  expect(await screen.findByText(words.tryDone)).toBeTruthy();
});

test('leavingByBackCountsAsDone', async () => {
  const screen = await renderSetup();
  await screen.findByText(words.welcomeTitle);
  expect(backHandlers.length).toBeGreaterThan(0);
  backHandlers.forEach(fire => fire());
  await waitFor(() => expect(kv.get('setup-done')).toBe('true'));
  expect(kv.has('setup')).toBe(false);
});

// How Ownvoice writes: the choice after Welcome, with the ChatGPT sign-in inside the same step.
const radio = (screen: Awaited<ReturnType<typeof renderSetup>>, name: string) => screen.getByRole('radio', { name: new RegExp(`^${name}`) });
const signInWithChatGpt = async (screen: Awaited<ReturnType<typeof renderSetup>>) => {
  await fireEvent.press(await screen.findByText(words.srcGpt));
  await fireEvent.press(screen.getByText(words.continueLabel));
};

test('theChoiceDefaultsToThisPhoneWhereItCanWrite', async () => {
  at('CHOOSE');
  const screen = await renderSetup();
  expect(await screen.findByText(words.chooseNote)).toBeTruthy();
  expect(screen.getByTestId('setup-steps').props.accessibilityValue).toEqual({ min: 1, max: 4, now: 1 });
  for (const line of [words.srcPhoneSub, words.tradePhone1, words.tradePhone2, words.tradePhone3, words.srcGptSub, words.tradeGpt1, words.tradePlan2.replace('{name}', 'ChatGPT'), words.tradePlan3.replace('{name}', 'ChatGPT')]) expect(screen.getByText(line)).toBeTruthy();
  expect(radio(screen, words.srcPhone).props.accessibilityState).toEqual({ checked: true, disabled: false });
  expect(radio(screen, words.srcGpt).props.accessibilityState).toEqual({ checked: false, disabled: false });
  expect(screen.queryByText(words.notNow)).toBeNull();
  await fireEvent.press(screen.getByText(words.continueLabel));
  expect(await screen.findByText(words.permissionTitle)).toBeTruthy();
  expect(kv.get('writer-source')).toBe('"phone"');
  expect(await screen.findByText(words.promiseStays)).toBeTruthy();
  expect(accountsSignIn).not.toHaveBeenCalled();
});

test('choosingChatGptSignsInInsideTheStepThenPromisesChatGpt', async () => {
  at('CHOOSE');
  const screen = await renderSetup();
  await signInWithChatGpt(screen);
  expect(await screen.findByText(words.signInTitle)).toBeTruthy();
  expect(screen.getByTestId('sign-in-code').props.children).toBe('KQPT-MXVD');
  expect(screen.getByText(words.waiting)).toBeTruthy();
  expect(screen.getByText('Uses your ChatGPT plan. OpenAI may change this at any time.')).toBeTruthy();
  expect(screen.getByTestId('setup-steps').props.accessibilityValue.now).toBe(1);
  await fireEvent.press(screen.getByText(words.copyAndOpen));
  expect(native.copy).toHaveBeenCalledWith('KQPT-MXVD');
  expect(Linking.openURL).toHaveBeenCalledWith('https://chatgpt.com/code');
  expect(kv.get('writer-source')).toBeUndefined();
  // The person approves on the ChatGPT page; the step notices by itself.
  simulateSignInComplete();
  expect(await screen.findByText(words.connectedNote, {}, { timeout: 3000 })).toBeTruthy();
  expect(screen.getByText('Signed in to ChatGPT')).toBeTruthy();
  expect(screen.getByText(`${words.privacyGpt} ${words.sentOnlyOnTap}`)).toBeTruthy();
  await fireEvent.press(screen.getByText(words.continueLabel));
  expect(await screen.findByText(words.permissionTitle)).toBeTruthy();
  expect(kv.get('writer-source')).toBe('"chatgpt"');
  expect(await screen.findByText('Sent to ChatGPT')).toBeTruthy();
  expect(screen.getByText('Only when you tap Insert')).toBeTruthy();
  expect(screen.queryByText(words.promiseStays)).toBeNull();
  await screen.unmount();
  // Process death after the choice: the permission comes back, still showing ChatGPT.
  const again = await renderSetup();
  expect(await again.findByText('Sent to ChatGPT')).toBeTruthy();
});

test('alreadySignedInGoesStraightToConnected', async () => {
  at('CHOOSE');
  simulateSignInComplete();
  const screen = await renderSetup();
  await signInWithChatGpt(screen);
  expect(await screen.findByText(words.connectedNote)).toBeTruthy();
  expect(accountsSignIn).not.toHaveBeenCalled();
});

test.each([['Back', true], ['Cancel', false]])('%sFromSignInReturnsToTheChoiceAndKeepsNothing', async (_, hardware) => {
  at('CHOOSE');
  const screen = await renderSetup();
  await signInWithChatGpt(screen);
  await screen.findByTestId('sign-in-code');
  if (hardware) await act(async () => { backHandlers.forEach(fire => fire()); });
  else await fireEvent.press(screen.getByText('Cancel'));
  expect(await screen.findByText(words.chooseTitle)).toBeTruthy();
  expect(accountsCancel).toHaveBeenCalledTimes(1);
  expect(kv.get('setup-done')).toBeUndefined();
  expect(kv.get('writer-source')).toBeUndefined();
  expect(kv.get('setup')).toContain('CHOOSE');
  // A late sign-in completion doesn't bring it back after cancel
  await act(async () => { await new Promise(r => setTimeout(r, 1200)); });
  expect(screen.queryByText(words.connectedNote)).toBeNull();
});

test('pickingThePhoneThatNeedsItsDownloadAsksWithTheSizeAndGetItReadyIsTheYes', async () => {
  at('CHOOSE');
  mockState.mockResolvedValue({ phase: 'not-installed' });
  const screen = await renderSetup();
  // This phone is picked by default: the ask and its size show, and the button says what it does.
  expect(await screen.findByText(words.readyTitle)).toBeTruthy();
  expect(screen.getByText(words.readyNote)).toBeTruthy();
  expect(screen.queryByText(words.continueLabel)).toBeNull();
  // Picking ChatGPT takes the ask away.
  await fireEvent.press(screen.getByText(words.srcGpt));
  expect(screen.queryByText(words.readyTitle)).toBeNull();
  expect(screen.getByText(words.continueLabel)).toBeTruthy();
  await fireEvent.press(screen.getByText(words.srcPhone));
  expect(mockInstall).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText(words.getReady));
  await waitFor(() => expect(mockInstall).toHaveBeenCalledWith(false, expect.any(Function), expect.any(AbortSignal)));
  expect(kv.get(AGREED_KEY)).toBe('true');
  expect(kv.get('writer-source')).toBe('"phone"');
  expect(await screen.findByText(words.permissionTitle)).toBeTruthy();
});

test('aPhoneThatIsReadyOrCantNeverShowsTheAsk', async () => {
  at('CHOOSE');
  const ready = await renderSetup();
  expect(await ready.findByText(words.tradePhone1)).toBeTruthy();
  expect(ready.queryByText(words.readyTitle)).toBeNull();
  expect(ready.getByText(words.continueLabel)).toBeTruthy();
  await ready.unmount();
  mockState.mockResolvedValue({ phase: 'unsupported' });
  const cant = await renderSetup();
  expect(await cant.findByText(words.srcPhoneCant)).toBeTruthy();
  expect(cant.queryByText(words.readyTitle)).toBeNull();
});

test('anAgreedDownloadPicksUpWhereItStopped', async () => {
  kv.set(AGREED_KEY, 'true');
  mockState.mockResolvedValue({ phase: 'not-installed' });
  await renderSetup();
  await waitFor(() => expect(mockInstall).toHaveBeenCalledWith(false, expect.any(Function), expect.any(AbortSignal)));
});

test('usePhoneInsteadWhereTheDownloadIsNeededGoesBackToTheAsk', async () => {
  at('CHOOSE');
  mockState.mockResolvedValue({ phase: 'not-installed' });
  (accountsSignIn as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  const screen = await renderSetup();
  await fireEvent.press(await screen.findByText(words.srcGpt));
  await fireEvent.press(screen.getByText(words.continueLabel));
  await fireEvent.press(await screen.findByText(words.usePhoneInstead));
  expect(await screen.findByText(words.readyTitle)).toBeTruthy();
  expect(mockInstall).not.toHaveBeenCalled();
  expect(kv.get('writer-source')).toBeUndefined();
});

test('aFailedSignInSaysWhyAndOffersThePhone', async () => {
  at('CHOOSE');
  (accountsSignIn as jest.Mock).mockImplementationOnce(async () => {
    (accounts as any).__mockState.setSignInView({ state: 'failed', error: 'The code expired before it was used. Tap Sign in with ChatGPT for a new one.' });
  });
  const screen = await renderSetup();
  await signInWithChatGpt(screen);
  expect(await screen.findByText('The code expired before it was used. Tap Sign in with ChatGPT for a new one.')).toBeTruthy();
  await fireEvent.press(screen.getByText(words.tryAgain));
  expect(await screen.findByTestId('sign-in-code')).toBeTruthy();
  (accountsSignIn as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  await act(async () => { backHandlers.forEach(fire => fire()); });
  await signInWithChatGpt(screen);
  expect(await screen.findByText(words.failed)).toBeTruthy();
  await fireEvent.press(screen.getByText(words.usePhoneInstead));
  expect(await screen.findByText(words.permissionTitle)).toBeTruthy();
  expect(kv.get('writer-source')).toBe('"phone"');
});

test('whereThePhoneCantWriteChatGptLeadsAndNotNowEndsSetup', async () => {
  at('CHOOSE');
  mockState.mockResolvedValue({ phase: 'unsupported' });
  const screen = await renderSetup();
  expect(await screen.findByText(words.chooseNoteCant)).toBeTruthy();
  expect(screen.getByText(words.srcPhoneCant)).toBeTruthy();
  expect(screen.queryByText(words.tradePhone1)).toBeNull();
  expect(radio(screen, words.srcGpt).props.accessibilityState).toEqual({ checked: true, disabled: false });
  expect(screen.queryByText(words.phoneCantWhy)).toBeNull();
  await fireEvent.press(screen.getByText(words.srcPhone));
  expect(screen.getByText(words.phoneCantWhy)).toBeTruthy();
  expect(radio(screen, words.srcGpt).props.accessibilityState).toEqual({ checked: true, disabled: false });
  expect(screen.queryByText(words.continueLabel)).toBeNull();
  await fireEvent.press(screen.getByText(words.notNow));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  expect(kv.get('setup-done')).toBe('true');
  expect(kv.get('writer-source')).toBeUndefined();
  expect(native.setPractice).not.toHaveBeenCalledWith(true);
});

test('whereThePhoneCantWriteAFailedSignInOffersOnlyTryAgain', async () => {
  at('CHOOSE');
  mockState.mockResolvedValue({ phase: 'unsupported' });
  (accountsSignIn as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  const screen = await renderSetup();
  await fireEvent.press(await screen.findByText('Sign in'));
  expect(await screen.findByText(words.tryAgain)).toBeTruthy();
  expect(screen.queryByText(words.usePhoneInstead)).toBeNull();
});

test('aSignInStillWaitingComesBackAfterTheScreenIsRebuilt', async () => {
  at('CHOOSE');
  setAccountsWaiting();
  const screen = await renderSetup();
  expect(await screen.findByTestId('sign-in-code')).toBeTruthy();
});

test('backWhileTheCodeIsBeingMadeDropsItWhenItArrives', async () => {
  at('CHOOSE');
  // Leaving while signIn() itself is still running: the code it made is dropped.
  let release!: () => void;
  (accountsSignIn as jest.Mock).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  const screen = await renderSetup();
  await screen.findByText(words.tradeGpt1);
  await signInWithChatGpt(screen);
  // The sign-in was really started before leaving: otherwise this test is vacuous.
  await waitFor(() => expect(accountsSignIn).toHaveBeenCalledTimes(1));
  const cancels = (accountsCancel as jest.Mock).mock.calls.length;
  await act(async () => { backHandlers.forEach(fire => fire()); });
  await act(async () => { release(); });
  await waitFor(() => expect((accountsCancel as jest.Mock).mock.calls.length).toBeGreaterThan(cancels));
  expect(screen.queryByTestId('sign-in-code')).toBeNull();
  expect(await screen.findByText(words.chooseTitle)).toBeTruthy();
});

test.each([[true], [false]])('backFromConnectedKeepsNothingStored (fresh sign-in: %s)', async (fresh: boolean) => {
  at('CHOOSE');
  if (!fresh) simulateSignInComplete();
  const screen = await renderSetup();
  await signInWithChatGpt(screen);
  if (fresh) {
    // A code first; the approval lands afterwards and the step notices by itself.
    await screen.findByTestId('sign-in-code');
    simulateSignInComplete();
  }
  expect(await screen.findByText(words.connectedNote, {}, { timeout: 3000 })).toBeTruthy();
  await act(async () => { backHandlers.forEach(fire => fire()); });
  expect(await screen.findByText(words.chooseTitle)).toBeTruthy();
  // Backing out of setup never signs out: an account connected just now stays connected.
  expect(accountsSignOut).not.toHaveBeenCalled();
  expect(kv.get('writer-source')).toBeUndefined();
});

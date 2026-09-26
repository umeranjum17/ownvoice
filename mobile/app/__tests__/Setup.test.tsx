import React from 'react';
import { AccessibilityInfo, BackHandler } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Setup from '../setup';
import Native from '../../modules/ownvoice-native';
import { words } from '../../src/core/words';

jest.mock('../../modules/ownvoice-native', () => ({
  __esModule: true,
  default: {
    modelStatus: jest.fn(), downloadModel: jest.fn(), serviceState: jest.fn(), launcherApps: jest.fn(),
    bubbleRules: jest.fn(), setBubbleRules: jest.fn(), setPractice: jest.fn(),
    openAccessibilitySettings: jest.fn(), openAppInfo: jest.fn(), addListener: jest.fn(),
  },
}));

const native = Native as jest.Mocked<typeof Native>;
const kv = (jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>);
const events: Record<string, (event: { state?: string; ok?: boolean; newlinesLost?: boolean }) => void> = {};
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
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  native.modelStatus.mockResolvedValue('available');
  native.downloadModel.mockResolvedValue(undefined as never);
  native.serviceState.mockResolvedValue('off');
  native.launcherApps.mockResolvedValue([
    { app: 'com.google.android.gm', label: 'Gmail', icon: null },
    { app: 'com.whatsapp', label: 'WhatsApp', icon: null },
    { app: 'com.android.chrome', label: 'Chrome', icon: null },
  ]);
  native.bubbleRules.mockResolvedValue({ paused: false, on: [], off: [] });
  native.setBubbleRules.mockResolvedValue(undefined as never);
  native.setPractice.mockResolvedValue(undefined as never);
  native.openAccessibilitySettings.mockResolvedValue(undefined as never);
  native.openAppInfo.mockResolvedValue(undefined as never);
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

test('welcomeStartsTheDownloadAndMovesToPermission', async () => {
  native.modelStatus.mockResolvedValue('downloadable');
  const screen = await renderSetup();
  expect(await screen.findByText(words.welcomeTitle)).toBeTruthy();
  await waitFor(() => expect(native.downloadModel).toHaveBeenCalled());
  await fireEvent.press(screen.getByText(words.continueLabel));
  expect(await screen.findByText(words.permissionTitle)).toBeTruthy();
  expect(kv.get('setup')).toContain('PERMISSION');
  await screen.unmount();
  // The step survives process death (S7), so a remount comes back to it.
  const again = await renderSetup();
  expect(await again.findByText(words.permissionTitle)).toBeTruthy();
});

test('alreadyOnSkipsThePermission', async () => {
  native.serviceState.mockResolvedValue('on');
  const screen = await renderSetup();
  expect(await screen.findByText(words.welcomeTitle)).toBeTruthy();
  await fireEvent.press(screen.getByText(words.continueLabel));
  expect(await screen.findByText(words.tryTitle)).toBeTruthy();
});

test('permissionExplainsAndOpensTheSwitch', async () => {
  at('PERMISSION');
  const screen = await renderSetup();
  expect(await screen.findByText(words.permissionSubtitle)).toBeTruthy();
  expect(screen.getByText(words.promiseTap)).toBeTruthy();
  expect(screen.getByText(words.promisePhone)).toBeTruthy();
  expect(screen.getByText(words.promiseSend)).toBeTruthy();
  expect(screen.getByText(words.switchRowAction, { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getByText(words.fullControl)).toBeTruthy();
  await fireEvent.press(screen.getByText(words.turnOn));
  expect(native.openAccessibilitySettings).toHaveBeenCalled();
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

test('notNowSkipsPracticeWhenAppsRemain', async () => {
  const screen = await renderSetup();
  await fireEvent.press(await screen.findByText(words.continueLabel));
  await fireEvent.press(await screen.findByText(words.notNow));
  expect(await screen.findByText(words.appsTitle)).toBeTruthy();
  // Only installed apps among the offered ones, in the list's order (S5).
  expect(screen.getByText('WhatsApp')).toBeTruthy();
  expect(screen.getByText('Gmail')).toBeTruthy();
  expect(screen.queryByText('X')).toBeNull();
  expect(screen.queryByText('Chrome')).toBeNull();
});

test('notNowWithNoOfferedAppsFinishesSetup', async () => {
  native.launcherApps.mockResolvedValue([{ app: 'com.android.chrome', label: 'Chrome', icon: null }]);
  const screen = await renderSetup();
  await fireEvent.press(await screen.findByText(words.continueLabel));
  await fireEvent.press(await screen.findByText(words.notNow));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  expect(kv.get('setup-done')).toBe('true');
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
  expect(router.replace).toHaveBeenCalledWith('/');
  expect(kv.get('setup-done')).toBe('true');
});

test('practiceLetsTheBubbleWorkOnlyThereAndEndsOnInsert', async () => {
  at('TRY');
  native.serviceState.mockResolvedValue('on');
  const screen = await renderSetup();
  expect(await screen.findByText(words.tryInsert)).toBeTruthy();
  await waitFor(() => expect(native.setPractice).toHaveBeenCalledWith(true));
  expect(screen.getByText(words.practiceNote)).toBeTruthy();
  expect(screen.getByText(words.skip)).toBeTruthy();
  events.onInserted?.({ ok: true, newlinesLost: false });
  expect(await screen.findByText(words.tryDone)).toBeTruthy();
  expect(screen.getByText(words.continueLabel)).toBeTruthy();
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
  expect(kv.get('setup-done')).toBe('true');
  expect(kv.has('setup')).toBe(false);
});

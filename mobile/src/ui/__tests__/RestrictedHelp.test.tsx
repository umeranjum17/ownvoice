import React from 'react';
import { AppState, Appearance, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { RestrictedCard, useRestricted } from '../RestrictedHelp';
import { words, technicalWords } from '../../core/words';
import Native from '../../../modules/ownvoice-native';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: { restrictedSettings: jest.fn(), openAppInfo: jest.fn(async () => {}) } }));
const native = Native as jest.Mocked<typeof Native>;

// The permission step's use: asked while the step shows, asked again on each return to the app.
function Step({ active = true }: { active?: boolean }) { return <RestrictedCard view={useRestricted(active)} />; }

let comeBack: ((state: string) => void) | null = null;
beforeEach(() => {
  jest.clearAllMocks();
  Appearance.setColorScheme('light');
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => { comeBack = listener as (state: string) => void; return { remove: () => { comeBack = null; } } as ReturnType<typeof AppState.addEventListener>; });
});
const returnToApp = () => act(async () => { comeBack?.('active'); });

const STEPS = [words.restrictedOpen, words.restrictedDots, words.restrictedAllow, words.restrictedBack];

test('blocked before any try: the greyed switch comes first, then App info, the three dots, allow, come back', async () => {
  native.restrictedSettings.mockResolvedValue('blocked');
  const screen = await render(<Step />);
  await screen.findByTestId('restricted-card');
  expect(screen.getByText(words.restrictedTitle)).toBeTruthy();
  expect(screen.getByText(words.restrictedTryFirst)).toBeTruthy();
  for (const step of STEPS) expect(screen.getAllByText(step).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/^[1-5]$/).map(n => n.props.children)).toEqual([1, 2, 3, 4, 5]);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: words.restrictedOpen })); });
  expect(native.openAppInfo).toHaveBeenCalledTimes(1);
});

test('after the person tried the switch, coming back shows the four App info steps', async () => {
  native.restrictedSettings.mockResolvedValueOnce('blocked').mockResolvedValue('tried');
  const screen = await render(<Step />);
  await screen.findByText(words.restrictedTryFirst);
  await returnToApp();
  expect(screen.queryByText(words.restrictedTryFirst)).toBeNull();
  expect(screen.getAllByText(/^[1-4]$/).map(n => n.props.children)).toEqual([1, 2, 3, 4]);
  expect(native.restrictedSettings).toHaveBeenCalledTimes(2);
});

test('once allowed in App info, coming back says it worked; an app never blocked shows nothing', async () => {
  native.restrictedSettings.mockResolvedValueOnce('tried').mockResolvedValue('clear');
  const screen = await render(<Step />);
  await screen.findByTestId('restricted-card');
  await returnToApp();
  expect(screen.queryByTestId('restricted-card')).toBeNull();
  expect(screen.getByText(words.restrictedLifted)).toBeTruthy();

  native.restrictedSettings.mockReset().mockResolvedValue('clear');
  const clean = await render(<Step />);
  await act(async () => {});
  expect(clean.toJSON()).toBeNull();
});

test('off the permission step nothing is asked', async () => {
  const screen = await render(<Step active={false} />);
  expect(native.restrictedSettings).not.toHaveBeenCalled();
  expect(screen.toJSON()).toBeNull();
});

test('plain words, drawn in the light and the dark theme', async () => {
  native.restrictedSettings.mockResolvedValue('blocked');
  const fills: unknown[] = [];
  for (const scheme of ['light', 'dark'] as const) {
    Appearance.setColorScheme(scheme);
    const screen = await render(<Step />);
    fills.push(StyleSheet.flatten((await screen.findByTestId('restricted-card')).props.style).backgroundColor);
    screen.unmount();
  }
  expect(fills[0]).not.toEqual(fills[1]);
  expect([words.restrictedTitle, words.restrictedNote, words.restrictedTryFirst, ...STEPS, words.restrictedLifted].filter(line => technicalWords.test(line))).toEqual([]);
});

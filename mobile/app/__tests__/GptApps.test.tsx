import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import PhoneApps from '../phone-apps';
import { PHONE_ONLY_KEY, getSource, phoneOnly } from '../../src/core/source';
import { words } from '../../src/core/words';
import { store } from '../../src/core/store';
import Native from '../../modules/ownvoice-native';

// Apps that stay on this phone (the old ChatGPT app list, turned around): each tap saves.
jest.mock('../../src/chatgpt/session', () => ({
  GPT_APPS_KEY: 'chatgpt-apps',
  mocked: false,
  signOutGuard: jest.fn(() => ({ active: false, epoch: 0 })),
  session: { current: jest.fn(async () => ({ signedIn: true })) },
}));

jest.mock('../../modules/ownvoice-native', () => ({
  __esModule: true,
  default: {
    launcherApps: jest.fn(async (named: string[] | null) => [
      { app: 'com.google.android.gm', label: 'Gmail', icon: null },
      { app: 'com.Slack', label: 'Slack', icon: null },
      { app: 'com.android.chrome', label: 'Chrome', icon: null },
    ].filter(({ app }) => !named || named.includes(app))),
    bubbleRules: jest.fn(async () => ({ paused: false, on: ['com.Slack'], off: [] })),
  },
}));

const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;
beforeEach(() => {
  kv.clear();
  kv.set('setup-done', 'true');
  jest.clearAllMocks();
});

const stays = (screen: Awaited<ReturnType<typeof render>>, label: string) => screen.getByLabelText(label).props.value;

test('only apps the bubble shows in are listed, with Slack staying on the phone to start', async () => {
  const screen = await render(<PhoneApps />);
  await screen.findByText('Gmail');
  expect(screen.getByText(words.phoneOnlyApps)).toBeTruthy();
  expect(screen.getByText(words.phoneOnlyNote)).toBeTruthy();
  expect(screen.queryByText('Chrome')).toBeNull();
  expect(stays(screen, 'Slack')).toBe(true);
  expect(stays(screen, 'Gmail')).toBe(false);
  expect(kv.has(PHONE_ONLY_KEY)).toBe(false);
});

test('each tap saves at once, both ways', async () => {
  const screen = await render(<PhoneApps />);
  await screen.findByText('Gmail');
  await act(async () => { fireEvent.press(screen.getByText('Gmail')); });
  expect(phoneOnly()).toEqual(['com.Slack', 'com.google.android.gm']);
  expect(stays(screen, 'Gmail')).toBe(true);
  await act(async () => { fireEvent.press(screen.getByText('Slack')); });
  expect(phoneOnly()).toEqual(['com.google.android.gm']);
  expect(stays(screen, 'Slack')).toBe(false);
  expect(router.dismissAll).not.toHaveBeenCalled();
});

test('rows stay where they are while tapping', async () => {
  const screen = await render(<PhoneApps />);
  await screen.findByText('Gmail');
  const order = () => screen.getAllByRole('switch').map(node => node.props.accessibilityLabel);
  const before = order();
  await act(async () => { fireEvent.press(screen.getByText('Gmail')); });
  expect(order()).toEqual(before);
});

test('choices for apps the bubble hides are kept', async () => {
  store.set(PHONE_ONLY_KEY, ['com.whatsapp', 'com.google.android.gm']);
  const screen = await render(<PhoneApps />);
  await screen.findByText('Gmail');
  await act(async () => { fireEvent.press(screen.getByText('Gmail')); });
  await act(async () => { fireEvent.press(screen.getByText('Slack')); });
  expect(phoneOnly()).toEqual(['com.whatsapp', 'com.Slack']);
});

test('an unreadable list shows no defaults, and Try again brings back what was saved', async () => {
  store.set(PHONE_ONLY_KEY, ['com.Slack']);
  const storage = jest.requireMock('expo-sqlite/kv-store').default;
  let reads = 0;
  const get = jest.spyOn(storage, 'getItemSync').mockImplementation((key: unknown) => {
    if (key === PHONE_ONLY_KEY && ++reads === 1) throw new Error('unavailable');
    return kv.get(key as string) ?? null;
  });
  const screen = await render(<PhoneApps />);
  try {
    await screen.findByText(words.gptAppsUnavailable);
    expect(screen.queryByText('Gmail')).toBeNull();
  } finally {
    get.mockRestore();
  }
  await fireEvent.press(screen.getByText(words.tryAgain));
  await screen.findByText('Gmail');
  expect(stays(screen, 'Slack')).toBe(true);
  expect(screen.queryByText(words.gptAppsUnavailable)).toBeNull();
});

test('a failed save says so, keeps the list as it was, and the next tap can work', async () => {
  const screen = await render(<PhoneApps />);
  await screen.findByText('Gmail');
  const set = jest.spyOn(store, 'set').mockImplementationOnce(() => { throw new Error('full'); });
  try {
    await act(async () => { fireEvent.press(screen.getByText('Gmail')); });
    expect(screen.getByText(words.gptAppsSaveFailed)).toBeTruthy();
    expect(kv.has(PHONE_ONLY_KEY)).toBe(false);
    expect(stays(screen, 'Gmail')).toBe(false);
  } finally {
    set.mockRestore();
  }
  await act(async () => { fireEvent.press(screen.getByText('Gmail')); });
  expect(phoneOnly()).toEqual(['com.Slack', 'com.google.android.gm']);
  expect(screen.queryByText(words.gptAppsSaveFailed)).toBeNull();
});

test('an older ChatGPT app list becomes this list before it shows', async () => {
  kv.set('chatgpt-apps', JSON.stringify({ on: ['com.google.android.gm', 'com.twitter.android'] }));
  const screen = await render(<PhoneApps />);
  await screen.findByText('Gmail');
  expect(await getSource()).toBe('chatgpt');
  expect(stays(screen, 'Gmail')).toBe(false);
  expect(stays(screen, 'Slack')).toBe(true);
  expect([...phoneOnly()].sort()).toEqual(['com.linkedin.android', 'com.whatsapp', 'com.whatsapp.w4b', 'com.reddit.frontpage', 'com.Slack'].sort());
});

test('the old list address lands here', async () => {
  const Moved = require('../gptapps').default;
  const screen = await render(<Moved />);
  expect(screen.toJSON()).toMatchObject({ type: 'Redirect', props: { href: '/phone-apps' } });
});

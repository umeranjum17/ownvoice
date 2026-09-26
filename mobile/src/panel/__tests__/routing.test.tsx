import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Panel from '../Panel';
import Native, { type Capture } from '../../../modules/ownvoice-native';
import { words } from '../../core/words';
import { CHATGPT_OFF } from '../../core/switch';
import { routeWriters, type Writer } from '../../core/writers';

jest.mock('../../../modules/ownvoice-native', () => ({
  __esModule: true,
  default: {
    addListener: jest.fn(() => ({ remove: () => {} })),
    capture: jest.fn(), serviceState: jest.fn(async () => 'on'), insert: jest.fn(), copy: jest.fn(),
    modelStatus: jest.fn(async () => 'available'), ask: jest.fn(), closePanel: jest.fn(), bubbleRules: jest.fn(),
  },
}));

const native = Native as jest.Mocked<typeof Native>;
const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;

const writer = (prefix: string): Writer => ({
  write: async (_request, on = {}) => {
    if (prefix === 'ChatGPT') on.sent?.();
    const drafts = [`${prefix} one`, `${prefix} two`, `${prefix} three`];
    drafts.forEach((text, slot) => on.landed?.(text, slot));
    return { drafts };
  },
});
const broken: Writer = { write: async (_request, on) => { on?.sent?.(); throw new Error(words.chatgptFailed); } };

const open = async (options: Pick<Parameters<typeof routeWriters>[0], 'chatgpt'> & Partial<Omit<Parameters<typeof routeWriters>[0], 'chatgpt'>>, capture?: Partial<Capture>) => {
  native.capture.mockResolvedValue({
    conversation: 'Sam: Are we still on for Saturday?', written: 'Sam: Are we still on for Saturday?',
    nodes: [], fieldTop: null, typed: '', app: 'com.twitter.android', label: 'X', at: 0, hasField: true,
    ...capture,
  });
  const screen = await render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
    <Panel select={async () => routeWriters({ allowed: true, enabled: true, signedIn: true, phone: writer('Phone'), ...options })} />
  </SafeAreaProvider>);
  await waitFor(() => expect(native.capture).toHaveBeenCalled());
  return screen;
};
const shown = (screen: { toJSON: () => unknown }) => JSON.stringify(screen.toJSON());
const loggedRead = () => (JSON.parse(kv.get('reads') ?? '[]') as { summary: string; app: string }[]).at(-1);
const times = (text: string, needle: string) => text.split(needle).length - 1;

beforeEach(() => { kv.clear(); jest.clearAllMocks(); });

test('ChatGPT writes, the drafts say nothing about it, and the read log notes the send', async () => {
  const screen = await open({ chatgpt: () => writer('ChatGPT') });
  await waitFor(() => expect(shown(screen)).toContain('ChatGPT one'));
  expect(shown(screen)).not.toContain(CHATGPT_OFF);
  expect(shown(screen)).not.toContain(words.fallback);
  expect(loggedRead()).toMatchObject({ app: 'com.twitter.android', summary: 'Suggested replies. Read the chat on screen. Sent to ChatGPT.' });
});

test('when ChatGPT cannot write, the phone does and the panel says so once', async () => {
  const screen = await open({ chatgpt: () => broken });
  await waitFor(() => expect(shown(screen)).toContain('Phone one'));
  expect(times(shown(screen), words.fallback)).toBe(1);
  expect(loggedRead()?.summary).toContain('Sent to ChatGPT.');
});

test('the off switch keeps the drafts on the phone and says which wrote them', async () => {
  const screen = await open({ chatgpt: () => writer('ChatGPT'), enabled: false });
  await waitFor(() => expect(shown(screen)).toContain('Phone one'));
  expect(shown(screen)).not.toContain('ChatGPT one');
  expect(times(shown(screen), CHATGPT_OFF)).toBe(1);
  expect(loggedRead()?.summary).not.toContain('ChatGPT');
});

test('a screen with nothing to help with is logged as nothing read', async () => {
  const screen = await open({ chatgpt: () => writer('ChatGPT') }, { conversation: '', written: '' });
  await waitFor(() => expect(shown(screen)).toContain(words.writeFirst));
  expect(shown(screen)).not.toContain('ChatGPT one');
  expect(loggedRead()?.summary).toBe('Nothing to help with. Nothing was on screen.');
});

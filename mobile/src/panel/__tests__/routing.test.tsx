import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Panel from '../Panel';
import Native, { type Capture, type TapFact } from '../../../modules/ownvoice-native';
import { syncReadLog } from '../../core/readLog';
import { words } from '../../core/words';
import { CHATGPT_OFF } from '../../core/switch';
import { routeWriters, SendVeto, type Writer } from '../../core/writers';

jest.mock('../phoneWriter', () => ({ phoneWriter: { write: async (_request: unknown, on?: { landed?: (text: string, slot: number) => void }) => {
  const drafts = ['Phone one', 'Phone two', 'Phone three'];
  drafts.forEach((text, slot) => on?.landed?.(text, slot));
  return { drafts };
} } }));

jest.mock('../../../modules/ownvoice-native', () => ({
  __esModule: true,
  default: {
    addListener: jest.fn(() => ({ remove: () => {} })),
    capture: jest.fn(), serviceState: jest.fn(async () => 'on'), insert: jest.fn(), copy: jest.fn(),
    modelStatus: jest.fn(async () => 'available'), ask: jest.fn(), closePanel: jest.fn(), bubbleRules: jest.fn(),
    markTapSent: jest.fn(async () => {}), unmarkTapSent: jest.fn(async () => {}), takeTapFacts: jest.fn(),
  },
}));

const native = Native as jest.Mocked<typeof Native>;
const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;

const writer = (prefix: string): Writer => ({
  write: async (_request, on = {}) => {
    if (prefix === 'ChatGPT') {
      try { await on.sent?.(); } catch { throw new SendVeto(words.phoneWrote); }
      on.started?.();
    }
    const drafts = [`${prefix} one`, `${prefix} two`, `${prefix} three`];
    drafts.forEach((text, slot) => on.landed?.(text, slot));
    return { drafts };
  },
});
const broken: Writer = { write: async (_request, on) => { await on?.sent?.(); on?.started?.(); await on?.sent?.(); throw new Error(words.chatgptFailed); } };

const open = async (options: Pick<Parameters<typeof routeWriters>[0], 'chatgpt'> & Partial<Omit<Parameters<typeof routeWriters>[0], 'chatgpt'>>, capture?: Partial<Capture>, select?: (app: string) => Promise<ReturnType<typeof routeWriters>>) => {
  native.capture.mockResolvedValue({
    conversation: 'Sam: Are we still on for Saturday?', written: 'Sam: Are we still on for Saturday?',
    nodes: [], fieldTop: null, typed: 'Yes, still on for Saturday.', app: 'com.twitter.android', label: 'X', at: 0, id: 'tap-1', hasField: true,
    ...capture,
  });
  const screen = await render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
    <Panel select={select ?? (async () => routeWriters({ source: 'chatgpt', signedIn: true, phoneOnlyApp: false, enabled: true, phone: 'ready', phoneWriter: writer('Phone'), ...options }))} />
  </SafeAreaProvider>);
  await waitFor(() => expect(native.capture).toHaveBeenCalled());
  return screen;
};
const shown = (screen: { toJSON: () => unknown }) => JSON.stringify(screen.toJSON());
const sentTap = () => native.markTapSent.mock.calls.map(([id]) => id);
const times = (text: string, needle: string) => text.split(needle).length - 1;

beforeEach(() => { kv.clear(); jest.clearAllMocks(); });

test('ChatGPT writes, the drafts say nothing about it, and the read log notes the send', async () => {
  const screen = await open({ chatgpt: () => writer('ChatGPT') });
  await waitFor(() => expect(shown(screen)).toContain('ChatGPT one'));
  expect(shown(screen)).not.toContain(CHATGPT_OFF);
  expect(shown(screen)).not.toContain(words.fallback);
  expect(sentTap()).toEqual(['tap-1']);
  expect(kv.has('reads')).toBe(false);
});

test('one tap keeps one native fact after a repeated send and phone fallback', async () => {
  const facts: TapFact[] = [{ id: 'tap-1', at: Date.now(), app: 'com.twitter.android', label: 'X', screen: true, typed: false, replying: true, sent: false }];
  native.markTapSent.mockImplementation(async id => { const fact = facts.find(f => f.id === id); if (fact) fact.sent = true; });
  native.takeTapFacts.mockImplementation(async () => facts);
  const screen = await open({ chatgpt: () => broken });
  await waitFor(() => expect(shown(screen)).toContain('Phone one'));
  const rows = await syncReadLog();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: 'tap-1', app: 'com.twitter.android', summary: 'Suggested replies. Read the chat on screen. Sent to ChatGPT.' });
  expect(await syncReadLog()).toEqual(rows);
  expect(sentTap()).toEqual(['tap-1']);
  expect(kv.has('reads')).toBe(false);
});

test('when ChatGPT cannot write, the phone does and the panel says so once', async () => {
  const screen = await open({ chatgpt: () => broken });
  await waitFor(() => expect(shown(screen)).toContain('Phone one'));
  expect(times(shown(screen), words.fallback)).toBe(1);
  expect(sentTap()).toEqual(['tap-1']);
  expect(kv.has('reads')).toBe(false);
});

test('a pending request records the send before it finishes', async () => {
  let finish!: (value: { drafts: string[] }) => void;
  const pending: Writer = { write: (_request, on) => { on?.sent?.(); return new Promise(resolve => { finish = resolve; }); } };
  const screen = await open({ chatgpt: () => pending });
  await waitFor(() => expect(sentTap()).toEqual(['tap-1']));
  expect(kv.has('reads')).toBe(false);
  finish({ drafts: [] });
  await waitFor(() => expect(shown(screen)).toContain('Phone one'));
  expect(sentTap()).toEqual(['tap-1']);
});

test('a failed route selection uses the phone and leaves Writing', async () => {
  const screen = await open({ chatgpt: () => writer('ChatGPT') }, undefined, async () => { throw new Error('switch store failed'); });
  await waitFor(() => expect(shown(screen)).toContain('Phone one'));
  expect(shown(screen)).toContain(words.phoneWrote);
  expect(shown(screen)).not.toContain(words.fallback);
  expect(sentTap()).toEqual([]);
});

test('a failed native sent mark keeps drafting on the phone', async () => {
  native.markTapSent.mockRejectedValueOnce(new Error('full'));
  const screen = await open({ chatgpt: () => writer('ChatGPT') });
  await waitFor(() => expect(shown(screen)).toContain('Phone one'));
  expect(shown(screen)).not.toContain('ChatGPT one');
  expect(shown(screen)).toContain(words.phoneWrote);
  expect(shown(screen)).not.toContain(words.fallback);
  expect(sentTap()).toEqual(['tap-1']);
});

test('a final veto unmarks the native tap before phone fallback', async () => {
  const facts: TapFact[] = [{ id: 'tap-1', at: Date.now(), app: 'com.twitter.android', label: 'X', screen: true, typed: false, replying: true, sent: false }];
  native.markTapSent.mockImplementation(async id => { facts.find(f => f.id === id)!.sent = true; });
  native.unmarkTapSent.mockImplementation(async id => { facts.find(f => f.id === id)!.sent = false; });
  native.takeTapFacts.mockImplementation(async () => facts);
  const veto: Writer = { write: async (_request, on) => { await on?.sent?.(); await on?.unsent?.(); throw new Error(words.phoneWrote); } };
  const screen = await open({ chatgpt: () => veto });
  await waitFor(() => expect(shown(screen)).toContain('Phone one'));
  expect((await syncReadLog())[0].summary).not.toContain('Sent to ChatGPT');
  expect(native.unmarkTapSent).toHaveBeenCalledWith('tap-1');
});

test('a veto on Write new does not erase an earlier send for the same tap', async () => {
  let calls = 0;
  const retry: Writer = { write: async (_request, on) => {
    await on?.sent?.();
    if (++calls === 1) { on?.started?.(); on?.landed?.('First draft', 0); return { drafts: ['First draft', 'Second draft', 'Third draft'] }; }
    await on?.unsent?.();
    throw new Error(words.phoneWrote);
  } };
  const screen = await open({ chatgpt: () => retry });
  await waitFor(() => expect(shown(screen)).toContain('First draft'));
  fireEvent.press(screen.getByText(words.writeNew));
  await waitFor(() => expect(shown(screen)).toContain('Phone one'));
  expect(native.unmarkTapSent).not.toHaveBeenCalled();
});

test('the off switch keeps the drafts on the phone and says which wrote them', async () => {
  const screen = await open({ chatgpt: () => writer('ChatGPT'), enabled: false });
  await waitFor(() => expect(shown(screen)).toContain('Phone one'));
  expect(shown(screen)).not.toContain('ChatGPT one');
  expect(times(shown(screen), CHATGPT_OFF)).toBe(1);
  expect(sentTap()).toEqual([]);
});

test('with no source the panel says to choose first and marks nothing sent', async () => {
  const screen = await open({ chatgpt: () => writer('ChatGPT') }, undefined, async () => routeWriters({ source: null, signedIn: false, phoneOnlyApp: false, enabled: true, phone: 'cant', chatgpt: () => writer('ChatGPT'), phoneWriter: writer('Phone') }));
  await waitFor(() => expect(shown(screen)).toContain(words.needWriterPanel));
  expect(shown(screen)).not.toContain('Phone one');
  expect(shown(screen)).not.toContain('ChatGPT one');
  expect(sentTap()).toEqual([]);
  expect(kv.has('reads')).toBe(false);
});

test('choosing first offers to open Ownvoice, which closes the panel', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  native.closePanel.mockResolvedValue(undefined);
  const screen = await open({ chatgpt: () => writer('ChatGPT') }, undefined, async () => routeWriters({ source: null, signedIn: false, phoneOnlyApp: false, enabled: true, phone: 'cant', chatgpt: () => writer('ChatGPT'), phoneWriter: writer('Phone') }));
  await waitFor(() => expect(shown(screen)).toContain(words.openOwnvoice));
  expect(shown(screen)).not.toContain(words.tryAgain);
  fireEvent.press(screen.getByText(words.openOwnvoice));
  expect(openURL).toHaveBeenCalledWith('ownvoice://');
  await waitFor(() => expect(native.closePanel).toHaveBeenCalled());
});

test('ChatGPT failing on a phone that cannot write leaves Try again', async () => {
  const screen = await open({ chatgpt: () => broken, phone: 'cant' });
  await waitFor(() => expect(shown(screen)).toContain(words.gptFailedNoPhone));
  expect(shown(screen)).not.toContain('Phone one');
  expect(shown(screen)).toContain(words.tryAgain);
});

// A blank composer in a feed app is now his own post to start (see the own-post journey test).
// "Nothing to help with" is a screen with no focused field to write into at all.
test('a screen with nothing to help with is logged as nothing read', async () => {
  const screen = await open({ chatgpt: () => writer('ChatGPT') }, { conversation: '', written: '', typed: '', hasField: false });
  await waitFor(() => expect(shown(screen)).toContain(words.writeFirst));
  expect(shown(screen)).not.toContain('ChatGPT one');
  expect(shown(screen)).not.toContain(words.ownTitle);
  expect(sentTap()).toEqual([]);
  expect(kv.has('reads')).toBe(false);
});

// A blank feed composer has no line to write from, so it asks for that one line and writes
// nothing: a question he would have to post as his own post is not a draft.
test('a blank composer asks for the one line and shows no draft', async () => {
  const ask = jest.fn();
  const screen = await open({ chatgpt: () => { ask(); return writer('ChatGPT'); } }, { conversation: '', written: '', typed: '' });
  await waitFor(() => expect(shown(screen)).toContain(words.ownNote));
  expect(shown(screen)).toContain(`${words.ownTitle} · X`);
  expect(shown(screen)).not.toContain(words.writeFirst);
  expect(shown(screen)).not.toContain(words.replyWithheld);
  expect(screen.queryByRole('button', { name: words.useThis })).toBeNull();
  expect(ask).not.toHaveBeenCalled();
  expect(sentTap()).toEqual([]);
});

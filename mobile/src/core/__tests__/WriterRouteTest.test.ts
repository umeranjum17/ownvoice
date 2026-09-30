import { routeWriters, SendVeto, withPhoneFallback, type Writer } from '../writers';
import { CHATGPT_OFF } from '../switch';
import { summary } from '../privacy';
import { words } from '../words';
import type { PhoneCanWrite } from '../phoneStatus';
import type { Source } from '../source';

const phoneDrafts = ['phone one', 'phone two', 'phone three'];
const gptDrafts = ['gpt one', 'gpt two', 'gpt three'];
const request = { conversation: '', written: '', typed: '' };
const phone: Writer = { write: async () => ({ drafts: phoneDrafts }) };
const resting = 'ChatGPT is resting until 3:40pm.';
const signIn = "ChatGPT isn't signed in yet.";
const limit = 'ChatGPT is resting until 3:40pm.';

type ErrorKind = 'ok' | 'network' | 'account' | 'short' | 'veto' | 'offVeto';
const chatgptFor = (kind: ErrorKind): (() => Writer) => () => {
  switch (kind) {
    case 'ok': return { write: async () => ({ drafts: gptDrafts }) };
    case 'network': return { write: async () => { throw new Error('fetch failed'); } };
    case 'account': return { write: async () => { throw new Error(words.chatgptFailed); } };
    case 'short': return { write: async () => ({ drafts: ['only one'] }) };
    case 'veto': return { write: async () => { throw new SendVeto(words.phoneWrote); } };
    case 'offVeto': return { write: async () => { throw new SendVeto(CHATGPT_OFF); } };
  }
};

type Row = {
  label: string; source: Source; signedIn: boolean; phoneOnly: boolean; enabled: boolean;
  note?: string | null; phone: PhoneCanWrite; error: ErrorKind; limitNote?: boolean;
  want: { from: 'phone' | 'chatgpt' | 'throw'; line: string | null };
};
// Every section 5 routing row: source × sign-in × phone status × switch × error kind × phone-only membership.
const rows: Row[] = [
  { label: 'phone chosen means never ChatGPT, even when signed in', source: 'phone', signedIn: true, phoneOnly: false, enabled: true, phone: 'ready', error: 'ok', want: { from: 'phone', line: null } },
  { label: 'phone chosen stays on the phone when signed out and switched off', source: 'phone', signedIn: false, phoneOnly: true, enabled: false, phone: 'ready', error: 'account', want: { from: 'phone', line: null } },
  { label: 'no source tells the panel to choose first', source: null, signedIn: true, phoneOnly: false, enabled: true, phone: 'ready', error: 'ok', want: { from: 'throw', line: words.needWriterPanel } },
  { label: 'no source tells the panel to choose first on a phone that cannot write either', source: null, signedIn: false, phoneOnly: false, enabled: true, phone: 'cant', error: 'ok', want: { from: 'throw', line: words.needWriterPanel } },
  { label: 'an app that stays on this phone never reaches ChatGPT', source: 'chatgpt', signedIn: true, phoneOnly: true, enabled: true, phone: 'ready', error: 'ok', want: { from: 'phone', line: null } },
  { label: 'an app that stays on a phone that cannot write says how to change it, and never reaches ChatGPT', source: 'chatgpt', signedIn: true, phoneOnly: true, enabled: true, phone: 'cant', error: 'ok', want: { from: 'throw', line: words.phoneOnlyCant } },
  { label: 'signed out falls back to the phone when it can write', source: 'chatgpt', signedIn: false, phoneOnly: false, enabled: true, note: signIn, phone: 'ready', error: 'ok', want: { from: 'phone', line: null } },
  { label: 'signed out on a phone that cannot write says to sign in', source: 'chatgpt', signedIn: false, phoneOnly: false, enabled: true, note: signIn, phone: 'cant', error: 'ok', want: { from: 'throw', line: signIn } },
  { label: 'signed out on a phone that cannot write says to sign in even with no note from the session', source: 'chatgpt', signedIn: false, phoneOnly: false, enabled: true, phone: 'cant', error: 'ok', want: { from: 'throw', line: words.needWriterNote } },
  { label: 'the off switch hands the writing to the phone, with the reason said once', source: 'chatgpt', signedIn: true, phoneOnly: false, enabled: false, phone: 'ready', error: 'ok', want: { from: 'phone', line: CHATGPT_OFF } },
  { label: 'the off switch on a phone that cannot write says to try later', source: 'chatgpt', signedIn: true, phoneOnly: false, enabled: false, phone: 'cant', error: 'ok', want: { from: 'throw', line: words.gptOffNoPhone } },
  { label: 'a resting plan hands the writing to the phone, with byokits line said once', source: 'chatgpt', signedIn: true, phoneOnly: false, enabled: true, note: resting, phone: 'ready', error: 'ok', want: { from: 'phone', line: resting } },
  { label: 'a resting plan on a phone that cannot write says when it rests', source: 'chatgpt', signedIn: true, phoneOnly: false, enabled: true, note: resting, phone: 'cant', error: 'ok', want: { from: 'throw', line: resting } },
  { label: 'ChatGPT is the main writer when chosen, signed in and switched on', source: 'chatgpt', signedIn: true, phoneOnly: false, enabled: true, phone: 'ready', error: 'ok', want: { from: 'chatgpt', line: null } },
  { label: 'a phone that is still getting ready falls back like a ready one', source: 'chatgpt', signedIn: true, phoneOnly: false, enabled: true, phone: 'preparing', error: 'network', want: { from: 'phone', line: words.offlinePhone } },
  { label: 'no internet means the phone writes, and the panel says why once', source: 'chatgpt', signedIn: true, phoneOnly: false, enabled: true, phone: 'ready', error: 'network', want: { from: 'phone', line: words.offlinePhone } },
  { label: 'no internet on a phone that cannot write says to connect first', source: 'chatgpt', signedIn: true, phoneOnly: false, enabled: true, phone: 'cant', error: 'network', want: { from: 'throw', line: words.offlineNoPhone } },
  { label: 'ChatGPT failing means the phone writes, and the panel is told why once', source: 'chatgpt', signedIn: true, phoneOnly: false, enabled: true, phone: 'ready', error: 'account', want: { from: 'phone', line: words.fallback } },
  { label: 'a short answer is a failure too, so the panel never shows two drafts and a gap', source: 'chatgpt', signedIn: true, phoneOnly: false, enabled: true, phone: 'ready', error: 'short', want: { from: 'phone', line: words.fallback } },
  { label: 'ChatGPT failing on a phone that cannot write says it did not answer', source: 'chatgpt', signedIn: true, phoneOnly: false, enabled: true, phone: 'cant', error: 'account', want: { from: 'throw', line: words.gptFailedNoPhone } },
  { label: 'a limit gives the same tap byokits words over phone drafts', source: 'chatgpt', signedIn: true, phoneOnly: false, enabled: true, phone: 'ready', error: 'account', limitNote: true, want: { from: 'phone', line: limit } },
  { label: 'withdrawn consent means the phone writes, with the veto said once', source: 'chatgpt', signedIn: true, phoneOnly: false, enabled: true, phone: 'ready', error: 'veto', want: { from: 'phone', line: words.phoneWrote } },
  { label: 'withdrawn consent on a phone that cannot write says it did not answer', source: 'chatgpt', signedIn: true, phoneOnly: false, enabled: true, phone: 'cant', error: 'veto', want: { from: 'throw', line: words.gptFailedNoPhone } },
  { label: 'a switch that turns off mid-send on a phone that cannot write says to try later', source: 'chatgpt', signedIn: true, phoneOnly: false, enabled: true, phone: 'cant', error: 'offVeto', want: { from: 'throw', line: words.gptOffNoPhone } },
];

test.each(rows)('$label', async row => {
  const route = routeWriters({
    source: row.source, signedIn: row.signedIn, phoneOnlyApp: row.phoneOnly, enabled: row.enabled,
    note: row.note, phone: row.phone, chatgpt: chatgptFor(row.error), phoneWriter: phone,
    fallbackNote: row.limitNote ? async () => limit : undefined,
  });
  if (row.want.from === 'throw') {
    await expect(route.writer.write(request)).rejects.toThrow(row.want.line!);
    return;
  }
  const choice = await route.writer.write(request);
  expect(choice.drafts).toEqual(row.want.from === 'phone' ? phoneDrafts : gptDrafts);
  expect(choice.reason ?? route.note).toBe(row.want.line);
});

test('the phone writes on its own when ChatGPT is not in play', async () => {
  for (const options of [{ source: 'phone' as Source, signedIn: false }, { source: 'phone' as Source, signedIn: true }]) {
    const route = routeWriters({ ...options, phoneOnlyApp: false, enabled: true, phone: 'ready', chatgpt: chatgptFor('ok'), phoneWriter: phone });
    expect(route).toEqual({ writer: phone, note: null });
  }
});

test('ChatGPT is the main writer when it is chosen, signed in and not switched off', async () => {
  const route = routeWriters({ source: 'chatgpt', signedIn: true, phoneOnlyApp: false, enabled: true, phone: 'ready', chatgpt: chatgptFor('ok'), phoneWriter: phone });
  expect(route.note).toBeNull();
  expect(route.writer).not.toBe(phone);
  expect(await route.writer.write(request)).toEqual({ drafts: gptDrafts });
});

test('the off switch and a resting plan both hand the writing to the phone, with the reason said once', async () => {
  const base = { source: 'chatgpt' as Source, signedIn: true, phoneOnlyApp: false, phone: 'ready' as PhoneCanWrite, chatgpt: chatgptFor('ok'), phoneWriter: phone };
  expect(routeWriters({ ...base, enabled: false })).toEqual({ writer: phone, note: CHATGPT_OFF });
  expect(routeWriters({ ...base, enabled: true, note: resting })).toEqual({ writer: phone, note: resting });
});

test('without a phone status the fallback still reaches the phone', async () => {
  const short: Writer = { write: async () => ({ drafts: ['only one'] }) };
  expect(await withPhoneFallback(short, phone, request)).toEqual({ drafts: phoneDrafts, reason: words.fallback });
});

test('an unchanged answer from ChatGPT is kept, not passed to the phone as a failure', async () => {
  const same: Writer = { write: async () => ({ drafts: [], unchanged: true }) };
  const failing: Writer = { write: async () => { throw new Error(words.chatgptFailed); } };
  expect(await withPhoneFallback(same, failing, request)).toEqual({ drafts: [], unchanged: true });
  const none: Writer = { write: async () => ({ drafts: [] }) };
  expect(await withPhoneFallback(none, phone, request)).toEqual({ drafts: (await phone.write(request)).drafts, reason: words.fallback });
});

test('the read log says when a screen went to ChatGPT, and never says what it said', () => {
  const chat = 'Sam: Are we still on for Saturday?';
  expect(summary('REPLY', chat, '', true)).toBe('Suggested replies. Read the chat on screen. Sent to ChatGPT.');
  expect(summary('COMPOSE', '', 'my post', false)).toBe('Polished your message. Read your message.');
  for (const sent of [true, false]) expect(summary('REPLY', chat, 'mine', sent)).not.toContain('Sam');
});


test.each([1, 2, 3])('polish retains %i usable primary cards without phone fallback', async count => {
  const drafts = gptDrafts.slice(0, count);
  const primary: Writer = { write: async () => ({ drafts }) };
  const phone = { write: jest.fn(async () => ({ drafts: phoneDrafts })) };
  const reset = jest.fn();
  for (const status of ['ready', 'cant'] as const) {
    expect(await withPhoneFallback(primary, phone, { ...request, typed: 'Please bring the stove.' }, { reset }, undefined, status)).toEqual({ drafts });
  }
  expect(phone.write).not.toHaveBeenCalled();
  expect(reset).not.toHaveBeenCalled();
});

test('empty or blank polish still falls back and partial replies stay incomplete', async () => {
  const primary = (drafts: string[]): Writer => ({ write: async () => ({ drafts }) });
  for (const drafts of [[], ['good', ' ']]) {
    expect((await withPhoneFallback(primary(drafts), phone, { ...request, typed: 'Please bring the stove.' })).reason).toBe(words.fallback);
  }
  for (const typed of ['', '  ']) {
    expect((await withPhoneFallback(primary(['one', 'two']), phone, { ...request, typed })).reason).toBe(words.fallback);
  }
});

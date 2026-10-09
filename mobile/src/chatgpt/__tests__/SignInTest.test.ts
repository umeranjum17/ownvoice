import { Accounts, memoryStore } from '@byokit/accounts';
import { stateOf, nothing, accountSessions } from '../session';
const session = accountSessions.chatgpt.session;
import { store } from '../../core/store';

jest.mock('../accounts', () => {
  const mockSignIn = jest.fn(async (_provider?: string) => {});
  const mockSignOut = jest.fn(async (_provider?: string) => {});
  const mockRefresh = jest.fn(async () => {});
  const mockSignInState = jest.fn((_provider?: string) => null);
  const mockStatus = jest.fn(async (_provider?: string) => ({ account: 'owner', name: 'ChatGPT', id: 'owner:chatgpt', provider: 'chatgpt', state: 'ready', words: 'Connected.' }));
  const mockCancelSignIn = jest.fn((_provider?: string) => {});

  return {
    signIn: mockSignIn,
    signOut: mockSignOut,
    refresh: mockRefresh,
    signInState: mockSignInState,
    cancelSignIn: mockCancelSignIn,
    status: mockStatus,
    // ChatGPT-specific wrappers call the generic mocks
    signInChatGPT: () => mockSignIn('chatgpt'),
  };
});

import { signIn, signOut, status } from '../accounts';
import { words } from '../../core/words';

// The sign-in states the screen shows, in byokit's own sentences (no real account is involved).
test('sign-out revokes and clears app permission', async () => {
  store.set('chatgpt-apps', { on: ['com.whatsapp'] });
  await session.signOut();
  expect(signOut).toHaveBeenCalledTimes(1);
  expect(store.get('chatgpt-apps')).toBeNull();
});

test('sign-out revokes even when clearing consent fails', async () => {
  store.set('chatgpt-apps', { on: ['com.whatsapp'] });
  (signOut as jest.Mock).mockClear();
  const set = jest.spyOn(store, 'set').mockImplementationOnce(() => { throw new Error('storage unavailable'); });
  try {
    expect((await session.signOut()).signedIn).toBe(false);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(store.get('chatgpt-apps')).toEqual({ on: ['com.whatsapp'] });
    await session.start();
    expect(store.get('chatgpt-apps')).toBeNull();
  } finally {
    set.mockRestore();
  }
});

test('starting a new sign-in clears consent from an expired account', async () => {
  store.set('chatgpt-apps', { on: ['com.whatsapp'] });
  (status as jest.Mock).mockResolvedValueOnce({ account: 'owner', name: 'ChatGPT', id: 'owner:chatgpt', provider: 'chatgpt', state: 'needs_again', words: 'Sign in again.' });
  expect((await session.current()).signedIn).toBe(false);
  expect((await session.start()).signedIn).toBe(true);
  expect(signIn).toHaveBeenCalled();
  expect(store.get('chatgpt-apps')).toBeNull();
});

test('nothingShowsNoState', () => {
  expect(stateOf(null, null)).toEqual(nothing);
});

test('waitingShowsTheCodeToTypeAndThePageToOpen', () => {
  const view = stateOf({ state: 'waiting', via: 'code', code: 'KQPT-MXVD', url: 'https://chatgpt.com/code' }, null);
  expect(view).toMatchObject({ signedIn: false, waiting: true, code: 'KQPT-MXVD', url: 'https://chatgpt.com/code' });
  expect(view.note).toContain('ChatGPT page');
  expect(stateOf({ state: 'waiting', code: 'KQPT-MXVD' }, { account: 'owner', name: 'ChatGPT', id: 'owner:chatgpt', provider: 'chatgpt', state: 'signing', words: 'Signing in' }).signedIn).toBe(false);
  expect(stateOf({ state: 'waiting' }, null).note).toContain('Opening');
});

test.each([
  ['fetch failed', "Couldn't reach"],
  ['the code expired', 'expired'],
  ['access_denied', 'declined'],
])('a failed Byokit sign-in preserves its %s explanation', async (reason, words) => {
  const byokit = new Accounts({ offer: ['chatgpt'], store: () => memoryStore() });
  jest.spyOn(byokit, 'runtime').mockResolvedValue({ login: async () => { throw new Error(reason); } } as unknown as Awaited<ReturnType<typeof byokit.runtime>>);
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const view = await byokit.login('owner', 'chatgpt', { via: 'code' });
    expect(view?.state).toBe('failed');
    expect(view?.error).toContain(words);
    expect(stateOf(view, null).note).toBe(view?.error);
  } finally {
    error.mockRestore();
  }
});

test('a connected account is shown as connected, a resting one says why', () => {
  const ready = stateOf(null, { account: 'owner', name: 'ChatGPT', id: 'owner:chatgpt', provider: 'chatgpt', state: 'ready', words: 'ChatGPT is connected.' });
  expect(ready).toEqual({ ...nothing, signedIn: true, note: 'ChatGPT is connected.' });
  const resting = stateOf(null, { account: 'owner', name: 'ChatGPT', id: 'owner:chatgpt', provider: 'chatgpt', state: 'resting', until: 1, words: 'ChatGPT is resting until 3:40pm.' });
  expect(resting.signedIn).toBe(true);
  expect(resting.resting).toBe('ChatGPT is resting until 3:40pm.');
  for (const state of ['signed_out', 'needs_again', 'signing'] as const)
    expect(stateOf(null, { account: 'owner', name: 'ChatGPT', id: 'owner:chatgpt', provider: 'chatgpt', state, words: words.failed }).signedIn).toBe(false);
});

test('a plan that does not include this says so', () => {
  const view = stateOf(null, { account: 'owner', name: 'ChatGPT', id: 'owner:chatgpt', provider: 'chatgpt', state: 'not_included', words: "Your ChatGPT plan doesn't include this yet." });
  expect(view.signedIn).toBe(true);
  expect(view.resting).toBe("Your ChatGPT plan doesn't include this yet.");
});

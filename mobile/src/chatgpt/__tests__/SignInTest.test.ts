import { Accounts } from '@byokit/accounts';
import { stateOf, nothing, session } from '../session';
import { store } from '../../core/store';
import { signIn, signOut, status } from '../accounts';

jest.mock('../accounts', () => ({
  signIn: jest.fn(async () => {}),
  signOut: jest.fn(async () => {}),
  refresh: jest.fn(async () => {}),
  signInState: jest.fn(() => null),
  status: jest.fn(async () => ({ account: 'owner', name: 'ChatGPT', state: 'ready', words: 'Connected.' })),
}));
import { words } from '../../core/words';

// The sign-in states the screen shows, in byokit's own sentences (no real account is involved).
test('sign-out revokes and clears app permission', async () => {
  store.set('chatgpt-apps', { on: ['com.whatsapp'] });
  await session.signOut();
  expect(signOut).toHaveBeenCalledTimes(1);
  expect(store.get('chatgpt-apps')).toBeNull();
});

test('starting a new sign-in clears consent from an expired account', async () => {
  store.set('chatgpt-apps', { on: ['com.whatsapp'] });
  (status as jest.Mock).mockResolvedValueOnce({ account: 'owner', name: 'ChatGPT', state: 'needs_again', words: 'Sign in again.' });
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
  expect(stateOf({ state: 'waiting', code: 'KQPT-MXVD' }, { account: 'owner', name: 'ChatGPT', state: 'signing', words: 'Signing in' }).signedIn).toBe(false);
  expect(stateOf({ state: 'waiting' }, null).note).toContain('Opening');
});

test.each([
  ['fetch failed', "Couldn't reach"],
  ['the code expired', 'expired'],
  ['access_denied', 'declined'],
])('a failed Byokit sign-in preserves its %s explanation', async (reason, words) => {
  const byokit = new Accounts({ offer: ['chatgpt'] });
  jest.spyOn(byokit, 'open').mockResolvedValue({ login: async () => { throw new Error(reason); } } as never);
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
  const ready = stateOf(null, { account: 'owner', name: 'ChatGPT', state: 'ready', words: 'ChatGPT is connected.' });
  expect(ready).toEqual({ ...nothing, signedIn: true, note: 'ChatGPT is connected.' });
  const resting = stateOf(null, { account: 'owner', name: 'ChatGPT', state: 'resting', until: 1, words: 'ChatGPT is resting until 3:40pm.' });
  expect(resting.signedIn).toBe(true);
  expect(resting.resting).toBe('ChatGPT is resting until 3:40pm.');
  for (const state of ['signed_out', 'needs_again', 'signing'] as const)
    expect(stateOf(null, { account: 'owner', name: 'ChatGPT', state, words: words.failed }).signedIn).toBe(false);
});

test('a plan that does not include this says so', () => {
  const view = stateOf(null, { account: 'owner', name: 'ChatGPT', state: 'not_included', words: "Your ChatGPT plan doesn't include this yet." });
  expect(view.signedIn).toBe(true);
  expect(view.resting).toBe("Your ChatGPT plan doesn't include this yet.");
});

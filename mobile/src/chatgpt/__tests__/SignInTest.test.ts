import { stateOf, nothing } from '../session';
import { words } from '../../core/words';

// The sign-in states the screen shows, in byokit's own sentences (no real account is involved).
test('nothingShowsNoState', () => {
  expect(stateOf(null, null)).toEqual(nothing);
});

test('waitingShowsTheCodeToTypeAndThePageToOpen', () => {
  const view = stateOf({ state: 'waiting', via: 'code', code: 'KQPT-MXVD', url: 'https://chatgpt.com/code' }, null);
  expect(view).toMatchObject({ signedIn: false, waiting: true, code: 'KQPT-MXVD', url: 'https://chatgpt.com/code' });
  expect(view.note).toContain('ChatGPT page');
  expect(stateOf({ state: 'waiting' }, null).note).toContain('Opening');
});

test('failedSignInsSayWhatHappenedInPlainWords', () => {
  expect(stateOf({ state: 'failed', error: 'the code expired' }, null).note).toContain('expired');
  expect(stateOf({ state: 'failed', error: 'access_denied' }, null).note).toContain('declined');
  expect(stateOf({ state: 'failed', error: 'fetch failed' }, null).note).toContain("Couldn't reach");
  expect(stateOf({ state: 'failed', error: 'cancelled' }, null).note).toContain('Nothing was kept');
  expect(stateOf({ state: 'failed', error: 'token exchange failed' }, null).note).toContain("didn't finish");
});

test('a connected account is shown as connected, a resting one says why', () => {
  const ready = stateOf(null, { account: 'owner', name: 'ChatGPT', state: 'ready', words: 'ChatGPT is connected.' });
  expect(ready).toEqual({ ...nothing, signedIn: true, note: 'ChatGPT is connected.' });
  const resting = stateOf(null, { account: 'owner', name: 'ChatGPT', state: 'resting', until: 1, words: 'ChatGPT is resting until 3:40pm.' });
  expect(resting.signedIn).toBe(true);
  expect(resting.resting).toBe('ChatGPT is resting until 3:40pm.');
  for (const state of ['signed_out', 'needs_again'] as const)
    expect(stateOf(null, { account: 'owner', name: 'ChatGPT', state, words: words.failed }).signedIn).toBe(false);
});

test('a plan that does not include this says so', () => {
  const view = stateOf(null, { account: 'owner', name: 'ChatGPT', state: 'not_included', words: "Your ChatGPT plan doesn't include this yet." });
  expect(view.signedIn).toBe(true);
  expect(view.resting).toBe("Your ChatGPT plan doesn't include this yet.");
});

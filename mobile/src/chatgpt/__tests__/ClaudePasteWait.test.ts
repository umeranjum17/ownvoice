// The Claude paste-back sign-in is finished on another device: find it, open the link, read the code back.
// That routinely takes longer than the kit's 15 minute default, which voided the code with "The sign-in
// took too long" (issue #202). Drives the app's own Accounts with the real kit on fake timers.
import { signInClaude, signInState, cancelSignIn } from '../accounts';

afterEach(() => { cancelSignIn('claude'); jest.useRealTimers(); });

test('the Claude code-paste screen is still waiting after 31 minutes, and after 12 hours', async () => {
  jest.useFakeTimers();
  await signInClaude();
  expect(signInState('claude')).toMatchObject({ state: 'waiting' });
  expect(signInState('claude')?.url).toContain('claude');
  await jest.advanceTimersByTimeAsync(31 * 60_000);
  expect(signInState('claude')).toMatchObject({ state: 'waiting' });
  await jest.advanceTimersByTimeAsync(12 * 60 * 60_000);
  expect(signInState('claude')).toMatchObject({ state: 'waiting' });
});

test('only a real expiry says the sign-in took too long', async () => {
  jest.useFakeTimers();
  await signInClaude();
  await jest.advanceTimersByTimeAsync(25 * 60 * 60_000);
  expect(signInState('claude')).toMatchObject({ state: 'failed', error: expect.stringContaining('took too long') });
});

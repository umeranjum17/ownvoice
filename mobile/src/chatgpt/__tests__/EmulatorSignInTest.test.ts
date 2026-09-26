import type { GptState } from '../session';

// The emulator-only stand-in (EXPO_PUBLIC_E2E_GPT) has to behave like the real thing on screen:
// a code that waits, then a connected account. It never touches the network or anyone's sign-in.
const load = (flag?: string) => {
  if (flag === undefined) delete process.env.EXPO_PUBLIC_E2E_GPT;
  else process.env.EXPO_PUBLIC_E2E_GPT = flag;
  let mod: typeof import('../session');
  jest.isolateModules(() => { mod = require('../session'); });
  return mod!;
};

const now = jest.spyOn(Date, 'now');

afterEach(() => { delete process.env.EXPO_PUBLIC_E2E_GPT; now.mockRestore(); });

test('the stand-in sign-in shows a code, waits, then is connected', async () => {
  const { session } = load('1');
  expect((await session.current()).signedIn).toBe(false);
  const started: GptState = await session.start();
  expect(started).toMatchObject({ waiting: true, signedIn: false, code: expect.stringMatching(/^[A-Z]{4}-[A-Z]{4}$/) });
  expect(started.note).toContain('ChatGPT page');
  now.mockReturnValue(Date.now() + 10_000);
  expect(await session.current()).toMatchObject({ waiting: false, signedIn: true });
  expect((await session.signOut()).signedIn).toBe(false);
  expect((await session.current()).signedIn).toBe(false);
});

test('only the exact build flag enables the stand-in', () => {
  for (const flag of [undefined, '', 'off', 'true', '0', '10']) expect(load(flag).mocked).toBe(false);
  expect(load('1').mocked).toBe(true);
});

test('cancelling the stand-in sign-in leaves the screen asking to start again', async () => {
  const { session } = load('1');
  await session.start();
  expect(await session.cancel()).toMatchObject({ waiting: false, signedIn: false });
  expect((await session.current()).signedIn).toBe(false);
});

import { Accounts } from '@byokit/accounts';

// P7: a device-code sign-in must survive the browser step. While the person types
// the code in Chrome, Android cuts a backgrounded app's network within seconds
// (AGENTS.md); here the token polls fail the same way (unreachable sockets).
// Those dropped polls must not turn the wait into signIn.failed before the code's
// own expiry, while a real refusal still fails with its own sentence. No real
// credentials are involved: fetch never leaves this stub.

const jwt = () => ['eyJhbGciOiJub25lIn0',
  btoa(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acct-1', chatgpt_plan_type: 'plus' } }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), 'sig'].join('.');

const res = (status: number, body: unknown) => ({ status, text: async () => JSON.stringify(body) });

/** The token endpoint, scripted: drops the first `drops` polls on the floor, stays
 *  pending until approved, then completes (or refuses when denied). */
const script = ({ drops, deny }: { drops: number; deny?: boolean }) => {
  let polls = 0, approved = false;
  const fetch = jest.fn(async (url: string, init?: { body?: string }) => {
    if (String(url).endsWith('/api/accounts/deviceauth/usercode'))
      return res(200, { device_auth_id: 'da_1', user_code: 'ABCD-EFGH', interval: '1' });
    if (String(url).endsWith('/api/accounts/deviceauth/token')) {
      if (++polls <= drops) throw new TypeError('fetch failed');
      if (deny) return res(400, { error: { code: 'access_denied' } });
      return approved
        ? res(200, { authorization_code: 'ac_1', code_verifier: 'cv' })
        : res(403, { error: { code: 'deviceauth_authorization_pending' } });
    }
    if (String(url).endsWith('/oauth/token'))
      return res(200, { access_token: jwt(), refresh_token: 'rt_1', expires_in: 86_400 });
    throw new Error(`unexpected fetch ${url}`);
  });
  return { fetch, approve: () => { approved = true; } };
};

const realFetch = global.fetch;

afterEach(() => { global.fetch = realFetch; });

test('dropped polls while the code waits do not fail the sign-in', async () => {
  const { fetch, approve } = script({ drops: 3 });
  global.fetch = fetch as unknown as typeof global.fetch;
  const byokit = new Accounts({ offer: ['chatgpt'], signInMs: 25_000 });
  const shown = await byokit.login('owner', 'chatgpt', { via: 'code' });
  expect(shown?.state).toBe('waiting');
  expect(shown?.code).toBe('ABCD-EFGH');
  // The person is still typing the code in the browser; polls keep failing meanwhile.
  await new Promise((r) => setTimeout(r, 2500));
  expect(byokit.view('owner', 'chatgpt')?.state).toBe('waiting');
  approve();
  await byokit.finished('owner', 'chatgpt');
  expect(byokit.view('owner', 'chatgpt')?.state).toBe('done');
  expect(await byokit.signedIn('owner', 'chatgpt')).toBe(true);
}, 30_000);

test('a declined code still fails with its own sentence', async () => {
  const { fetch } = script({ drops: 1, deny: true });
  global.fetch = fetch as unknown as typeof global.fetch;
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const byokit = new Accounts({ offer: ['chatgpt'], signInMs: 25_000 });
    const shown = await byokit.login('owner', 'chatgpt', { via: 'code' });
    expect(shown?.state).toBe('waiting');
    await byokit.finished('owner', 'chatgpt');
    const view = byokit.view('owner', 'chatgpt');
    expect(view?.state).toBe('failed');
    expect(view?.error).toContain('declined');
    expect(await byokit.signedIn('owner', 'chatgpt')).toBe(false);
  } finally {
    error.mockRestore();
  }
}, 30_000);

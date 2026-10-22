import { fetch as expoFetch } from 'expo/fetch';
import { checkAddress } from '../core/plainAddress';

// Accounts resolves sign-in asynchronously. Its public fetch + signal seams let
// each concurrent request keep its own final consent check and answered-send mark.
const requests = new WeakMap<AbortSignal, typeof fetch>();
export const responseFetch: typeof fetch = (url, init) => {
  checkAddress(String(url));
  // Emulator-only stand-in (EXPO_PUBLIC_E2E_OPENCODE_403): the console lists one workspace, so the connect step
  // reaches the pick and then the chat call is refused; no request leaves.
  if (process.env.EXPO_PUBLIC_E2E_OPENCODE_403 === '1' && String(url).startsWith('https://opencode.ai/console/')) {
    const orgs = String(url).endsWith('/api/orgs') ? '[{"id":"wrk_e2e403","name":"Working2"}]' : '[]';
    return Promise.resolve(new Response(orgs, { status: 200, headers: { 'content-type': 'application/json' } }));
  }
  return (init?.signal && requests.get(init.signal) || expoFetch as typeof fetch)(url, init);
};

export async function withResponseFetch<T>(fetcher: typeof fetch, ask: (signal: AbortSignal) => Promise<T>, signal: AbortSignal = new AbortController().signal): Promise<T> {
  requests.set(signal, fetcher);
  try { return await ask(signal); }
  finally { requests.delete(signal); }
}

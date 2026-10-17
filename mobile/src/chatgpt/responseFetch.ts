import { fetch as expoFetch } from 'expo/fetch';

// Accounts resolves sign-in asynchronously. Its public fetch + signal seams let
// each concurrent request keep its own final consent check and answered-send mark.
const requests = new WeakMap<AbortSignal, typeof fetch>();
export const responseFetch: typeof fetch = (url, init) => {
  // Emulator-only stand-in (EXPO_PUBLIC_E2E_OPENCODE_403): the OpenCode console lists no workspaces, so no request leaves.
  if (process.env.EXPO_PUBLIC_E2E_OPENCODE_403 === '1' && String(url).startsWith('https://opencode.ai/console/')) {
    return Promise.resolve(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }));
  }
  return (init?.signal && requests.get(init.signal) || expoFetch as typeof fetch)(url, init);
};

export async function withResponseFetch<T>(fetcher: typeof fetch, ask: (signal: AbortSignal) => Promise<T>, signal: AbortSignal = new AbortController().signal): Promise<T> {
  requests.set(signal, fetcher);
  try { return await ask(signal); }
  finally { requests.delete(signal); }
}

import { fetch as expoFetch } from 'expo/fetch';

// Accounts resolves sign-in asynchronously. Its public fetch + signal seams let
// each concurrent request keep its own final consent check and answered-send mark.
const requests = new WeakMap<AbortSignal, typeof fetch>();
export const responseFetch: typeof fetch = (url, init) =>
  (init?.signal && requests.get(init.signal) || expoFetch as typeof fetch)(url, init);

export async function withResponseFetch<T>(fetcher: typeof fetch, ask: (signal: AbortSignal) => Promise<T>, signal: AbortSignal = new AbortController().signal): Promise<T> {
  requests.set(signal, fetcher);
  try { return await ask(signal); }
  finally { requests.delete(signal); }
}

import { fetch as expoFetch } from 'expo/fetch';
import { route, routes } from '@byokit/accounts';
import { checkAddress } from '../core/plainAddress';

// Accounts resolves sign-in asynchronously. Its public fetch + signal seams let
// each concurrent request keep its own final consent check and answered-send mark.
/** Emulator-only stand-in (EXPO_PUBLIC_E2E_OPENROUTER_BASE, never set in a distributable build): OpenRouter's address
 *  becomes the host's `e2e/pi-writer.mjs`, for the list the kit reads as well as for the chat. */
const OPENROUTER = 'https://openrouter.ai/api/v1';
/** The same for any one other kit route (EXPO_PUBLIC_E2E_ROUTE_ID, a kit route id, with EXPO_PUBLIC_E2E_ROUTE_BASE): that
 *  route's own list and chat address become the host stand-in, so a route the app never hard-coded can be proven with no key. */
const routeBases = (): string[] => {
  try {
    const found = route(process.env.EXPO_PUBLIC_E2E_ROUTE_ID ?? '', { platform: 'rn' });
    // The kit lists a route's models from the first route of its upstream that has them, which may sit at another address.
    const listed = routes({ platform: 'rn' }).find(r => r.upstream.id === found.upstream.id && r.models)?.models?.baseUrl;
    return [found.models?.baseUrl, listed].filter((base): base is string => !!base);
  } catch { return []; }
};
export const proofRoute = (url: string): string => {
  const base = process.env.EXPO_PUBLIC_E2E_OPENROUTER_BASE;
  if (base && url.startsWith(OPENROUTER)) return base + url.slice(OPENROUTER.length);
  const other = process.env.EXPO_PUBLIC_E2E_ROUTE_BASE;
  const from = other ? routeBases().find(prefix => url.startsWith(prefix)) : undefined;
  return other && from ? other + url.slice(from.length) : url;
};

const requests = new WeakMap<AbortSignal, typeof fetch>();
export const responseFetch: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? proofRoute(input) : input;
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

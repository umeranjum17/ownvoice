import { responseFetch } from './responseFetch';
import * as SecureStore from 'expo-secure-store';
import { Accounts, offered, portable, secureStore } from '@byokit/accounts';

import { CHATGPT_TERMS } from '../core/words';
export { CHATGPT_TERMS };
const member = 'owner';
const store = secureStore(SecureStore, 'ownvoice.chatgpt.1');
// Emulator-only proof builds point the real sign-in stack at the host stand-in
// (mockOpenAI) with EXPO_PUBLIC_E2E_AUTH_BASE=http://10.0.2.2:<port>; never set
// in a distributable build, where sign-in always goes to OpenAI itself.
const authBase = process.env.EXPO_PUBLIC_E2E_AUTH_BASE || undefined;

// Start with hardcoded list to avoid calling offered() at module scope (RN crash).
// Wrapper functions will delegate to a lazily-initialized instance with kit-driven list.
const fallback = new Accounts({ offer: ['claude', 'chatgpt'], app: 'Ownvoice', store: () => store, fetch: responseFetch, originator: 'ownvoice', ...(authBase ? { authBase } : {}) }, portable);
let realInstance: Accounts | undefined;

function kitInstance(): Accounts | undefined {
  if (realInstance) return realInstance;
  try {
    const plans = offered().map(p => p.key);
    if (!plans.length) return undefined;
    const planOrder = plans.includes('claude') ? ['claude', ...plans.filter(k => k !== 'claude')] : plans;
    realInstance = new Accounts({ offer: planOrder, app: 'Ownvoice', store: () => store, fetch: responseFetch, originator: 'ownvoice', ...(authBase ? { authBase} : {}) }, portable);
    return realInstance;
  } catch {
    return undefined;
  }
}

function getInstance(): Accounts {
  return kitInstance() ?? fallback;
}

export const accounts = fallback;
const fallbackProviders = fallback.providers;
Object.defineProperty(accounts, 'providers', {
  configurable: true,
  get: () => kitInstance()?.providers ?? fallbackProviders,
});
// Generic plan operations: the UI passes the provider key ('claude', 'chatgpt', etc.)
// These call getInstance() to get the kit-driven instance (if available) instead of fallback.
export const signIn = (provider: string) => getInstance().login(member, provider, { via: 'code' });
export const signOut = (provider: string) => getInstance().logout(member, provider);
export const refresh = () => getInstance().keepFresh([member]);
export const signInState = (provider: string) => getInstance().view(member, provider);
export const cancelSignIn = (provider: string) => getInstance().cancel(member, provider);
export const status = (provider: string) => getInstance().status(member, provider);
export const reportFailure = (provider: string, error: string) => getInstance().failed(member, provider, error);
// Legacy ChatGPT-specific wrappers for existing code
export const signInChatGPT = () => signIn('chatgpt');
export const signOutChatGPT = () => signOut('chatgpt');
export const signInStateChatGPT = () => signInState('chatgpt');
export const cancelSignInChatGPT = () => cancelSignIn('chatgpt');
export const statusChatGPT = () => status('chatgpt');
export async function codexAuth(): Promise<{ access: string; accountId: string }> {
  const runtime = await getInstance().runtime(member);
  const auth = await runtime.getAuth('openai-codex');
  const credential = await runtime.readCredential('openai-codex');
  if (!auth?.auth?.apiKey || credential?.type !== 'oauth' || typeof credential.accountId !== 'string') throw new Error('Sign in with ChatGPT first.');
  return { access: auth.auth.apiKey, accountId: credential.accountId };
}

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

// Lazy initialization: construct Accounts after runtime is ready, not at module scope.
// Calling offered() at module import time causes native crash (runtime not ready).
// In test environments, skip lazy loading since offered() may not be available.
let accountsInstance: Accounts | null = null;
function getAccounts(): Accounts {
  if (!accountsInstance) {
    // Get all subscription plans from the kit's catalogue, Claude first.
    // In tests, offered() might not work, so fall back to a minimal list.
    let planOrder: string[];
    try {
      const plans = offered().map(p => p.key);
      planOrder = plans.includes('claude') ? ['claude', ...plans.filter(k => k !== 'claude')] : plans;
    } catch {
      // Jest environment or offered() not available - use fallback
      planOrder = ['claude', 'chatgpt'];
    }
    accountsInstance = new Accounts({ offer: planOrder, app: 'Ownvoice', store: () => store, fetch: responseFetch, originator: 'ownvoice', ...(authBase ? { authBase } : {}) }, portable);
  }
  return accountsInstance;
}

// Export accounts as a getter property to maintain API compatibility.
// In tests, this Proxy allows the lazy instance to be mocked.
const mockOverrides = new Map<string | symbol, any>();
export const accounts = new Proxy({} as Accounts, {
  get: (_, prop) => {
    // Check if there's a mock override (for tests)
    if (mockOverrides.has(prop)) {
      return mockOverrides.get(prop);
    }
    const instance = getAccounts();
    const value = instance[prop as keyof Accounts];
    return typeof value === 'function' ? value.bind(instance) : value;
  },
  set: (_, prop, value) => {
    // Allow tests to override methods
    mockOverrides.set(prop, value);
    return true;
  }
});
// Generic plan operations: the UI passes the provider key ('claude', 'chatgpt', etc.)
export const signIn = (provider: string) => accounts.login(member, provider, { via: 'code' });
export const signOut = (provider: string) => accounts.logout(member, provider);
export const refresh = () => accounts.keepFresh([member]);
export const signInState = (provider: string) => accounts.view(member, provider);
export const cancelSignIn = (provider: string) => accounts.cancel(member, provider);
export const status = (provider: string) => accounts.status(member, provider);
export const reportFailure = (provider: string, error: string) => accounts.failed(member, provider, error);
// Legacy ChatGPT-specific wrappers for existing code
export const signInChatGPT = () => signIn('chatgpt');
export const signOutChatGPT = () => signOut('chatgpt');
export const signInStateChatGPT = () => signInState('chatgpt');
export const cancelSignInChatGPT = () => cancelSignIn('chatgpt');
export const statusChatGPT = () => status('chatgpt');
export async function codexAuth(): Promise<{ access: string; accountId: string }> {
  const runtime = await accounts.runtime(member);
  const auth = await runtime.getAuth('openai-codex');
  const credential = await runtime.readCredential('openai-codex');
  if (!auth?.auth?.apiKey || credential?.type !== 'oauth' || typeof credential.accountId !== 'string') throw new Error('Sign in with ChatGPT first.');
  return { access: auth.auth.apiKey, accountId: credential.accountId };
}

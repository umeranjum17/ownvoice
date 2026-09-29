import * as SecureStore from 'expo-secure-store';
import { Accounts, portable, secureStore } from '@byokit/accounts';

import { CHATGPT_TERMS } from '../core/words';
export { CHATGPT_TERMS };
const member = 'owner';
const store = secureStore(SecureStore, 'ownvoice.chatgpt.1');
// Emulator-only proof builds point the real sign-in stack at the host stand-in
// (mockOpenAI) with EXPO_PUBLIC_E2E_AUTH_BASE=http://10.0.2.2:<port>; never set
// in a distributable build, where sign-in always goes to OpenAI itself.
const authBase = process.env.EXPO_PUBLIC_E2E_AUTH_BASE || undefined;
export const accounts = new Accounts({ offer: ['chatgpt'], app: 'Ownvoice', store: () => store, ...(authBase ? { authBase } : {}) }, portable);
export const signIn = () => accounts.login(member, 'chatgpt', { via: 'code' });
export const signOut = () => accounts.logout(member, 'chatgpt');
export const refresh = () => accounts.keepFresh([member]);
export const signInState = () => accounts.view(member, 'chatgpt');
export const cancelSignIn = () => accounts.cancel(member, 'chatgpt');
export const status = () => accounts.status(member, 'chatgpt');
export const reportFailure = (error: string) => accounts.failed(member, 'chatgpt', error);
export async function codexAuth(): Promise<{ access: string; accountId: string }> {
  const runtime = await accounts.runtime(member);
  const auth = await runtime.getAuth('openai-codex');
  const credential = await runtime.readCredential('openai-codex');
  if (!auth?.auth?.apiKey || credential?.type !== 'oauth' || typeof credential.accountId !== 'string') throw new Error('Sign in with ChatGPT first.');
  return { access: auth.auth.apiKey, accountId: credential.accountId };
}

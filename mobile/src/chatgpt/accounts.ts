import * as SecureStore from 'expo-secure-store';
import { Accounts, portable, secureStore } from '@byokit/accounts';

import { CHATGPT_TERMS } from '../core/words';
export { CHATGPT_TERMS };
const member = 'owner';
const store = secureStore(SecureStore, 'ownvoice.chatgpt.1');
export const accounts = new Accounts({ offer: ['chatgpt'], app: 'Ownvoice', store: () => store }, portable);
export const signIn = () => accounts.login(member, 'chatgpt', { via: 'code' });
export const signOut = () => accounts.logout(member, 'chatgpt');
export const refresh = () => accounts.keepFresh([member]);
export const signInState = () => accounts.view(member, 'chatgpt');
export async function codexAuth(): Promise<{ access: string; accountId: string }> {
  const credential = await store.read('openai-codex');
  if (credential?.type !== 'oauth' || typeof credential.accountId !== 'string') throw new Error('Sign in with ChatGPT first.');
  return { access: credential.access, accountId: credential.accountId };
}

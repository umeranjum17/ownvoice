import * as SecureStore from 'expo-secure-store';
import { Accounts, portable, secureStore } from '@byokit/accounts';

test('a 0.7.1 SecureStore sign-in remains connected after the kit upgrade', async () => {
  const values = new Map<string, string>();
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => values.get(key) ?? null);
  (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string, value: string) => { values.set(key, value); });
  (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async (key: string) => { values.delete(key); });

  // Persisted-record fixture from 0.7.1 secureStore: JSON chunks followed by a
  // generation:count pointer. Synthetic credentials; no account or network access.
  const credential = { type: 'oauth', access: 'fixture-access', refresh: 'fixture-refresh', expires: 1900000000000, accountId: 'fixture-account' };
  await SecureStore.setItemAsync('ownvoice.chatgpt.1.1.0', JSON.stringify({ 'openai-codex': credential }));
  await SecureStore.setItemAsync('ownvoice.chatgpt.1', '1:1');

  const upgraded = secureStore(SecureStore, 'ownvoice.chatgpt.1');
  const accounts = new Accounts({ offer: ['chatgpt'], store: () => upgraded }, portable);
  expect(await upgraded.read('openai-codex')).toEqual(credential);
  expect(await accounts.signedIn('owner', 'chatgpt')).toBe(true);
});

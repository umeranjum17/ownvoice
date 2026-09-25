import { withPhoneFallback, Writer } from '../writers';
import { chatgptEnabled, Flag, SwitchStore, verify } from '../switch';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
const privateKey = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
async function signed(payload: Flag['payload']): Promise<Flag> { return { payload, sig: b64(await ed.signAsync(new TextEncoder().encode(JSON.stringify(payload)), privateKey)) }; }

test('phone fallback reports a readable reason and preserves the primary on success', async () => {
  const req = { conversation: '', written: '', typed: '' };
  const phone: Writer = { write: async () => ['phone draft'] };
  const failed = await withPhoneFallback({ write: async () => { throw Error('secret'); } }, phone, req);
  expect(failed).toEqual({ drafts: ['phone draft'], reason: "ChatGPT didn't answer. This phone wrote these instead." });
  expect(await withPhoneFallback({ write: async () => ['main'] }, phone, req)).toEqual({ drafts: ['main'] });
});

test('remote switch vectors: valid, signature, app, rollback, version; failures keep last; first run is on', async () => {
  const publicKey = b64(await ed.getPublicKeyAsync(privateKey));
  const base = { v: 1, app: 'ownvoice', seq: 3, chatgpt: 'off' as const };
  const valid = await signed(base);
  expect(await verify(valid, publicKey, 2)).toBe(true);
  expect(await verify({ ...valid, sig: b64(new Uint8Array(64)) }, publicKey, 2)).toBe(false);
  expect(await verify(await signed({ ...base, app: 'other' }), publicKey, 2)).toBe(false);
  expect(await verify(await signed({ ...base, seq: 2 }), publicKey, 2)).toBe(false);
  expect(await verify(await signed({ ...base, v: 2 }), publicKey, 2)).toBe(false);
  let state: any = null;
  const store: SwitchStore = { get: async () => state, set: async x => { state = x; } };
  const fetcher = jest.fn(async () => ({ ok: true, json: async () => valid } as Response));
  expect(await chatgptEnabled(store, fetcher, 100, publicKey)).toBe(false);
  expect(state).toEqual({ seq: 3, chatgpt: 'off', fetchedAt: 100 });
  expect(await chatgptEnabled(store, async () => { throw Error(); }, 101, publicKey)).toBe(false);
  expect(await chatgptEnabled({ get: async () => null, set: async () => {} }, async () => { throw Error(); }, 100, publicKey)).toBe(true);
});

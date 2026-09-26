import { withPhoneFallback, Writer } from '../writers';
import { CACHE_MS, chatgptEnabled, Flag, SwitchState, SwitchStore, verify } from '../switch';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
const privateKey = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
async function signed(payload: Flag['payload']): Promise<Flag> { return { payload, sig: b64(await ed.signAsync(new TextEncoder().encode(JSON.stringify(payload)), privateKey)) }; }

test('offline signing command emits a verifiable off flag', async () => {
  const directory = mkdtempSync(join(process.cwd(), '.sign-test-'));
  try {
    const privateKey = randomBytes(32);
    const keyPath = join(directory, 'key');
    writeFileSync(keyPath, privateKey.toString('hex'));
    const output = execFileSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--experimental-strip-types', 'scripts/sign-switch.ts', keyPath, 'off'], { env: { ...process.env, SWITCH_SEQ: '7' }, encoding: 'utf8' });
    const flag = JSON.parse(output) as Flag;
    expect(flag.payload).toEqual({ v: 1, app: 'ownvoice', seq: 7, chatgpt: 'off' });
    expect(await verify(flag, b64(ed.getPublicKey(Uint8Array.from(privateKey))), 6)).toBe(true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('phone fallback reports a readable reason and preserves the primary on success', async () => {
  const req = { conversation: '', written: '', typed: '' };
  const phone: Writer = { write: async () => ({ drafts: ['phone draft'] }) };
  const failed = await withPhoneFallback({ write: async () => { throw Error('secret'); } }, phone, req);
  expect(failed).toEqual({ drafts: ['phone draft'], reason: "ChatGPT didn't answer. This phone wrote these instead." });
  expect(await withPhoneFallback({ write: async () => ({ drafts: ['main'] }) }, phone, req)).toEqual({ drafts: ['phone draft'], reason: "ChatGPT didn't answer. This phone wrote these instead." });
  expect(await withPhoneFallback({ write: async () => ({ drafts: ['one', 'two', 'three'] }) }, phone, req)).toEqual({ drafts: ['one', 'two', 'three'] });
});

test('fallback replaces partial primary cards before showing phone cards', async () => {
  const req = { conversation: '', written: '', typed: '' };
  const cards: (string | null)[] = [null, null, null];
  const events = {
    landed: (text: string, slot: number) => { cards[slot] = text; },
    reset: () => { cards.fill(null); },
  };
  const primary: Writer = { write: async (_request, on) => {
    on?.landed?.('remote one', 0);
    on?.landed?.('remote two', 1);
    return { drafts: ['remote one', 'remote two'] };
  } };
  const phone: Writer = { write: async (_request, on) => {
    on?.landed?.('phone one', 0);
    return { drafts: ['phone one'] };
  } };
  expect(await withPhoneFallback(primary, phone, req, events)).toEqual({ drafts: ['phone one'], reason: "ChatGPT didn't answer. This phone wrote these instead." });
  expect(cards).toEqual(['phone one', null, null]);
});

test('remote switch vectors: valid, signature, app, rollback, version; failures keep last; first run is on', async () => {
  const publicKey = b64(await ed.getPublicKeyAsync(privateKey));
  const base = { v: 1, app: 'ownvoice', seq: 3, chatgpt: 'off' as const };
  const valid = await signed(base);
  expect(await verify(valid, publicKey, 2)).toBe(true);
  expect(await verify(await signed({ ...base, note: 'extra' } as Flag['payload']), publicKey, 2)).toBe(false);
  expect(await verify({ ...valid, sig: b64(new Uint8Array(64)) }, publicKey, 2)).toBe(false);
  expect(await verify(await signed({ ...base, app: 'other' }), publicKey, 2)).toBe(false);
  expect(await verify(await signed({ ...base, seq: 2 }), publicKey, 2)).toBe(false);
  expect(await verify(await signed({ ...base, v: 2 }), publicKey, 2)).toBe(false);
  let state: any = null;
  const store: SwitchStore = { get: async () => state, set: async x => { state = x; } };
  const fetcher = jest.fn(async () => ({ ok: true, json: async () => valid } as Response));
  expect(await chatgptEnabled(store, fetcher, 100, publicKey)).toBe(false);
  expect(state).toEqual({ seq: 3, chatgpt: 'off', fetchedAt: 100 });
  expect(await chatgptEnabled(store, fetcher, 100 + CACHE_MS, publicKey)).toBe(false);
  expect(state).toEqual({ seq: 3, chatgpt: 'off', fetchedAt: 100 + CACHE_MS });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(await chatgptEnabled(store, fetcher, 101 + CACHE_MS, publicKey)).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(2);
  const changed = await signed({ ...base, chatgpt: 'on' });
  const changedFetcher = jest.fn(async () => ({ ok: true, json: async () => changed } as Response));
  expect(await chatgptEnabled(store, changedFetcher, 100 + 2 * CACHE_MS, publicKey)).toBe(false);
  expect(state).toEqual({ seq: 3, chatgpt: 'off', fetchedAt: 100 + CACHE_MS });
  expect(await chatgptEnabled(store, async () => { throw Error(); }, 100 + 2 * CACHE_MS, publicKey)).toBe(false);
  expect(await chatgptEnabled(store, async () => ({ ok: true, json: async () => signed({ ...base, seq: 4, chatgpt: 'on' }) } as Response), 100 + 2 * CACHE_MS, publicKey)).toBe(true);
  expect(state).toEqual({ seq: 4, chatgpt: 'on', fetchedAt: 100 + 2 * CACHE_MS });
  expect(await chatgptEnabled({ get: async () => null, set: async () => {} }, async () => { throw Error(); }, 100, publicKey)).toBe(true);
});

test.each([4, 3])('a delayed sequence %i cannot overwrite a newer off flag', async oldSeq => {
  const publicKey = b64(await ed.getPublicKeyAsync(privateKey));
  let state: SwitchState = { seq: 3, chatgpt: 'on', fetchedAt: 0 };
  const store: SwitchStore = { get: async () => state, set: async value => { state = value; } };
  let resolveSlow!: (response: Response) => void;
  const slowResponse = new Promise<Response>(resolve => { resolveSlow = resolve; });
  const slow = chatgptEnabled(store, async () => slowResponse, CACHE_MS + 1, publicKey);
  const fast = chatgptEnabled(store, async () => ({ ok: true, json: async () => signed({ v: 1, app: 'ownvoice', seq: 5, chatgpt: 'off' }) } as Response), CACHE_MS + 2, publicKey);
  expect(await fast).toBe(false);
  resolveSlow({ ok: true, json: async () => signed({ v: 1, app: 'ownvoice', seq: oldSeq, chatgpt: 'on' }) } as Response);
  expect(await slow).toBe(false);
  expect(state).toEqual({ seq: 5, chatgpt: 'off', fetchedAt: CACHE_MS + 2 });
});

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
export const SWITCH_URL = 'https://raw.githubusercontent.com/umeranjum17/ownvoice/main/switch/chatgpt.json';
export const SWITCH_PUBLIC_KEY = 'sn6nXy45sHxKHfM0Tvc2adkhbAaMN1QRQDY7L1qGiR0=';
export const CACHE_MS = 6 * 60 * 60 * 1000;
export const CHATGPT_OFF = 'ChatGPT is turned off for now. This phone wrote these.';
export type Flag = { payload: { v: number; app: string; seq: number; chatgpt: 'on' | 'off' }; sig: string };
export type SwitchState = { seq: number; chatgpt: 'on' | 'off'; fetchedAt: number };
export type SwitchStore = { get(): Promise<SwitchState | null>; set(state: SwitchState): Promise<void> };
const bytes = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export async function verify(flag: Flag, publicKey: string, previousSeq: number): Promise<boolean> {
  if (flag?.payload?.v !== 1 || Object.keys(flag.payload).length !== 4 || flag.payload.app !== 'ownvoice' || !Number.isSafeInteger(flag.payload.seq) || flag.payload.seq <= previousSeq || !['on', 'off'].includes(flag.payload.chatgpt)) return false;
  try { return await ed.verify(bytes(flag.sig), new TextEncoder().encode(JSON.stringify(flag.payload)), bytes(publicKey)); } catch { return false; }
}
export async function chatgptEnabled(store: SwitchStore, fetcher: typeof fetch = fetch, now = Date.now(), publicKey = SWITCH_PUBLIC_KEY): Promise<boolean> {
  const prior = await store.get();
  if (!publicKey || prior && now - prior.fetchedAt < CACHE_MS) return prior?.chatgpt !== 'off';
  try {
    const response = await fetcher(SWITCH_URL, { method: 'GET', signal: AbortSignal.timeout(3000) });
    if (!response.ok) return prior?.chatgpt !== 'off';
    const flag = await response.json() as Flag;
    if (await verify(flag, publicKey, prior?.seq ?? 0)) await store.set({ seq: flag.payload.seq, chatgpt: flag.payload.chatgpt, fetchedAt: now });
  } catch { /* Keep the last verified choice. */ }
  return (await store.get())?.chatgpt !== 'off';
}

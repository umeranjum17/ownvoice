import * as SecureStore from 'expo-secure-store';
import './random';
import { DeviceLink, pairWithOffer, secureDeviceStore } from '@byokit/pair';
import { words } from '../core/words';

const kept = secureDeviceStore(SecureStore, 'ownvoice-computer');
let live: DeviceLink | null = null;

/** The paired computer's name, or null when none is paired. */
export const computerName = async (): Promise<string | null> => (await kept.load())?.hostName ?? null;

/** Pairs with the computer a pasted code names; `onWords` shows the two words to check there. */
export async function pairComputer(code: string, onWords: (words: string) => void): Promise<string> {
  const grant = await pairWithOffer(code.trim(), { name: 'Ownvoice phone', onWords });
  await forgetComputer();
  await kept.save(grant);
  return grant.hostName;
}

export async function forgetComputer(): Promise<void> {
  live?.stop();
  live = null;
  await kept.clear();
}

/** One question to the paired computer's own Claude: its text back, or a plain error. */
export async function askComputer(instructions: string, input: string, signal: AbortSignal | undefined, gate: () => Promise<void>, onSent: () => Promise<void>): Promise<string> {
  if (!live) {
    const grant = await kept.load();
    if (!grant) throw new Error(words.computerNone);
    live = new DeviceLink(grant, { store: kept });
  }
  if (live.status !== 'online') throw new Error(words.computerProblem);
  await gate();
  const asked = live.request('write', { instructions, input }, { timeoutMs: 30_000 }) as Promise<{ text?: string }>;
  await onSent();
  const reply = await asked;
  if (signal?.aborted) throw signal.reason ?? new Error('aborted');
  if (!reply?.text) throw new Error(words.computerFailed);
  return reply.text;
}

import * as SecureStore from 'expo-secure-store';
import './random';
import { DeviceLink, pairWithOffer, secureDeviceStore } from '@byokit/pair';
import { words } from '../core/words';
import { SendVeto } from '../core/writers';

const kept = secureDeviceStore(SecureStore, 'ownvoice-computer');
let link: Promise<DeviceLink | null> | null = null;

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
  const old = link;
  link = null;
  void old?.then((live) => live?.stop(), () => {});
  await kept.clear();
}

function dropAttempt(attempt: Promise<DeviceLink | null>): void {
  if (link === attempt) link = null;
}

function connect(): Promise<DeviceLink | null> {
  if (!link) {
    const attempt: Promise<DeviceLink | null> = kept.load().then((grant) => (grant ? new DeviceLink(grant, { store: kept }) : null));
    link = attempt;
    attempt.then((live) => { if (!live) dropAttempt(attempt); }, () => dropAttempt(attempt));
  }
  return link;
}

/** One question to the paired computer's own Claude: its text back, or a plain error. */
export async function askComputer(instructions: string, input: string, signal: AbortSignal | undefined, gate: () => Promise<void>, onSent: () => Promise<void>): Promise<string> {
  const live = await connect().catch(() => null);
  if (!live) throw new SendVeto(words.computerUnasked);
  // A link just made (the first tap after the app starts) is still dialling: give it a few seconds to come online. One that is offline is refused, never queued.
  for (let waited = 0; live.status === 'connecting' && waited < 5000 && !signal?.aborted; waited += 100) await new Promise((done) => setTimeout(done, 100));
  await gate();
  if (signal?.aborted) throw signal.reason ?? new Error('aborted');
  if (live.status !== 'online') throw new SendVeto(words.computerUnasked);
  const asked = live.request('write', { instructions, input }, { timeoutMs: 95_000 }) as Promise<{ text?: string }>;
  asked.catch(() => {});
  const cancelled = new Promise<never>((_, reject) => {
    const stop = () => reject(signal?.reason ?? new Error('aborted'));
    if (signal?.aborted) stop();
    else signal?.addEventListener('abort', stop, { once: true });
  });
  cancelled.catch(() => {});
  await onSent();
  const reply = await Promise.race([asked, cancelled]);
  if (signal?.aborted) throw signal.reason ?? new Error('aborted');
  if (!reply?.text) throw new Error(words.computerFailed);
  return reply.text;
}

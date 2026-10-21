import * as SecureStore from 'expo-secure-store';
import './random';
import { DeviceLink, pairWithOffer, secureDeviceStore } from '@byokit/pair';
import { words } from '../core/words';

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
  const live = await connect();
  if (!live) throw new Error(words.computerNone);
  await gate();
  if (live.status !== 'online') throw new Error(words.computerProblem);
  const asked = live.request('write', { instructions, input }, { timeoutMs: 30_000 }) as Promise<{ text?: string }>;
  await onSent();
  const reply = await asked;
  if (signal?.aborted) throw signal.reason ?? new Error('aborted');
  if (!reply?.text) throw new Error(words.computerFailed);
  return reply.text;
}

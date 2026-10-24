import * as SecureStore from 'expo-secure-store';
import './random';
import { DeviceLink, pairWithOffer, secureDeviceStore } from '@byokit/pair';
import { checkAddress } from '../core/plainAddress';
import { words } from '../core/words';
import { SendVeto } from '../core/writers';

const kept = secureDeviceStore(SecureStore, 'ownvoice-computer');
let link: Promise<DeviceLink | null> | null = null;

/** The paired computer's name, or null when none is paired. */
export const computerName = async (): Promise<string | null> => (await kept.load())?.hostName ?? null;

/** Pairs with the computer a pasted code names; `onWords` shows the two words to check there. */
export async function pairComputer(code: string, onWords: (words: string) => void): Promise<string> {
  const grant = await pairWithOffer(code.trim(), { name: 'Ownvoice phone', onWords });
  await dropComputer();
  await kept.save(grant);
  return grant.hostName;
}

async function dropComputer(): Promise<void> {
  const old = link;
  link = null;
  void old?.then((live) => live?.stop(), () => {});
  await kept.clear();
}

/** What the paired computer helper's hello says of its version: `version` is null when it is too old to say, `reachable` false when it did not answer. */
export async function helperVersion(): Promise<{ paired: boolean; version: string | null; reachable: boolean }> {
  if (!(await computerName())) return { paired: false, version: null, reachable: false };
  try {
    const live = await connect();
    if (!live) return { paired: false, version: null, reachable: false };
    for (let waited = 0; live.status === 'connecting' && waited < 5000; waited += 100) await new Promise((done) => setTimeout(done, 100));
    if (live.status !== 'online') throw new Error('offline');
    const said = (await live.request('hello', {}, { timeoutMs: 5000 })) as { version?: unknown } | null;
    const version = typeof said?.version === 'string' ? said.version : null;
    return { paired: true, version, reachable: true };
  } catch {
    return { paired: true, version: null, reachable: false };
  }
}

/** Asks the paired computer to drop this phone's trust; false when it could not be reached or did not confirm. */
async function tellComputer(): Promise<boolean> {
  try {
    const live = await connect();
    if (!live) return false;
    for (let waited = 0; live.status === 'connecting' && waited < 5000; waited += 100) await new Promise((done) => setTimeout(done, 100));
    if (live.status !== 'online') return false;
    await live.unpair();
    return true;
  } catch {
    return false;
  }
}

/** Forgets the computer on this phone, and tells it to forget this phone when it is reachable: `told` is false when it was not. */
export async function forgetComputer(): Promise<{ told: boolean }> {
  const told = await tellComputer();
  await dropComputer();
  return { told };
}

function dropAttempt(attempt: Promise<DeviceLink | null>): void {
  if (link === attempt) link = null;
}

function connect(): Promise<DeviceLink | null> {
  if (!link) {
    const attempt: Promise<DeviceLink | null> = kept.load().then((grant) => { if (!grant) return null; grant.urls.forEach((url) => checkAddress(url, { computer: true })); return new DeviceLink(grant, { store: kept }); });
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

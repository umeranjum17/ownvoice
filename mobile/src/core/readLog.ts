import { type Read, keep, summary } from './privacy';
import Native, { type TapFact } from '../../modules/ownvoice-native';

// Native tap facts are the only retained history. This snapshot serves the UI during a failed refresh.
let snapshot: Read[] = [];
let pending: Promise<unknown> = Promise.resolve();
const ordered = <T>(run: () => Promise<T>): Promise<T> => {
  const next = pending.then(run, run);
  pending = next.catch(() => {});
  return next;
};

export function readLog(now = Date.now()): Read[] { return keep(snapshot, now); }

export function recordFacts(facts: TapFact[], now = Date.now()): Read[] {
  return keep(facts.map(f => ({
    id: f.id, time: f.at, app: f.app, label: f.label,
    summary: summary(f.replying ? 'REPLY' : f.typed ? 'COMPOSE' : 'EMPTY', f.screen ? 'x' : '', f.typed ? 'x' : '', f.sent),
  })), now).sort((a, b) => b.time - a.time);
}

export function syncReadLog(): Promise<Read[]> { return ordered(async () => {
  snapshot = recordFacts(await Native.takeTapFacts());
  return readLog();
}); }

export function wipeReadLog(): Promise<void> { return ordered(async () => {
  await Native.clearTapFacts();
  snapshot = [];
}); }

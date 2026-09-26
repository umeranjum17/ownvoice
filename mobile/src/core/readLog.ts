import { type Read, keep, summary } from './privacy';
import Storage from 'expo-sqlite/kv-store';
import { store } from './store';
import Native, { type TapFact } from '../../modules/ownvoice-native';

// Privacy.reads and Privacy.record on the phone's key-value store: metadata only, newest first,
// anything older than 30 days dropped on every read. The text a tap read is never part of a fact.
const KEY = 'reads';
let pending: Promise<unknown> = Promise.resolve();
const ordered = <T>(run: () => Promise<T>): Promise<T> => {
  const next = pending.then(run, run);
  pending = next.catch(() => {});
  return next;
};

export function readLog(now = Date.now()): Read[] {
  const raw = Storage.getItemSync(KEY);
  const saved = raw == null ? [] : JSON.parse(raw) as Read[];
  const reads = keep(saved, now).sort((a, b) => b.time - a.time);
  if (reads.length !== saved.length) store.set(KEY, reads);
  return reads;
}

/** The bubble taps the phone logged since the last look, added to the log. */
export function recordFacts(facts: TapFact[], now = Date.now()): Read[] {
  const saved = readLog(now);
  if (!facts.length) return saved;
  const seen = new Set(saved.map(r => r.id));
  const added = facts.filter(f => !seen.has(f.id)).map(f => ({
    id: f.id, time: f.at, app: f.app, label: f.label,
    summary: summary(f.replying ? 'REPLY' : f.typed ? 'COMPOSE' : 'EMPTY', f.screen ? 'x' : '', f.typed ? 'x' : ''),
  }));
  const reads = keep([...saved, ...added], now).sort((a, b) => b.time - a.time);
  if (added.length) store.set(KEY, reads);
  return reads;
}

export function syncReadLog(): Promise<Read[]> { return ordered(async () => {
  const facts = await Native.takeTapFacts();
  const reads = recordFacts(facts);
  if (facts.length) await Native.ackTapFacts(facts.map(f => f.id));
  return reads;
}); }

export function wipeReadLog(): Promise<void> { return ordered(async () => {
  await Native.clearTapFacts();
  store.set(KEY, null);
}); }

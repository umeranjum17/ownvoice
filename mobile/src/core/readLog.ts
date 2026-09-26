import { type Read, keep, summary } from './privacy';
import { store } from './store';
import Native, { type TapFact } from '../../modules/ownvoice-native';

// Privacy.reads and Privacy.record on the phone's key-value store: metadata only, newest first,
// anything older than 30 days dropped on every read. The text a tap read is never part of a fact.
const KEY = 'reads';

export function readLog(now = Date.now()): Read[] {
  const saved = store.get<Read[]>(KEY) ?? [];
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

export async function syncReadLog(): Promise<Read[]> {
  const facts = await Native.takeTapFacts();
  const reads = recordFacts(facts);
  if (facts.length) await Native.ackTapFacts(facts.map(f => f.id));
  return reads;
}

export function wipeReadLog(): void { store.set(KEY, null); }

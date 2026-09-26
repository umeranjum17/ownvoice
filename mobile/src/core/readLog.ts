import { type Read, keep, summary } from './privacy';
import Native, { type TapFact } from '../../modules/ownvoice-native';
import Storage from 'expo-sqlite/kv-store';

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
    summary: f.legacySummary ?? summary(f.replying ? 'REPLY' : f.typed ? 'COMPOSE' : 'EMPTY', f.screen ? 'x' : '', f.typed ? 'x' : '', f.sent),
  })), now).sort((a, b) => b.time - a.time);
}

// Import the prior JS log once; an interrupted deletion is safe because native deduplicates IDs.
async function migrate() {
  const old = Storage.getItemSync('reads');
  if (old == null) return;
  const rows = JSON.parse(old) as Read[];
  if (!Array.isArray(rows)) throw new Error('Invalid read history');
  await Native.importReadHistory(rows.map((row, index) => ({
    id: row.id ?? `legacy-${index}-${row.time}`, time: row.time, app: row.app, label: row.label, summary: row.summary,
  })));
  Storage.removeItemSync('reads');
}

export function syncReadLog(): Promise<Read[]> { return ordered(async () => {
  await migrate();
  snapshot = recordFacts(await Native.takeTapFacts());
  return readLog();
}); }

export function wipeReadLog(): Promise<void> { return ordered(async () => {
  // Delete the legacy key first so a failed deletion cannot resurrect a cleared native log.
  Storage.removeItemSync('reads');
  await Native.clearTapFacts();
  snapshot = [];
}); }

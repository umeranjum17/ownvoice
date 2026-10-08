import Storage from 'expo-sqlite/kv-store';

// App settings that must survive process death (the equivalent of Kotlin's commit()).
// Read history itself is owned by the native service, not this store.
export const OUTCOMES = 'reply-outcomes';
export const KEEP_REPLIES = 'keep-replies';
export const GROWTH_COUNTS = 'growth-counts';
export type CheckinAnswer = 'replies' | 'likes' | 'nothing' | 'not-posted';
export type Outcome = { id: string; platform: string; platformLabel: string; level: string | null; card: 'yours' | 'suggestion'; slot: number; at: number; text?: string; checkin?: CheckinAnswer; checkinAt?: number };
export type GrowthCount = { at: number; x: string; reddit: string };
/** A recorded insert becomes a check-in line about a day later. */
export const CHECKIN_MS = 24 * 60 * 60 * 1000;
/** The weekly numbers card waits a week after the last saved counts. */
export const COUNTS_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const snapshots = new Map<string, unknown>();
export const store = {
  peek<T>(name: string): T | null { return (snapshots.get(name) as T | undefined) ?? null; },
  get<T>(name: string, strict = false): T | null {
    try {
      const raw = Storage.getItemSync(name);
      const value = raw == null ? null : (JSON.parse(raw) as T);
      snapshots.set(name, value);
      return value;
    } catch (error) {
      if (strict) throw error;
      return null;
    }
  },
  set(name: string, value: unknown): void {
    if (value == null) Storage.removeItemSync(name);
    else Storage.setItemSync(name, JSON.stringify(value));
    snapshots.set(name, value);
  },
};

export function outcomes(): Outcome[] {
  const saved = store.get<Outcome[]>(OUTCOMES, true);
  if (saved !== null && !Array.isArray(saved)) throw new Error('Saved replies could not be read.');
  return saved ?? [];
}

/** One synchronous SQLite statement replaces the list atomically; a failed read never overwrites it.
 * ponytail: O(n) list rewrite; use a row table if a long history makes writes slow.
 * No writer, fetch, or analytics receives these records. Consent is checked at the write, not capture. */
export function saveOutcome(value: Omit<Outcome, 'text' | 'checkin' | 'checkinAt'>, text: string): void {
  const rows = outcomes();
  if (rows.some(row => row.id === value.id)) return;
  const keep = store.get<boolean>(KEEP_REPLIES, true) === true;
  store.set(OUTCOMES, [...rows, { ...value, ...(keep ? { text } : {}) }]);
}

/** A check-in answer lands on its own outcome record. Never changes how F6a writes inserts. */
export function answerOutcome(id: string, checkin: CheckinAnswer): void {
  const rows = outcomes();
  const at = rows.findIndex(row => row.id === id);
  if (at < 0 || rows[at].checkin) return;
  const next = [...rows];
  next[at] = { ...next[at], checkin, checkinAt: Date.now() };
  store.set(OUTCOMES, next);
}

/** The oldest unanswered insert old enough to ask about, or null when nothing is due. */
export function pendingCheckin(now = Date.now()): Outcome | null {
  const due = outcomes().filter(row => row.card === 'suggestion' && !row.checkin && now - row.at >= CHECKIN_MS);
  due.sort((a, b) => a.at - b.at);
  return due[0] ?? null;
}

export function growthCounts(): GrowthCount[] {
  const saved = store.get<GrowthCount[]>(GROWTH_COUNTS, true);
  if (saved !== null && !Array.isArray(saved)) throw new Error('Saved counts could not be read.');
  return saved ?? [];
}

/** His own typed counts, kept on this phone. Blank lines are dropped, never sent. */
export function saveGrowthCount(x: string, reddit: string, at = Date.now()): void {
  const entry = { at, x: x.trim(), reddit: reddit.trim() };
  for (const [field, value] of [['x', entry.x], ['reddit', entry.reddit]]) {
    if (value && (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || field === 'x' && Number(value) < 0)) {
      throw new Error('Enter whole numbers without commas or spaces.');
    }
  }
  if (!entry.x && !entry.reddit) return;
  store.set(GROWTH_COUNTS, [...growthCounts(), entry]);
}

/** The weekly card shows when no counts exist yet, or the last ones are a week old. */
export function needsWeeklyCount(now = Date.now()): boolean {
  const rows = growthCounts();
  return !rows.length || now - rows[rows.length - 1].at >= COUNTS_WEEK_MS;
}

/** Plain-word trend between the last two numbers, or null when there is nothing to compare. */
export function trendOf(values: number[]): 'up' | 'same' | 'down' | null {
  if (values.length < 2) return null;
  const [prev, last] = values.slice(-2);
  if (!Number.isFinite(prev) || !Number.isFinite(last)) return null;
  return last > prev ? 'up' : last < prev ? 'down' : 'same';
}

import Storage from 'expo-sqlite/kv-store';

// App settings that must survive process death (the equivalent of Kotlin's commit()).
// Read history itself is owned by the native service, not this store.
export const OUTCOMES = 'reply-outcomes';
export const KEEP_REPLIES = 'keep-replies';
export type Outcome = { id: string; platform: string; platformLabel: string; level: string | null; card: 'yours' | 'suggestion'; slot: number; at: number; text?: string; checkin?: 'replies' | 'likes' | 'nothing' | 'not-posted'; checkinAt?: number };
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
export function saveOutcome(value: Omit<Outcome, 'text'>, text: string): void {
  const rows = outcomes();
  if (rows.some(row => row.id === value.id)) return;
  const keep = store.get<boolean>(KEEP_REPLIES, true) === true;
  store.set(OUTCOMES, [...rows, { ...value, ...(keep ? { text } : {}) }]);
}

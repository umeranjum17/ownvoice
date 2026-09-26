import { keep, type Read } from './privacy';
import { store } from './store';

// "What Ownvoice read": what each tap did, never the text it saw. Entries name the app, what was on
// screen and whether ChatGPT wrote the replies (see Privacy.summary); 30 days, then they drop out.
const KEY = 'reads';

export function readLog(now = Date.now()): Read[] {
  let reads: Read[];
  try { reads = store.get<Read[]>(KEY, true) ?? []; } catch { return []; }
  const recent = keep(reads, now);
  if (recent.length !== reads.length) {
    try { store.set(KEY, recent.length ? recent : null); } catch {}
  }
  return recent;
}

export function logRead(read: Read, now = Date.now()): void {
  try { store.set(KEY, [...keep(store.get<Read[]>(KEY, true) ?? [], now), read]); } catch {}
}

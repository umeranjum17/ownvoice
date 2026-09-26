import { keep, type Read } from './privacy';
import { store } from './store';

// "What Ownvoice read": what each tap did, never the text it saw. Entries name the app, what was on
// screen and whether ChatGPT wrote the replies (see Privacy.summary); 30 days, then they drop out.
const KEY = 'reads';

export const readLog = (now = Date.now()): Read[] => keep(store.get<Read[]>(KEY) ?? [], now);

// ponytail: last 200 entries in one kv row; move to one row per read if the log ever needs paging.
export function logRead(read: Read, now = Date.now()): Read[] {
  const reads = [...readLog(now), read].slice(-200);
  store.set(KEY, reads);
  return reads;
}

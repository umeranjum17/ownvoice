import * as SecureStore from 'expo-secure-store';
import { KEEP_MS, type Read, keep, summary } from './privacy';
import type { TapFact } from '../../modules/ownvoice-native';

const KEY = 'ownvoice.reads';
export async function readLog(now = Date.now()): Promise<Read[]> {
  try {
    const saved = await SecureStore.getItemAsync(KEY);
    const reads = keep(saved ? JSON.parse(saved) as Read[] : [], now).sort((a, b) => b.time - a.time);
    if (saved) await SecureStore.setItemAsync(KEY, JSON.stringify(reads));
    return reads;
  } catch { return []; }
}
export async function recordFacts(facts: TapFact[], now = Date.now()): Promise<Read[]> {
  const previous = await readLog(now);
  const added = facts.map(f => ({ time: f.at, app: f.app, label: f.label, summary: summary(f.replying ? 'REPLY' : f.typed ? 'COMPOSE' : 'EMPTY', f.screen ? 'x' : '', f.typed ? 'x' : '') }));
  const reads = keep([...previous, ...added], now).sort((a, b) => b.time - a.time);
  await SecureStore.setItemAsync(KEY, JSON.stringify(reads));
  return reads;
}
export async function wipeReadLog() { await SecureStore.deleteItemAsync(KEY); }
export { KEEP_MS };

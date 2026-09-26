import { KEEP_MS, keep, summary, type Read } from '../privacy';
import * as SecureStore from 'expo-secure-store';
import { recordFacts, readLog, wipeReadLog } from '../readLog';

test('read log keeps 30 days of metadata and expires old entries', () => {
  const now = 1_800_000_000_000;
  const rows: Read[] = [{ time: now, app: 'pkg', label: 'Chat', summary: summary('REPLY', 'private message', '') }, { time: now - KEEP_MS, app: 'pkg', label: 'Chat', summary: 'old' }];
  expect(keep(rows, now)).toEqual([rows[0]]);
  expect(JSON.stringify(rows)).not.toContain('private message');
});

test('tap facts persist only a plain metadata summary and can be wiped', async () => {
  const now = 1_800_000_000_000;
  const store = SecureStore as jest.Mocked<typeof SecureStore>;
  store.getItemAsync.mockResolvedValueOnce(null);
  const rows = await recordFacts([{ at: now, app: 'pkg', label: 'Chat', screen: true, typed: true, replying: false }], now);
  expect(rows[0].summary).toBe('Polished your message. Read the chat on screen and your message.');
  expect(JSON.stringify(rows)).not.toContain('secret');
  expect(store.setItemAsync).toHaveBeenCalledWith('ownvoice.reads', JSON.stringify(rows));
  await wipeReadLog();
  expect(store.deleteItemAsync).toHaveBeenCalledWith('ownvoice.reads');
});

test('stored reads are pruned and sorted across launches', async () => {
  const now = 1_800_000_000_000;
  const rows: Read[] = [{ time: now - 1, app: 'pkg', label: 'New', summary: 'Suggested replies.' }, { time: now - KEEP_MS, app: 'pkg', label: 'Old', summary: 'Old.' }];
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(rows));
  expect(await readLog(now)).toEqual([rows[0]]);
});

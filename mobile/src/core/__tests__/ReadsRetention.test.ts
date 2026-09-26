import { logRead, readLog } from '../reads';
import { store } from '../store';

const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;
const day = 24 * 60 * 60 * 1000;

test('a history storage failure does not throw or erase earlier reads', () => {
  kv.clear();
  const first = { time: 100, app: 'first', label: 'First', summary: 'Read' };
  logRead(first, 100);
  const next = { time: 101, app: 'next', label: 'Next', summary: 'Read' };
  const write = jest.spyOn(store, 'set').mockImplementationOnce(() => { throw new Error('full'); });
  expect(() => logRead(next, 101)).not.toThrow();
  write.mockRestore();
  const storage = jest.requireMock('expo-sqlite/kv-store').default;
  const read = jest.spyOn(storage, 'getItemSync').mockImplementationOnce(() => { throw new Error('unavailable'); });
  expect(() => logRead(next, 101)).not.toThrow();
  read.mockRestore();
  expect(readLog(101)).toEqual([first]);
  logRead(next, 101);
  expect(readLog(101)).toEqual([first, next]);
});

test('a malformed history log is not overwritten', () => {
  kv.clear();
  kv.set('reads', 'not JSON');
  expect(() => logRead({ time: 100, app: 'next', label: 'Next', summary: 'Read' }, 100)).not.toThrow();
  expect(kv.get('reads')).toBe('not JSON');
});

test('opening history deletes expired entries from storage', () => {
  kv.clear();
  const now = 40 * day;
  const old = { time: now - 31 * day, app: 'old', label: 'Old', summary: 'Read' };
  const recent = { time: now - day, app: 'new', label: 'New', summary: 'Read' };
  store.set('reads', [old, recent]);
  expect(readLog(now)).toEqual([recent]);
  expect(store.get('reads')).toEqual([recent]);
  expect(readLog(now + 31 * day)).toEqual([]);
  expect(kv.has('reads')).toBe(false);
});

test('a failed history read never prunes or overwrites storage', () => {
  kv.clear();
  const old = { time: 0, app: 'old', label: 'Old', summary: 'Read' };
  store.set('reads', [old]);
  const storage = jest.requireMock('expo-sqlite/kv-store').default;
  const get = jest.spyOn(storage, 'getItemSync').mockImplementationOnce(() => { throw new Error('unavailable'); });
  try {
    expect(readLog(31 * day)).toEqual([]);
    expect(kv.get('reads')).toBe(JSON.stringify([old]));
  } finally { get.mockRestore(); }
  expect(readLog(31 * day)).toEqual([]);
  expect(kv.has('reads')).toBe(false);
});

test('all reads within 30 days survive regardless of count', () => {
  kv.clear();
  const now = 40 * day;
  logRead({ time: now - 31 * day, app: 'old', label: 'Old', summary: 'Old' }, now - 31 * day);
  for (let i = 0; i < 201; i++) logRead({ time: now - i, app: 'new', label: 'New', summary: 'Read' }, now);
  expect(readLog(now)).toHaveLength(201);
  expect(readLog(now).every(read => read.app === 'new')).toBe(true);
});

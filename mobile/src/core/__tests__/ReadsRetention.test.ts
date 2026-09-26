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
  const read = jest.spyOn(store, 'get').mockImplementationOnce(() => { throw new Error('unavailable'); });
  expect(() => logRead(next, 101)).not.toThrow();
  read.mockRestore();
  expect(readLog(101)).toEqual([first]);
});

test('all reads within 30 days survive regardless of count', () => {
  kv.clear();
  const now = 40 * day;
  logRead({ time: now - 31 * day, app: 'old', label: 'Old', summary: 'Old' }, now - 31 * day);
  for (let i = 0; i < 201; i++) logRead({ time: now - i, app: 'new', label: 'New', summary: 'Read' }, now);
  expect(readLog(now)).toHaveLength(201);
  expect(readLog(now).every(read => read.app === 'new')).toBe(true);
});

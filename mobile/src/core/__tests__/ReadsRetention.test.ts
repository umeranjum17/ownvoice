import { logRead, readLog } from '../reads';

const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;
const day = 24 * 60 * 60 * 1000;

test('all reads within 30 days survive regardless of count', () => {
  kv.clear();
  const now = 40 * day;
  logRead({ time: now - 31 * day, app: 'old', label: 'Old', summary: 'Old' }, now - 31 * day);
  for (let i = 0; i < 201; i++) logRead({ time: now - i, app: 'new', label: 'New', summary: 'Read' }, now);
  expect(readLog(now)).toHaveLength(201);
  expect(readLog(now).every(read => read.app === 'new')).toBe(true);
});

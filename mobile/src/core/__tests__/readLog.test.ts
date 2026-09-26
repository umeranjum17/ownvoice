import Native, { type TapFact } from '../../../modules/ownvoice-native';
import { KEEP_MS } from '../privacy';
const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;
import { readLog, recordFacts, syncReadLog, wipeReadLog } from '../readLog';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: { takeTapFacts: jest.fn(), clearTapFacts: jest.fn() } }));
const native = Native as jest.Mocked<typeof Native>;
const NOW = 1_800_000_000_000;
let sequence = 0;
const fact = (over: Partial<TapFact> = {}): TapFact => ({ id: String(++sequence), at: NOW, app: 'com.whatsapp', label: 'WhatsApp', screen: true, typed: false, replying: true, sent: false, ...over });

beforeEach(async () => { sequence = 0; jest.clearAllMocks(); native.clearTapFacts.mockResolvedValue(); await wipeReadLog(); });

test('native facts are displayed once per tap, newest first, with no JS history write', async () => {
  const older = fact({ at: NOW - 1000 });
  const newer = fact({ sent: true });
  native.takeTapFacts.mockResolvedValue([older, newer]);
  const rows = await syncReadLog();
  expect(rows).toHaveLength(2);
  expect(rows.map(r => r.id)).toEqual([newer.id, older.id]);
  expect(rows[0].summary).toBe('Suggested replies. Read the chat on screen. Sent to ChatGPT.');
  expect(rows[1].summary).not.toContain('ChatGPT');
  expect(readLog(NOW)).toEqual(rows);
  expect(recordFacts([older, newer], NOW)).toEqual(rows);
});

test('empty and typed taps disclose only metadata; 30-day retention is applied', () => {
  const rows = recordFacts([fact({ screen: false, replying: false }), fact({ typed: true, replying: false, screen: false }), fact({ at: NOW - KEEP_MS })], NOW);
  expect(rows.map(r => r.summary)).toEqual(['Nothing to help with. Nothing was on screen.', 'Polished your message. Read your message.']);
  expect(JSON.stringify(rows)).not.toMatch(/Sam|tent|stove/i);
});

test('wipe removes even malformed legacy history', async () => {
  kv.set('reads', 'invalid');
  await wipeReadLog();
  expect(kv.has('reads')).toBe(false);
  expect(native.clearTapFacts).toHaveBeenCalled();
});

test('failed refresh keeps the last native snapshot; failed wipe leaves it intact', async () => {
  native.takeTapFacts.mockResolvedValue([fact()]);
  await syncReadLog();
  native.takeTapFacts.mockRejectedValueOnce(new Error('unavailable'));
  await expect(syncReadLog()).rejects.toThrow('unavailable');
  expect(readLog()).toHaveLength(1);
  native.clearTapFacts.mockRejectedValueOnce(new Error('full'));
  await expect(wipeReadLog()).rejects.toThrow('full');
  expect(readLog()).toHaveLength(1);
  await wipeReadLog();
  expect(readLog()).toEqual([]);
});

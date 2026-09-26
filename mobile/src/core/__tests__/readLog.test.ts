import { KEEP_MS, type Read, keep } from '../privacy';
import { readLog, recordFacts, wipeReadLog } from '../readLog';
import { loadVoice, saveVoice, wipeVoice } from '../voice';
import { store } from '../store';
import type { TapFact } from '../../../modules/ownvoice-native';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: { clearTapFacts: jest.fn(async () => {}) } }));

const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;
const NOW = 1_800_000_000_000;
let sequence = 0;
const fact = (over: Partial<TapFact> = {}): TapFact => ({ id: String(++sequence), at: NOW, app: 'com.whatsapp', label: 'WhatsApp', screen: true, typed: false, replying: true, ...over });

beforeEach(() => { kv.clear(); sequence = 0; });

// PrivacyTest's keep and summary cases, through the log that shows them (checklist H5, 2.8).
test('the log keeps 30 days and drops anything older', () => {
  const rows: Read[] = [{ time: NOW, app: 'a', label: 'A', summary: 'new' }, { time: NOW - KEEP_MS, app: 'b', label: 'B', summary: 'old' }];
  expect(keep(rows, NOW)).toEqual([rows[0]]);
  kv.set('reads', JSON.stringify(rows));
  expect(readLog(NOW).map(r => r.summary)).toEqual(['new']);
});

test('a tap is logged as plain words with no text from the screen', () => {
  const rows = recordFacts([fact(), fact({ at: NOW - 1000, typed: true, replying: false, screen: false })], NOW);
  expect(rows[0].summary).toBe('Suggested replies. Read the chat on screen.');
  expect(rows[1].summary).toBe('Polished your message. Read your message.');
  expect(JSON.stringify(kv.get('reads'))).not.toMatch(/Sam|tent|stove|message box/i);
});

test('an unreadable tap logs nothing to help with', () => {
  expect(recordFacts([fact({ screen: false, typed: false, replying: false })], NOW)[0].summary).toBe('Nothing to help with. Nothing was on screen.');
});

test('the log survives a restart and stays newest first', () => {
  recordFacts([fact({ at: NOW - 5000 }), fact()], NOW);
  expect(readLog(NOW).map(r => r.time)).toEqual([NOW, NOW - 5000]);
});

test('Wipe everything clears the log and Your voice', async () => {
  recordFacts([fact()], NOW);
  saveVoice({ never: ['delve'], noDashes: true, statementEndings: false, note: 'blunt' });
  await wipeReadLog();
  wipeVoice();
  expect(readLog(NOW)).toEqual([]);
  expect(loadVoice().never).toEqual([]);
  expect(store.get('reads')).toBeNull();
});

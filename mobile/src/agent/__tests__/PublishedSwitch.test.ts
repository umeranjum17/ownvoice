import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {} }));
jest.mock('../../panel/phoneWriter', () => ({ phoneWriter: {} }));
jest.mock('../../core/source', () => ({
  getSource: jest.fn(async () => 'chatgpt'),
  cloudSession: () => require('../../chatgpt/session').accountSessions.chatgpt.session,
  cloudNow: () => require('../../chatgpt/session').accountSessions.chatgpt.now(),
}));
jest.mock('../../core/store', () => {
  const values = new Map<string, unknown>();
  return { store: {
    get: jest.fn((key: string) => values.get(key) ?? null),
    peek: jest.fn((key: string) => values.get(key) ?? null),
    set: jest.fn((key: string, value: unknown) => { values.set(key, value); }),
  } };
});
jest.mock('../../chatgpt/session', () => ({
  mocked: false,
  accountSessions: { chatgpt: { session: { current: jest.fn(async () => ({ signedIn: true })) }, now: jest.fn(() => ({ signedIn: true })) } },
  signOutGuard: jest.fn(() => ({ active: false, epoch: 0 })),
}));
jest.mock('../../chatgpt/accounts', () => {
  const respond = jest.fn(async () => ({ text: 'Hello Umer.', output: [] }));
  return {
    accounts: { respond },
    respond,
    codexAuth: jest.fn(async () => ({ access: 'fixture', accountId: 'fixture' })),
    reportFailure: jest.fn(),
  };
});
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('../../core/localModel', () => ({ askLocal: jest.fn(), localModelState: jest.fn(async () => ({ phase: 'ready' })), agreedToDownload: jest.fn(() => false) }));

beforeEach(() => { jest.resetModules(); });

// This public, signed JSON is the switch endpoint's payload contract. Exercise its actual
// signature with the production public key, real switch storage and agent consent path.
test.each(['published', 'missing', 'invalid'] as const)('%s switch on a fresh install governs agent dispatch', async kind => {
  const flag = JSON.parse(readFileSync(resolve(__dirname, '../../../../switch/chatgpt.json'), 'utf8'));
  if (kind === 'invalid') {
    const signature = Buffer.from(flag.sig, 'base64');
    signature[0] ^= 1;
    flag.sig = signature.toString('base64');
  }
  const originalFetch = global.fetch;
  const switchFetch = jest.fn(async () => ({ ok: kind !== 'missing', json: async () => flag } as Response));
  global.fetch = switchFetch;
  try {
    const { store } = require('../../core/store') as typeof import('../../core/store');
    const { accounts } = require('../../chatgpt/accounts') as typeof import('../../chatgpt/accounts');
    const { SWITCH_URL } = require('../../core/switch') as typeof import('../../core/switch');
    const { words } = require('../../core/words') as typeof import('../../core/words');
    const { chatgptBrain } = require('../chatgptBrain') as typeof import('../chatgptBrain');
    expect(store.get('chatgpt-switch')).toBeNull();
    const result = chatgptBrain().step('Write a greeting.', [], []);
    if (kind === 'published') {
      expect(flag.payload).toMatchObject({ v: 1, app: 'ownvoice', chatgpt: 'on' });
      await expect(result).resolves.toEqual({ text: 'Hello Umer.', calls: [] });
      expect(store.get('chatgpt-switch')).toMatchObject({ seq: flag.payload.seq, chatgpt: 'on' });
      expect(accounts.respond).toHaveBeenCalledTimes(1);
    } else {
      await expect(result).rejects.toThrow(words.switchUnavailable);
      expect(store.get('chatgpt-switch')).toBeNull();
      expect(accounts.respond).not.toHaveBeenCalled();
    }
    expect(switchFetch).toHaveBeenCalledWith(SWITCH_URL, expect.objectContaining({ method: 'GET' }));
  } finally { global.fetch = originalFetch; }
});

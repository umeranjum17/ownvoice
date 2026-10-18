import { fakeLlama } from '@byokit/infer/testing';
import { initLlama } from 'llama.rn';
jest.mock('../localModel', () => ({
  AGREED_KEY: 'local-model-agreed',
  MOBILE_KEY: 'local-model-mobile-data',
  localModelState: jest.fn(),
  agreedToDownload: jest.fn(),
  installLocalModel: jest.fn(),
  removeLocalModel: jest.fn(),
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(), installJsi: jest.fn(async () => {}) }));
jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {} }));
jest.mock('../localStore', () => ({
  createLocalStore: () => ({
    path: (m: { file: string }) => `/models/${m.file}`,
    size: async (m: { bytes: number }) => m.bytes,
    sha256: async (m: { sha256: string }) => m.sha256,
    remove: async () => {},
  }),
}));
import { agreedToDownload, localModelState } from '../localModel';
import type { InferState } from '@byokit/infer';
import { phoneCanWrite } from '../phoneStatus';
import { AGREED_KEY } from '../phoneDownload';

const mockState = localModelState as jest.MockedFunction<typeof localModelState>;
const mockAgreed = agreedToDownload as jest.MockedFunction<typeof agreedToDownload>;
const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;

let gate: Promise<void> = Promise.resolve();
const llama = fakeLlama({ reply: async () => { await gate; return '{}'; } });
(initLlama as jest.Mock).mockImplementation(llama.initLlama);
const decodes = () => llama.contexts.reduce((count, context) => count + context.completions.length, 0);
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

beforeEach(() => {
  jest.clearAllMocks();
  kv.clear();
  mockAgreed.mockImplementation(() => kv.get(AGREED_KEY) === 'true');
});

test.each([
  ['ready', 'ready'],
  ['busy', 'ready'],
  ['not-installed', 'needsDownload'],
  ['installing', 'preparing'],
  ['installed', 'ready'],
  ['loading', 'preparing'],
  ['unsupported', 'cant'],
  ['failed', 'cant'],
] as const)('phase %s maps to %s', async (phase, expected) => {
  mockState.mockResolvedValue({ phase } as InferState);
  await expect(phoneCanWrite()).resolves.toBe(expected);
});

test('a thrown state call maps to cant', async () => {
  mockState.mockRejectedValue(new Error('BACKGROUND_USE_BLOCKED'));
  await expect(phoneCanWrite()).resolves.toBe('cant');
});

test('a not-installed phone is getting ready only once the person said yes to the download', async () => {
  mockState.mockResolvedValue({ phase: 'not-installed' });
  kv.set(AGREED_KEY, 'true');
  await expect(phoneCanWrite()).resolves.toBe('preparing');
});

test('a call that lands during a real on-device decode reads as ready, not cant', async () => {
  const actual = jest.requireActual<typeof import('../localModel')>('../localModel');
  mockState.mockImplementation(actual.localModelState);
  let release!: () => void;
  gate = new Promise<void>(resolve => { release = resolve; });
  const answer = actual.askLocal('tone', 80);
  while (decodes() === 0) await tick();
  const ready = phoneCanWrite();
  release();
  await expect(answer).resolves.toBe('{}');
  await expect(ready).resolves.toBe('ready');
});

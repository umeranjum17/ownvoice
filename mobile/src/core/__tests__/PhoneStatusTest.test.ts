jest.mock('../localModel', () => ({
  AGREED_KEY: 'local-model-agreed',
  MOBILE_KEY: 'local-model-mobile-data',
  localModelState: jest.fn(),
  agreedToDownload: jest.fn(),
  installLocalModel: jest.fn(),
  removeLocalModel: jest.fn(),
}));
import { agreedToDownload, localModelState } from '../localModel';
import type { InferState } from '@byokit/infer';
import { phoneCanWrite } from '../phoneStatus';
import { AGREED_KEY } from '../phoneDownload';

const mockState = localModelState as jest.MockedFunction<typeof localModelState>;
const mockAgreed = agreedToDownload as jest.MockedFunction<typeof agreedToDownload>;
const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;

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
  ['installed', 'preparing'],
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

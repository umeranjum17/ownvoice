import Native from '../../../modules/ownvoice-native';
import { phoneCanWrite } from '../phoneStatus';
import { AGREED_KEY } from '../phoneDownload';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: { modelStatus: jest.fn() } }));

const native = Native as jest.Mocked<typeof Native>;
const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;

beforeEach(() => { jest.clearAllMocks(); kv.clear(); });

test.each([
  ['available', 'ready'],
  ['downloadable', 'needsDownload'],
  ['downloading', 'preparing'],
  ['unavailable', 'cant'],
] as const)('status %s maps to %s', async (status, expected) => {
  native.modelStatus.mockResolvedValue(status);
  await expect(phoneCanWrite()).resolves.toBe(expected);
});

test('a thrown status call maps to cant', async () => {
  native.modelStatus.mockRejectedValue(new Error('BACKGROUND_USE_BLOCKED'));
  await expect(phoneCanWrite()).resolves.toBe('cant');
});

test('a downloadable phone is getting ready only once the person said yes to the download', async () => {
  native.modelStatus.mockResolvedValue('downloadable');
  kv.set(AGREED_KEY, 'true');
  await expect(phoneCanWrite()).resolves.toBe('preparing');
});

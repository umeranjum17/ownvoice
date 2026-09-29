import Native from '../../../modules/ownvoice-native';
import { phoneCanWrite } from '../phoneStatus';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: { modelStatus: jest.fn() } }));

const native = Native as jest.Mocked<typeof Native>;

beforeEach(jest.clearAllMocks);

test.each([
  ['available', 'ready'],
  ['downloadable', 'preparing'],
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

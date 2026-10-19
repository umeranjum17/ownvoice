// The missing-pack flow: dictateReady names the gap, ensurePack fetches it and waits
// until the recognizer reports ready, giving up plainly when it never does.
import Native from '../../../modules/ownvoice-native';
import { dictateReady, ensurePack } from '../dictate';
import { words } from '../../core/words';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  dictateAvailable: jest.fn(),
  dictateSupport: jest.fn(),
  dictateDownload: jest.fn(),
  dictatePanelVisible: jest.fn(),
  logDev: jest.fn(),
} }));

const native = Native as jest.Mocked<typeof Native>;
const mockAvailable = native.dictateAvailable as jest.Mock;
const mockSupport = native.dictateSupport as jest.Mock;
const mockDownload = native.dictateDownload as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockAvailable.mockResolvedValue('ready');
  mockSupport.mockResolvedValue('ready');
  mockDownload.mockResolvedValue('started');
  (native.dictatePanelVisible as jest.Mock).mockResolvedValue(undefined);
});

test('a ready recognizer needs nothing', async () => {
  await expect(dictateReady()).resolves.toBeNull();
  expect(mockDownload).not.toHaveBeenCalled();
});

test('a missing pack names the gap', async () => {
  mockSupport.mockResolvedValue('needs-download');
  await expect(dictateReady()).resolves.toBe(words.dictateLanguage);
});

test('an unknown check never stays silent', async () => {
  mockSupport.mockResolvedValue('unknown');
  await expect(dictateReady()).resolves.toBe(words.dictateUnavailable);
});

test('a refused microphone names the fix', async () => {
  mockAvailable.mockResolvedValue('mic-blocked');
  await expect(dictateReady()).resolves.toBe(words.dictateMic);
  expect(mockSupport).not.toHaveBeenCalled();
});

test('ensurePack waits until the pack lands', async () => {
  mockSupport.mockResolvedValueOnce('needs-download').mockResolvedValueOnce('needs-download').mockResolvedValue('ready');
  await expect(ensurePack(5, 1000)).resolves.toBe(true);
  expect(mockDownload).toHaveBeenCalledTimes(1);
});

test('ensurePack gives up plainly when the pack never lands', async () => {
  mockSupport.mockResolvedValue('needs-download');
  await expect(ensurePack(5, 30)).resolves.toBe(false);
});

import Native from '../../../modules/ownvoice-native';
import { AGREED_KEY, MOBILE_KEY, agreed, getReady, removeDownload, resume } from '../phoneDownload';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  modelStatus: jest.fn(), downloadModel: jest.fn(), cancelModelDownload: jest.fn(), deleteModel: jest.fn(),
} }));

const native = Native as jest.Mocked<typeof Native>;
const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  jest.clearAllMocks();
  kv.clear();
  native.modelStatus.mockResolvedValue('downloadable');
  native.downloadModel.mockResolvedValue(undefined);
  native.deleteModel.mockResolvedValue(undefined);
});

test('a mobile-data download picks up on mobile data after a restart', async () => {
  kv.set(AGREED_KEY, 'true');
  kv.set(MOBILE_KEY, 'true');
  await resume();
  expect(native.downloadModel).toHaveBeenCalledTimes(1);
  expect(native.downloadModel).toHaveBeenCalledWith({ allowMobileData: true }, expect.any(Function));
});

test('a restart with no explicit choice keeps mobile data allowed', async () => {
  kv.set(AGREED_KEY, 'true');
  kv.set(MOBILE_KEY, 'true');
  await getReady();
  expect(native.downloadModel).toHaveBeenCalledWith({ allowMobileData: true }, expect.any(Function));
  expect(kv.get(MOBILE_KEY)).toBe('true');
});

test('a Wi-Fi download resumes Wi-Fi-only', async () => {
  kv.set(AGREED_KEY, 'true');
  await resume();
  expect(native.downloadModel).toHaveBeenCalledWith({ allowMobileData: false }, expect.any(Function));
});

test('asking for mobile data mid-run restarts the download with mobile data allowed', async () => {
  const wifi = deferred();
  const mobile = deferred();
  native.downloadModel.mockReturnValueOnce(wifi.promise).mockReturnValueOnce(mobile.promise);
  const first = getReady();
  expect(native.downloadModel).toHaveBeenLastCalledWith({ allowMobileData: false }, expect.any(Function));
  const second = getReady(true);
  expect(native.cancelModelDownload).toHaveBeenCalledTimes(1);
  await Promise.resolve();
  expect(native.downloadModel).toHaveBeenLastCalledWith({ allowMobileData: true }, expect.any(Function));
  expect(kv.get(MOBILE_KEY)).toBe('true');
  wifi.resolve();
  mobile.resolve();
  await first.catch(() => {});
  await second;
});

test('a second ask without mobile data joins the running download', async () => {
  const run = deferred();
  native.downloadModel.mockReturnValueOnce(run.promise);
  const first = getReady();
  const second = getReady(false);
  expect(native.downloadModel).toHaveBeenCalledTimes(1);
  expect(native.cancelModelDownload).not.toHaveBeenCalled();
  run.resolve();
  await first;
  await second;
});

test('a failed removal keeps the yes so the card stays', async () => {
  kv.set(AGREED_KEY, 'true');
  kv.set(MOBILE_KEY, 'true');
  native.deleteModel.mockRejectedValueOnce(new Error('locked'));
  await expect(removeDownload()).rejects.toThrow('locked');
  expect(agreed()).toBe(true);
  expect(kv.has(MOBILE_KEY)).toBe(true);
});

test('a successful removal forgets the yes and the mobile-data choice', async () => {
  kv.set(AGREED_KEY, 'true');
  kv.set(MOBILE_KEY, 'true');
  await removeDownload();
  expect(kv.has(AGREED_KEY)).toBe(false);
  expect(kv.has(MOBILE_KEY)).toBe(false);
});

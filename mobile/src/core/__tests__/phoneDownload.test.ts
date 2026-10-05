jest.mock('../localModel', () => ({
  AGREED_KEY: 'local-model-agreed',
  MOBILE_KEY: 'local-model-mobile-data',
  getLocalModel: jest.fn(() => ({ state: { phase: 'installing' } })),
  localModelState: jest.fn(),
  agreedToDownload: jest.fn(),
  installLocalModel: jest.fn(),
  removeLocalModel: jest.fn(),
}));
import { agreedToDownload, installLocalModel, localModelState, removeLocalModel } from '../localModel';
import { AGREED_KEY, MOBILE_KEY, agreed, getReady, removeDownload, resume } from '../phoneDownload';

const mockState = localModelState as jest.MockedFunction<typeof localModelState>;
const mockAgreed = agreedToDownload as jest.MockedFunction<typeof agreedToDownload>;
const mockInstall = installLocalModel as jest.MockedFunction<typeof installLocalModel>;
const mockRemove = removeLocalModel as jest.MockedFunction<typeof removeLocalModel>;
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
  mockAgreed.mockImplementation(() => kv.get(AGREED_KEY) === 'true');
  mockState.mockResolvedValue({ phase: 'not-installed' });
  mockInstall.mockResolvedValue(undefined);
  mockRemove.mockImplementation(async () => { kv.delete(AGREED_KEY); kv.delete(MOBILE_KEY); });
});

test('a mobile-data download picks up on mobile data after a restart', async () => {
  kv.set(AGREED_KEY, 'true');
  kv.set(MOBILE_KEY, 'true');
  await resume();
  expect(mockInstall).toHaveBeenCalledTimes(1);
  expect(mockInstall).toHaveBeenCalledWith(true, expect.any(Function), expect.any(AbortSignal));
});

test('a restart with no explicit choice keeps mobile data allowed', async () => {
  kv.set(AGREED_KEY, 'true');
  kv.set(MOBILE_KEY, 'true');
  await getReady();
  expect(mockInstall).toHaveBeenCalledWith(true, expect.any(Function), expect.any(AbortSignal));
  expect(kv.get(MOBILE_KEY)).toBe('true');
});

test('a Wi-Fi download resumes Wi-Fi-only', async () => {
  kv.set(AGREED_KEY, 'true');
  await resume();
  expect(mockInstall).toHaveBeenCalledWith(false, expect.any(Function), expect.any(AbortSignal));
});

test('asking for mobile data mid-run restarts the download with mobile data allowed', async () => {
  const wifi = deferred();
  const mobile = deferred();
  mockInstall.mockReturnValueOnce(wifi.promise).mockReturnValueOnce(mobile.promise);
  const first = getReady();
  expect(mockInstall).toHaveBeenLastCalledWith(false, expect.any(Function), expect.any(AbortSignal));
  const second = getReady(true);
  expect(mockInstall).toHaveBeenCalledTimes(2);
  expect(mockInstall).toHaveBeenLastCalledWith(true, expect.any(Function), expect.any(AbortSignal));
  expect(kv.get(MOBILE_KEY)).toBe('true');
  wifi.resolve();
  mobile.resolve();
  await first.catch(() => {});
  await second;
  expect((mockInstall.mock.calls[0][2] as AbortSignal).aborted).toBe(true);
});

test('a second ask without mobile data joins the running download', async () => {
  const run = deferred();
  mockInstall.mockReturnValueOnce(run.promise);
  const first = getReady();
  const second = getReady(false);
  expect(mockInstall).toHaveBeenCalledTimes(1);
  run.resolve();
  await first;
  await second;
});

test('a failed removal keeps the yes so the card stays', async () => {
  kv.set(AGREED_KEY, 'true');
  kv.set(MOBILE_KEY, 'true');
  mockRemove.mockRejectedValueOnce(new Error('locked'));
  await expect(removeDownload()).rejects.toThrow('locked');
  expect(agreed()).toBe(true);
  expect(kv.has(MOBILE_KEY)).toBe(true);
});

test('a successful removal forgets the yes and the mobile-data choice', async () => {
  kv.set(AGREED_KEY, 'true');
  kv.set(MOBILE_KEY, 'true');
  await removeDownload();
  expect(mockRemove).toHaveBeenCalledTimes(1);
  expect(kv.has(AGREED_KEY)).toBe(false);
  expect(kv.has(MOBILE_KEY)).toBe(false);
});

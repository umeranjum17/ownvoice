// The phone writer needs llama.rn's JNI library. An APK without it can hold the model file and
// still never start, so the phone must read as unable to write, not as ready.
import { installJsi } from 'llama.rn';
import { localModelState } from '../localModel';

jest.mock('llama.rn', () => ({ initLlama: jest.fn(), installJsi: jest.fn(async () => {}) }));
jest.mock('@byokit/infer', () => ({
  model: () => ({}),
  LocalModel: class { check = async () => ({ phase: 'ready' }); },
}));
jest.mock('../localStore', () => ({ createLocalStore: () => ({}) }));
jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: { networkType: jest.fn() } }));

const mockInstall = installJsi as jest.MockedFunction<typeof installJsi>;

test('a phone whose llama.rn library did not load reads as unable to write', async () => {
  mockInstall.mockRejectedValueOnce(new Error('JSI bindings not installed'));
  expect(await localModelState()).toEqual({ phase: 'unsupported' });
});

test('a phone whose llama.rn library loaded reports the model state', async () => {
  expect(await localModelState()).toEqual({ phase: 'ready' });
});

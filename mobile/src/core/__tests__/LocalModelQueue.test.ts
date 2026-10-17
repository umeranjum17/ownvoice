import { InferError } from '@byokit/infer';
import { askLocal } from '../localModel';
import { phoneCanWrite } from '../phoneStatus';
import { getReady } from '../phoneDownload';

const mockComplete = jest.fn();
const mockCheck = jest.fn();
const mockInstall = jest.fn(async () => {});

jest.mock('@byokit/infer', () => {
  const actual = jest.requireActual('@byokit/infer');
  return {
    ...actual,
    model: () => ({}),
    LocalModel: jest.fn().mockImplementation(() => ({ complete: mockComplete, check: mockCheck, install: mockInstall })),
  };
});
jest.mock('llama.rn', () => ({ initLlama: jest.fn() }));
jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {} }));
jest.mock('../localStore', () => ({ createLocalStore: () => ({}) }));
jest.mock('../store', () => ({ store: { get: jest.fn(), set: jest.fn() } }));

// Mirrors the library's single native context: an overlapping call or state check rejects busy.
let running = false;
const busy = () => new InferError('busy', 'Another on-device call is running.');
mockComplete.mockImplementation(async ({ prompt }: { prompt: string }) => {
  if (running) throw busy();
  running = true;
  try {
    await new Promise(resolve => setTimeout(resolve, 5));
    return { text: `answer to ${prompt}` };
  } finally { running = false; }
});
mockCheck.mockImplementation(async () => {
  if (running) throw busy();
  return { phase: 'ready' };
});
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('overlapping on-device calls run one after another and both answer', async () => {
  const answers = await Promise.all([askLocal('tone', 80), askLocal('fit', 400), askLocal('why', 220)]);
  expect(answers).toEqual(['answer to tone', 'answer to fit', 'answer to why']);
});

test('a failed on-device call does not block the calls queued behind it', async () => {
  mockComplete.mockRejectedValueOnce(new Error('model stopped'));
  await expect(askLocal('first', 5)).rejects.toThrow('model stopped');
  await expect(askLocal('second', 5)).resolves.toBe('answer to second');
});

test('a state check during an on-device call reads as ready', async () => {
  const answer = askLocal('tone', 80);
  await settle();
  await expect(phoneCanWrite()).resolves.toBe('ready');
  await expect(answer).resolves.toBe('answer to tone');
});

test('a state check while the model downloads reads as preparing', async () => {
  mockInstall.mockImplementationOnce(async () => {
    running = true;
    await new Promise(resolve => setTimeout(resolve, 20));
    running = false;
  });
  const download = getReady(true);
  await settle();
  await expect(phoneCanWrite()).resolves.toBe('preparing');
  await download;
});

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
jest.mock('llama.rn', () => ({ initLlama: jest.fn(), installJsi: jest.fn(async () => {}) }));
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

test('a call queued behind a pending call starts only after it settles', async () => {
  mockComplete.mockClear();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  mockComplete.mockImplementationOnce(async () => { await gate; return { text: 'tone' }; });
  const tone = askLocal('tone', 80);
  const fit = askLocal('fit', 256);
  await settle();
  expect(mockComplete).toHaveBeenCalledTimes(1);
  release();
  await expect(tone).resolves.toBe('tone');
  await expect(fit).resolves.toBe('answer to fit');
  expect(mockComplete).toHaveBeenCalledTimes(2);
});

test('a queued call aborted before its turn never starts the model', async () => {
  mockComplete.mockClear();
  const controller = new AbortController();
  const first = askLocal('first', 5);
  const queued = askLocal('queued', 5, controller.signal);
  controller.abort();
  await expect(queued).rejects.toBe(controller.signal.reason);
  await expect(first).resolves.toBe('answer to first');
  expect(mockComplete.mock.calls.map(([args]) => args.prompt)).toEqual(['first']);
});

test('a failed on-device call does not block the calls queued behind it', async () => {
  mockComplete.mockRejectedValueOnce(new Error('model stopped'));
  await expect(askLocal('first', 5)).rejects.toThrow('model stopped');
  await expect(askLocal('second', 5)).resolves.toBe('answer to second');
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

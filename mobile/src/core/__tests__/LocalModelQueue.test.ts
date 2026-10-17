import { InferError } from '@byokit/infer';
import { askLocal } from '../localModel';

const mockComplete = jest.fn();

jest.mock('@byokit/infer', () => {
  const actual = jest.requireActual('@byokit/infer');
  return { ...actual, model: () => ({}), LocalModel: jest.fn().mockImplementation(() => ({ complete: mockComplete })) };
});
jest.mock('llama.rn', () => ({ initLlama: jest.fn() }));
jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {} }));
jest.mock('../localStore', () => ({ createLocalStore: () => ({}) }));
jest.mock('../store', () => ({ store: { get: jest.fn(), set: jest.fn() } }));

// Mirrors the library's single native context: an overlapping call rejects busy.
let running = false;
mockComplete.mockImplementation(async ({ prompt }: { prompt: string }) => {
  if (running) throw new InferError('busy', 'Another on-device call is running.');
  running = true;
  try {
    await new Promise(resolve => setTimeout(resolve, 5));
    return { text: `answer to ${prompt}` };
  } finally { running = false; }
});

test('overlapping on-device calls run one after another and both answer', async () => {
  const answers = await Promise.all([askLocal('tone', 80), askLocal('fit', 400), askLocal('why', 220)]);
  expect(answers).toEqual(['answer to tone', 'answer to fit', 'answer to why']);
});

test('a failed on-device call does not block the calls queued behind it', async () => {
  mockComplete.mockRejectedValueOnce(new Error('model stopped'));
  await expect(askLocal('first', 5)).rejects.toThrow('model stopped');
  await expect(askLocal('second', 5)).resolves.toBe('answer to second');
});

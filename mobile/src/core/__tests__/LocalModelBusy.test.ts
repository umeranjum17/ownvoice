import { fakeLlama } from '@byokit/infer/testing';
import { initLlama } from 'llama.rn';
import { askLocal, localModelState } from '../localModel';
import { phoneCanWrite } from '../phoneStatus';

jest.mock('llama.rn', () => ({ initLlama: jest.fn() }));
jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {} }));
jest.mock('../localStore', () => ({
  createLocalStore: () => ({
    path: (m: { file: string }) => `/models/${m.file}`,
    size: async (m: { bytes: number }) => m.bytes,
    sha256: async (m: { sha256: string }) => m.sha256,
    remove: async () => {},
  }),
}));

let gate: Promise<void> = Promise.resolve();
const llama = fakeLlama({ reply: async () => { await gate; return '{}'; } });
(initLlama as jest.Mock).mockImplementation(llama.initLlama);
const decodes = () => llama.contexts.reduce((count, context) => count + context.completions.length, 0);
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

test('a state check during a real on-device decode is rejected busy, and the phone still reads ready', async () => {
  let release!: () => void;
  gate = new Promise<void>(resolve => { release = resolve; });
  const answer = askLocal('tone', 80);
  while (decodes() === 0) await tick();
  await expect(localModelState()).rejects.toMatchObject({ code: 'busy' });
  await expect(phoneCanWrite()).resolves.toBe('ready');
  release();
  await expect(answer).resolves.toBe('{}');
});

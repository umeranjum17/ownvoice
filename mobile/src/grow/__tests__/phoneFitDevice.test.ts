import type { Question } from '@byokit/decide';
import { fakeLlama } from '@byokit/infer/testing';
import { LocalModel, model } from '@byokit/infer';
import { initLlama } from 'llama.rn';
import { judgeFit, LEVELS, UNSURE } from '../fit';
import { FIT_TOKENS, phoneFit } from '../phoneFit';
import { platformForApp } from '../../core/platforms';

jest.mock('llama.rn', () => ({ initLlama: jest.fn() }));
jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {} }));
jest.mock('../../core/localStore', () => ({
  createLocalStore: () => ({ path: (m: { file: string }) => `/models/${m.file}`, size: async (m: { bytes: number }) => m.bytes,
    sha256: async (m: { sha256: string }) => m.sha256, remove: async () => {} }),
}));

type Params = { n_predict?: number; n_probs?: number; response_format?: unknown; messages?: { content: string }[] };
const sent: Params[] = [];
let maxConcurrent = 0;
let active = 0;
let failingCard = -1;
let slowFromCard = -1;
let noCommitCard = -1;
// The letter each card earns, by its content. Like llama.rn at temperature 0 on the test phone (2026-10-19), every
// call reports one identical one-hot top list whatever letter it writes, so only the written letter tells cards apart.
const LETTER: [string, string][] = [['standups not so much', 'B'], ['some meetings should', 'A'], ['keep us honest', 'C'], ['did you cut first', 'D']];
const llama = fakeLlama({ reply: async request => {
  const p = request as unknown as Params;
  sent.push(p);
  active++;
  maxConcurrent = Math.max(maxConcurrent, active);
  await Promise.resolve();
  active--;
  const i = sent.length - 1;
  if (slowFromCard >= 0 && i >= slowFromCard) await new Promise(resolve => setTimeout(resolve, 1000));
  if (i === failingCard) throw new Error('model stopped');
  const prompt = p.messages?.map(message => message.content).join('') ?? '';
  const letter = i === noCommitCard ? 'I' : LETTER.find(([card]) => prompt.includes(card))?.[1] ?? 'X';
  const output = `<|im_start|>assistant\n${letter}`;
  return { text: output, content: output, stopped_eos: false, stopped_limit: 1, tokens_predicted: 1,
    completion_probabilities: [{ content: letter, probs: [{ tok_str: 'A', prob: 1 }, { tok_str: 'D', prob: 0 }, { tok_str: 'B', prob: 0 }] }] };
} });
(initLlama as jest.Mock).mockImplementation(llama.initLlama);

const cards = ['some of them yes, the standups not so much', 'Yes, some meetings should be emails.', 'Standups keep us honest.', 'Which meetings did you cut first?'];
const rate = (backend = phoneFit()) => judgeFit({ post: 'Hot take: most meetings should be emails. Change my mind.', candidates: cards, samples: ['private voice sample'],
  platform: platformForApp('com.twitter.android'), backends: [backend], voice: false });

beforeEach(() => { sent.length = 0; maxConcurrent = 0; active = 0; failingCard = -1; slowFromCard = -1; noCommitCard = -1; });

test('the phone rates each card separately and serially from the level letter it writes', async () => {
  const fits = await rate();
  expect(sent).toHaveLength(cards.length);
  expect(sent.map(p => [p.n_predict, p.n_probs, p.response_format])).toEqual(cards.map(() => [FIT_TOKENS, undefined, undefined]));
  expect(maxConcurrent).toBe(1);
  const prompts = sent.map(p => p.messages?.map(message => message.content).join('') ?? '');
  expect(prompts).not.toContain('private voice sample');
  cards.forEach((card, i) => {
    expect(prompts[i]).toContain(card);
    expect(cards.filter((_, j) => j !== i).some(other => prompts[i].includes(other))).toBe(false);
  });
});

test('distinct cards keep their own distinct levels', async () => {
  const fits = await rate();
  expect(fits.map(f => [f.level, f.words])).toEqual([[1, LEVELS[1]], [0, LEVELS[0]], [2, LEVELS[2]], [3, LEVELS[3]]]);
  expect(new Set(fits.map(f => f.level)).size).toBe(cards.length);
});

test('a card the model does not commit on shows no rating and never borrows a neighbour\'s level', async () => {
  noCommitCard = 1;
  const fits = await rate();
  expect(fits.map(f => [f.level, f.words, f.probability])).toEqual([[1, LEVELS[1], 1], [null, UNSURE, null], [2, LEVELS[2], 1], [3, LEVELS[3], 1]]);
});

test('a phone run that runs out of time keeps the cards already rated', async () => {
  slowFromCard = 2;
  const fits = await rate(phoneFit(300));
  expect(fits.map(f => f.level)).toEqual([1, 0, null, null]);
});

test('a card whose model call fails keeps the other cards rated', async () => {
  failingCard = 1;
  const fits = await rate();
  expect(fits.map(f => f.level)).toEqual([1, null, 2, 3]);
});

test('an aborted ask rejects before any card reaches the model', async () => {
  const controller = new AbortController();
  controller.abort();
  const questions = { fit_0: { kind: 'score', levels: LEVELS, instructions: 'rate' } as Question };
  await expect(phoneFit().ask({ post: 'p', candidates: { '0': cards[0] } }, questions, controller.signal)).rejects.toBeDefined();
  expect(sent).toHaveLength(0);
});

test('the phone fit budget is one the real on-device model accepts', async () => {
  const local = new LocalModel({ model: model(), store: {} as any, initLlama: jest.fn() as any, device: { platform: 'android' } });
  const failure = await Promise.resolve().then(() => local.complete({ prompt: 'rate', maxOutputTokens: FIT_TOKENS })).then(() => null, (error: unknown) => error);
  expect(failure).not.toBeInstanceOf(RangeError);
});

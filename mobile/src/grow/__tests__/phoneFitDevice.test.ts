import type { Question } from '@byokit/decide';
import { fakeLlama } from '@byokit/infer/testing';
import { LocalModel, model } from '@byokit/infer';
import { initLlama } from 'llama.rn';
import { judgeFit, LEVELS } from '../fit';
import { FIT_TOKENS, LEVEL_PROBS, phoneFit } from '../phoneFit';
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
let missingProbabilities = false;
let lowMass = false;
let weakMeasuredTop = false;
let invalidMass = false;
let failingCard = -1;
let spacedVariant = false;
const llama = fakeLlama({ reply: async request => {
  const p = request as unknown as Params;
  sent.push(p);
  active++;
  maxConcurrent = Math.max(maxConcurrent, active);
  await Promise.resolve();
  active--;
  const i = sent.length - 1;
  if (i === failingCard) throw new Error('model stopped');
  const letter = i % 2 ? 'C' : 'B';
  const probs = [{ tok_str: 'A', prob: 0.1 }, { tok_str: 'B', prob: 0.8 }, { tok_str: 'C', prob: 0.1 }, { tok_str: 'D', prob: 0 }];
  if (letter === 'C') { probs[1].prob = 0.1; probs[2].prob = 0.7; probs[3].prob = 0.1; }
  if (lowMass) { probs[0].prob = 0.05; probs[1].prob = 0.25; probs[2].prob = 0.1; probs[3].prob = 0.05; probs.push({ tok_str: 'X', prob: 0.55 }); }
  if (weakMeasuredTop) { probs[0].prob = 0.1; probs[1].prob = 0.31; probs[2].prob = 0.05; probs[3].prob = 0.04; }
  if (spacedVariant && letter === 'B') { probs[1].prob = 0.3; probs.push({ tok_str: ' B', prob: 0.3 }); }
  if (invalidMass) { probs[0].prob = 0.6; probs[1].prob = 0.6; probs[2].prob = 0.2; probs[3].prob = 0.1; }
  const output = `<|im_start|>assistant\n${letter}`;
  return { text: output, content: output, stopped_eos: true, stopped_limit: 0, tokens_predicted: 1,
    ...(missingProbabilities ? {} : { completion_probabilities: [{ content: letter, probs }] }) };
} });
(initLlama as jest.Mock).mockImplementation(llama.initLlama);

const cards = ['some of them yes, the standups not so much', 'Yes, some meetings should be emails.', 'Standups keep us honest.', 'Which meetings did you cut first?'];
const rate = (backend = phoneFit()) => judgeFit({ post: 'Hot take: most meetings should be emails. Change my mind.', candidates: cards, samples: ['private voice sample'],
  platform: platformForApp('com.twitter.android'), backends: [backend], voice: false });

beforeEach(() => { sent.length = 0; maxConcurrent = 0; active = 0; missingProbabilities = false; lowMass = false; weakMeasuredTop = false; invalidMass = false; failingCard = -1; spacedVariant = false; });

test('the phone reads each card separately and serially from measured next-token probabilities', async () => {
  const fits = await rate();
  expect(sent).toHaveLength(cards.length);
  expect(sent.map(p => [p.n_predict, p.n_probs, p.response_format])).toEqual(cards.map(() => [1, 16, undefined]));
  expect(maxConcurrent).toBe(1);
  const prompts = sent.map(p => p.messages?.map(message => message.content).join('') ?? '');
  expect(prompts).not.toContain('private voice sample');
  cards.forEach((card, i) => {
    expect(prompts[i]).toContain(card);
    expect(cards.filter((_, j) => j !== i).some(other => prompts[i].includes(other))).toBe(false);
  });
  expect(fits.map(f => f.level)).toEqual([1, 2, 1, 2]);
  fits.forEach((fit, i) => {
    expect(fit.probability).toBeCloseTo(i % 2 ? 0.7 : 0.8);
    expect(fit.validMass).toBeCloseTo(1);
  });
});

test('a card whose model call fails keeps the other cards rated', async () => {
  failingCard = 1;
  const fits = await rate();
  expect(fits.map(f => f.level)).toEqual([1, null, 1, 2]);
});

test('a spacing variant of a level token counts toward its probability and the mass', async () => {
  spacedVariant = true;
  const fits = await rate();
  expect(fits.map(f => [f.level, f.probability])).toEqual([[1, expect.closeTo(0.75)], [2, expect.closeTo(0.7)], [1, expect.closeTo(0.75)], [2, expect.closeTo(0.7)]]);
  expect(fits[0].validMass).toBeCloseTo(0.8);
});

test('an aborted ask rejects before any card reaches the model', async () => {
  const controller = new AbortController();
  controller.abort();
  const questions = { fit_0: { kind: 'score', levels: LEVELS, instructions: 'rate' } as Question };
  await expect(phoneFit().ask({ post: 'p', candidates: { '0': cards[0] } }, questions, controller.signal)).rejects.toBeDefined();
  expect(sent).toHaveLength(0);
});

test('missing token probabilities keep every card plainly unsure', async () => {
  missingProbabilities = true;
  const fits = await rate();
  expect(fits.map(f => [f.level, f.words, f.validMass])).toEqual(cards.map(() => [null, 'Not sure about this one', null]));
});

test('low valid-level probability mass keeps every card plainly unsure', async () => {
  lowMass = true;
  const fits = await rate();
  expect(fits.map(f => [f.level, f.words, f.validMass])).toEqual(cards.map(() => [null, 'Not sure about this one', 0.45]));
});

test('normalization cannot raise a weak measured top probability above the rating floor', async () => {
  weakMeasuredTop = true;
  const fits = await rate();
  expect(fits.map(f => [f.level, f.words, f.probability, f.validMass])).toEqual(cards.map(() => [null, 'Not sure about this one', null, 0.5]));
});

test('a malformed token mass is not normalized into a rating', async () => {
  invalidMass = true;
  const fits = await rate();
  expect(fits.map(f => [f.level, f.words, f.validMass])).toEqual(cards.map(() => [null, 'Not sure about this one', 1.5]));
});

test('the phone fit budget is one the real on-device model accepts', async () => {
  const local = new LocalModel({ model: model(), store: {} as any, initLlama: jest.fn() as any, device: { platform: 'android' } });
  const failure = await Promise.resolve().then(() => local.complete({ prompt: 'rate', maxOutputTokens: FIT_TOKENS, n_probs: LEVEL_PROBS })).then(() => null, (error: unknown) => error);
  expect(failure).not.toBeInstanceOf(RangeError);
});

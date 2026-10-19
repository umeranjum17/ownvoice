import type { Question } from '@byokit/decide';
import { completeLocal } from '../../core/localModel';
import { FIT_TOKENS, LEVEL_PROBS, phoneFit } from '../phoneFit';
import { LEVELS } from '../fit';

jest.mock('../../core/localModel', () => ({ completeLocal: jest.fn() }));
const completeLocalMock = completeLocal as jest.MockedFunction<typeof completeLocal>;

const completion = (letter: string) => ({
  text: letter,
  completion_probabilities: [{ content: letter, probs: [{ tok_str: 'A', prob: 0.1 }, { tok_str: 'B', prob: 0.8 }, { tok_str: 'C', prob: 0.1 }] }],
} as Awaited<ReturnType<typeof completeLocal>>);

const score = (instructions: string) => ({ kind: 'score', levels: LEVELS, instructions } as Question);
const questions = {
  fit_0: score('rate the first'),
  voice_0: { kind: 'yesno', question: 'does it sound like them?' } as Question,
  fit_1: score('rate the second'),
  fit_9: score('rate a card that is not in the state'),
};

beforeEach(() => { completeLocalMock.mockReset(); completeLocalMock.mockResolvedValue(completion('B')); });

test('the phone rates each card from its own call and skips questions it cannot rate', async () => {
  const answers = await phoneFit().ask({ post: 'the post', candidates: { '0': 'first card', '1': 'second card' } }, questions, new AbortController().signal);

  expect(completeLocalMock).toHaveBeenCalledTimes(2);
  const prompts = completeLocalMock.mock.calls.map(([prompt]) => prompt);
  expect(prompts[0]).toContain('first card');
  expect(prompts[0]).not.toContain('second card');
  expect(prompts[1]).toContain('second card');
  expect(prompts[1]).not.toContain('first card');
  completeLocalMock.mock.calls.forEach(([, maxTokens, , , nProbs]) => expect([maxTokens, nProbs]).toEqual([FIT_TOKENS, LEVEL_PROBS]));
  expect(Object.keys(answers).sort()).toEqual(['fit_0', 'fit_1']);
  expect(answers.fit_1).toEqual({ probabilities: { 0: 0.1, 1: 0.8, 2: 0.1, 3: 0 }, raw: { validMass: 1 } });
});

test('the phone hands its abort signal to every local model call', async () => {
  const controller = new AbortController();
  await phoneFit().ask({ post: 'the post', candidates: { '0': 'first card', '1': 'second card' } }, questions, controller.signal);
  expect(completeLocalMock.mock.calls.map(([, , signal]) => signal)).toEqual([controller.signal, controller.signal]);
});

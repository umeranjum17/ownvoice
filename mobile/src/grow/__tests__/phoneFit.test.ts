import { LocalModel, model } from '@byokit/infer';
import { FIT_TOKENS, phoneFit } from '../phoneFit';
import { askLocal } from '../../core/localModel';
import { answerer } from '@byokit/decide';
import { judgeFit } from '../fit';
import { platformForApp } from '../../core/platforms';

jest.mock('../../core/localModel', () => ({ askLocal: jest.fn() }));
const askLocalMock = askLocal as jest.MockedFunction<typeof askLocal>;

test('the phone fit budget is one the real on-device model accepts', async () => {
  const local = new LocalModel({ model: model(), store: {} as any, initLlama: jest.fn() as any, device: { platform: 'android' } });
  const failure = await local.complete({ prompt: 'rate', maxOutputTokens: FIT_TOKENS }).then(() => null, (error: unknown) => error);
  expect(failure).not.toBeInstanceOf(RangeError);
});

test('the on-device fit prompt carries no voice samples when the voice question is not asked', async () => {
  const sent: string[] = [];
  const backend = answerer({ name: 'capture', leaves: false, ask: async (...args: unknown[]) => { sent.push(JSON.stringify(args)); return ''; } });
  await judgeFit({ post: 'Umer built a timer.', candidates: ['Does it pause when you switch apps?'], platform: platformForApp('com.twitter.android'), samples: ['Sounds good, see you then.'], backends: [backend], voice: false });
  expect(sent.length).toBeGreaterThan(0);
  expect(sent.join('')).not.toContain('Sounds good, see you then.');
});

test('the phone fit hands its abort signal to the local model call', async () => {
  askLocalMock.mockResolvedValue('{}');
  const controller = new AbortController();
  try {
    await phoneFit().ask({}, {}, controller.signal);
    expect(askLocalMock.mock.calls[0][2]).toBe(controller.signal);
  } finally {
    askLocalMock.mockReset();
  }
});

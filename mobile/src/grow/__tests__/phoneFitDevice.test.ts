import { fakeLlama } from '@byokit/infer/testing';
import { initLlama } from 'llama.rn';
import { judgeFit } from '../fit';
import { phoneFit } from '../phoneFit';
import { platformForApp } from '../../core/platforms';

jest.mock('llama.rn', () => ({ initLlama: jest.fn() }));
jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {} }));
jest.mock('../../core/localStore', () => ({
  createLocalStore: () => ({
    path: (m: { file: string }) => `/models/${m.file}`,
    size: async (m: { bytes: number }) => m.bytes,
    sha256: async (m: { sha256: string }) => m.sha256,
    remove: async () => {},
  }),
}));

// What the phone's model wrote for four cards with no schema (test phone, 2026-10-18): pretty JSON with a
// rationale per card ran into the 256-token cap and stopped mid-answer, so every card abstained.
const CUT = '{\n  "fit_0": {\n    "probabilities": {\n      "0": 0.1,\n      "1": 0.8,\n      "2": 0.1,\n      "3": 0\n    },\n    "rationale": "The post is about the balance between emails and face-to-face meetings."\n  },\n  "fit_1": {\n    "probabilities": {\n      "0": 0.1,\n      "1": 0.8,\n      "2": 0.1,\n      "3": 0\n    },\n    "rationale": "';
type Params = { response_format?: { json_schema: { schema: { properties: Record<string, { properties: { probabilities: { properties: Record<string, unknown> } } }> } } } };
const sent: Params[] = [];
let cutAnswers = false;
const llama = fakeLlama({ reply: request => {
  const p = request as unknown as Params;
  sent.push(p);
  const schema = p.response_format?.json_schema.schema;
  // Like llama.rn on the phone, a schema-constrained decode answers in exactly the requested shape and ends on its
  // own, but the text opens with the chat template's assistant header (seen on every rating on the test phone).
  if (!schema || cutAnswers) return { text: CUT, content: CUT, stopped_eos: false, stopped_limit: 1, tokens_predicted: 255 };
  const answer = Object.fromEntries(Object.keys(schema.properties).map((k, i) => [k, { probabilities: i % 2 ? { 0: 0.1, 1: 0.1, 2: 0.7, 3: 0.1 } : { 0: 0.1, 1: 0.8, 2: 0.1, 3: 0 } }]));
  return `<|im_start|>assistant\n${JSON.stringify(answer, null, 2)}`;
} });
(initLlama as jest.Mock).mockImplementation(llama.initLlama);

const cards = ['some of them yes, the standups not so much', 'Yes, some meetings should be emails.', 'Standups keep us honest.', 'Which meetings did you cut first?'];
const rate = (backend = phoneFit()) => judgeFit({ post: 'Hot take: most meetings should be emails. Change my mind.', candidates: cards,
  platform: platformForApp('com.twitter.android'), backends: [backend], voice: false });

test('the phone rating asks the on-device model for one probability per level for every card, nothing more', async () => {
  sent.length = 0;
  await rate();
  const schema = sent[0].response_format!.json_schema.schema;
  expect(Object.keys(schema.properties)).toEqual(['fit_0', 'fit_1', 'fit_2', 'fit_3']);
  expect(Object.keys(schema.properties.fit_0.properties)).toEqual(['probabilities']);
  expect(Object.keys(schema.properties.fit_0.properties.probabilities.properties)).toEqual(['0', '1', '2', '3']);
});

test('every phone-written card gets its level back from the on-device model', async () => {
  const fits = await rate();
  expect(fits.map(f => [f.level, f.probability])).toEqual([[1, 0.8], [2, 0.7], [1, 0.8], [2, 0.7]]);
});

afterEach(() => { cutAnswers = false; });

test('an answer cut off at the token cap keeps the plain unsure card instead of inventing a level', async () => {
  cutAnswers = true;
  const fits = await rate();
  expect(fits.map(f => [f.level, f.words])).toEqual(cards.map(() => [null, 'Not sure about this one']));
});

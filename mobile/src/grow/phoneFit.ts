import { answerer, type Backend, type Question } from '@byokit/decide';
import { askLocal } from '../core/localModel';

// Level answers for every shown card in one reply. The on-device model refuses more than 256 output tokens
// (@byokit/infer DEFAULT_LIMITS), so a larger budget never reaches the model.
export const FIT_TOKENS = 256;

const strict = (properties: Record<string, object>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const answerKeys = (q: Question) => q.kind === 'score' ? q.levels.map((_, i) => String(i)) : q.kind === 'yesno' ? ['true', 'false'] : q.kind === 'choice' ? Object.keys(q.options) : [];

/** The reply shape decide reads, and nothing else: per question, one probability per answer key. Decoding to it keeps
 *  four cards' answers inside the 256-token cap (free-form JSON with rationales ran past it on the phone, so every
 *  card abstained) and keeps the keys to the level numbers decide expects. */
export const answerSchema = (questions: Record<string, Question>) => strict(Object.fromEntries(Object.entries(questions).map(([k, q]) =>
  [k, strict({ probabilities: strict(Object.fromEntries(answerKeys(q).map(key => [key, { type: 'number' }]))) })])));

/** The reply fit on this phone: the on-device model answers the same rubric the cloud judges get,
 *  so the post and the cards never leave the phone. A schema-shaped reply can open with the chat template's
 *  `<|im_start|>assistant` header (the kit's own summary strips it too); that and a JSON fence are unwrapped first; any other
 *  malformed or cut-off reply abstains through decide, and the card keeps the plain unsure read. */
export const phoneFit = (): Backend => {
  const ask = (schema: object) => answerer({ name: 'phone', leaves: false,
    ask: async (prompt, signal) => (await askLocal(prompt, FIT_TOKENS, signal, schema)).replace(/^\s*(?:<\|im_start\|>assistant\s*)?(?:```(?:json)?\s*)?|\s*```\s*$/g, '') });
  return { ...ask({}), ask: (state, questions, signal, images) => ask(answerSchema(questions)).ask(state, questions, signal, images) };
};

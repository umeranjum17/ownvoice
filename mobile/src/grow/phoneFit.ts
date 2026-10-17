import { answerer, type Backend } from '@byokit/decide';
import { askLocal } from '../core/localModel';

// Level answers for every shown card fit in one reply: four probabilities plus a rationale each.
const FIT_TOKENS = 400;

/** The reply fit on this phone: the on-device model answers the same rubric the cloud judges get,
 *  so the post and the cards never leave the phone. A fenced JSON block is unwrapped first; any other
 *  malformed reply abstains through decide, and the card keeps the plain unsure read. */
export const phoneFit = (): Backend => answerer({ name: 'phone', leaves: false,
  ask: async prompt => (await askLocal(prompt, FIT_TOKENS)).replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '') });

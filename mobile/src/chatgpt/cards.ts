import { route } from '@byokit/accounts';

/** The account layer: the one place that answers which kit route a card uses, whether that route is ready on a
 *  phone, and what the kit calls its account. A card id is what the app stores (`writer-source`, a picked model);
 *  everything else about it is the kit's, so a card is one row here and the rest of the app asks by card id. */
const CARDS = [
  { card: 'chatgpt', route: 'openai:code', account: 'chatgpt', name: 'ChatGPT', company: 'OpenAI' },
  { card: 'claude', route: 'anthropic:paste', account: 'claude', name: 'Claude', company: 'Anthropic' },
  { card: 'openrouter', route: 'openrouter:key', account: 'openrouter', name: 'OpenRouter', company: 'OpenRouter' },
  // A plan key: the route id is also the account id the kit keeps the plan key under.
  { card: 'opencode', route: 'opencode:plan_key:opencode-go', account: 'opencode:plan_key:opencode-go', name: 'OpenCode Go', company: 'OpenCode Go' },
] as const;

/** A card's id, as stored. The kit's route and account ids sit behind it; nothing else here is a list of providers. */
export type CloudKey = string;
export const cardIds: readonly CloudKey[] = CARDS.map(c => c.card);
const row = (card: CloudKey) => CARDS.find(c => c.card === card);

/** The card a stored source names, or null for the phone, not chosen, or anything else. */
export const cardOf = (source: string | null | undefined): CloudKey | null => row(source ?? '')?.card ?? null;
/** The kit route a card connects through. */
export const routeOf = (card: CloudKey): string => (row(card) ?? CARDS[0]).route;
/** The id the kit's status, sign-out and ask calls take for the card's account. */
export const accountOf = (card: CloudKey): string => (row(card) ?? CARDS[0]).account;
export const nameOf = (card: CloudKey): string => (row(card) ?? CARDS[0]).name;
export const companyOf = (card: CloudKey): string => (row(card) ?? CARDS[0]).company;
/** How the person connects: 'code' and 'paste' are page sign-ins, 'key' and 'plan_key' are a pasted key. */
export const viaOf = (card: CloudKey): string => route(routeOf(card), { platform: 'rn' }).via;
/** Whether the card pastes a key rather than signing in on a page. */
export const isKeyCard = (card: CloudKey): boolean => ['key', 'plan_key'].includes(viaOf(card));
/** The kit's own id for the card's models (what a typed model is resolved against). */
export const upstreamOf = (card: CloudKey): string => route(routeOf(card), { platform: 'rn' }).upstream.id;

/** Whether the kit reports the card's route ready on this phone. Offered only then; the kit decides, not Ownvoice.
 *  `EXPO_PUBLIC_E2E_OPENROUTER_OFF=1` is an emulator-only injected capability counterfactual (never a distributable
 *  build): it forces OpenRouter's not-ready branch so the proof can show the app hides the card and Home action. */
export const readyOnPhone = (card: CloudKey): boolean => card === 'openrouter' && process.env.EXPO_PUBLIC_E2E_OPENROUTER_OFF === '1'
  ? false
  : route(routeOf(card), { platform: 'rn' }).readiness === 'ready';

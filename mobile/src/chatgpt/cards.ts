import { PROVIDERS, route, type RouteView } from '@byokit/accounts';

const RN = { platform: 'rn' } as const;

/** The account layer: the one place that answers which kit route a card uses, whether that route is ready on a
 *  phone, and what the kit calls its account. A card id is what the app stores (`writer-source`, a picked model).
 *  The four first cards keep the ids they were stored under; every other route the kit lists is its own card, named
 *  by its route id, and everything about it comes from the kit's route. */
const LEGACY = [
  { card: 'chatgpt', route: 'openai:code', account: 'chatgpt', name: 'ChatGPT', company: 'OpenAI' },
  { card: 'claude', route: 'anthropic:paste', account: 'claude', name: 'Claude', company: 'Anthropic' },
  { card: 'openrouter', route: 'openrouter:key', account: 'openrouter', name: 'OpenRouter', company: 'OpenRouter' },
  // A plan key: the route id is also the account id the kit keeps the plan key under.
  { card: 'opencode', route: 'opencode:plan_key:opencode-go', account: 'opencode:plan_key:opencode-go', name: 'OpenCode Go', company: 'OpenCode Go' },
] as const;

/** A card's id, as stored: one of the first four, or a kit route id. */
export type CloudKey = string;
const legacy = (card: string | null | undefined) => LEGACY.find(c => c.card === card);
const kit = (id: string | null | undefined): RouteView | undefined => {
  if (!id) return undefined;
  try { return route(id, RN); } catch { return undefined; }
};

/** The card a kit route connects as: the first four keep their ids, every other route is its own id. */
export const cardOfRoute = (routeId: string): CloudKey => LEGACY.find(c => c.route === routeId)?.card ?? routeId;

/** The card a stored source names, or null for the phone, not chosen, or anything else. */
export const cardOf = (source: string | null | undefined): CloudKey | null => legacy(source)?.card ?? (source && kit(source) ? source : null);

/** The kit's account for a sign-in route: the provider whose own sign-in this route's upstream is (Grok for xAI's code). */
const providerOf = (found: RouteView) => Object.entries(PROVIDERS).find(([, p]) => p.pi === found.upstream.id)?.[0];

const row = (card: CloudKey) => {
  const first = legacy(card);
  if (first) return first;
  const found = kit(card);
  // A key route is its own account (the kit resolves the route id to it); a sign-in route is the provider's account.
  return found ? { card, route: found.id, account: ['key', 'plan_key'].includes(found.via) ? found.id : providerOf(found) ?? found.provider, name: found.name, company: found.company } : LEGACY[0];
};

/** Whether this app can connect the card: one of the first four, a key route, or a sign-in the kit runs as a provider's own
 *  (a regional variant it lists as a separate route has no account of its own here yet). */
export const connectsHere = (card: CloudKey): boolean => {
  const found = kit(card);
  return !!legacy(card) || !!found && (['key', 'plan_key'].includes(found.via) || !!providerOf(found));
};

/** The kit route a card connects through. */
export const routeOf = (card: CloudKey): string => row(card).route;
/** The id the kit's status, sign-out and ask calls take for the card's account. */
export const accountOf = (card: CloudKey): string => row(card).account;
export const nameOf = (card: CloudKey): string => row(card).name;
export const companyOf = (card: CloudKey): string => row(card).company;
/** How the person connects: 'code' and 'paste' are page sign-ins, 'key' and 'plan_key' are a pasted key. */
export const viaOf = (card: CloudKey): string => route(routeOf(card), RN).via;
/** Whether the card pastes a key rather than signing in on a page. */
export const isKeyCard = (card: CloudKey): boolean => ['key', 'plan_key'].includes(viaOf(card));
/** How the person pays for the card's route: 'subscription' (a plan) or 'api' (charged per use) and the rest. */
export const billingOf = (card: CloudKey): string => route(routeOf(card), RN).billing;
/** The kit's own id for the card's models (what a typed model is resolved against). */
export const upstreamOf = (card: CloudKey): string => route(routeOf(card), RN).upstream.id;
/** Whether the first four's own screens (ChatGPT's page sign-in, Claude's paste-back, OpenRouter's and OpenCode Go's
 *  first keys) draw this card; every other card uses the generic key or code screens. */
export const hasOwnScreen = (card: CloudKey): boolean => !!legacy(card);

/** Whether the kit reports the card's route ready on this phone. Offered only then; the kit decides, not Ownvoice.
 *  `EXPO_PUBLIC_E2E_OPENROUTER_OFF=1` is an emulator-only injected capability counterfactual (never a distributable
 *  build): it forces OpenRouter's not-ready branch so the proof can show the app hides the card and Home action. */
export const readyOnPhone = (card: CloudKey): boolean => card === 'openrouter' && process.env.EXPO_PUBLIC_E2E_OPENROUTER_OFF === '1'
  ? false
  : route(routeOf(card), RN).readiness === 'ready';

import { responseFetch } from './responseFetch';
import * as SecureStore from 'expo-secure-store';
import { Accounts, offered, portable, PROVIDERS, resolveModel, route, secureStore } from '@byokit/accounts';
import { keys, withKeys } from '@byokit/accounts/keys';
import { nativeStore } from '@byokit/secrets/native';
import { CryptoDigestAlgorithm, digest as sha256, getRandomValues } from 'expo-crypto';

import type { CloudKey } from '../core/source';
import type { Api, Model, OpenCodeGoWorkspace } from '@byokit/accounts';
import type { KeyRuntime } from '@byokit/accounts/keys';
const member = 'owner';
const store = secureStore(SecureStore, 'ownvoice.chatgpt.1');
// API keys (billed per use) live only in the phone's own secure store, never in the account store.
const keyStore = nativeStore({ secureStore: SecureStore, prefix: 'ownvoice.keys' });
// Emulator-only proof builds point the real sign-in stack at the host stand-in
// (mockOpenAI) with EXPO_PUBLIC_E2E_AUTH_BASE=http://10.0.2.2:<port>; never set
// in a distributable build, where sign-in always goes to OpenAI itself.
const authBase = process.env.EXPO_PUBLIC_E2E_AUTH_BASE || undefined;
// Claude's and ChatGPT's page sign-ins (PKCE) need secure random bytes and SHA-256, which React Native lacks; expo-crypto supplies both.
const claudePlan = { crypto: { getRandomValues, subtle: { digest: (_algorithm: string, data: BufferSource) => sha256(CryptoDigestAlgorithm.SHA256, data) } } as unknown as Crypto };

// Start with hardcoded list to avoid calling offered() at module scope (RN crash).
// Wrapper functions will delegate to a lazily-initialized instance with kit-driven list.
const fallback = new Accounts({ offer: ['claude', 'chatgpt', 'typesafe'], app: 'Ownvoice', store: () => store, keyStore: () => keyStore, fetch: responseFetch, originator: 'ownvoice', claudePlan, crypto: claudePlan.crypto, ...(authBase ? { authBase } : {}) }, withKeys(portable));
let realInstance: Accounts | undefined;

/** Whether the kit reports this phone's OpenRouter key route ready. Offered only then; the kit decides, not Ownvoice.
 *  `EXPO_PUBLIC_E2E_OPENROUTER_OFF=1` is an emulator-only injected capability counterfactual (never a distributable
 *  build): it forces the not-ready branch so the proof can show the app hides the card and Home action. */
export const openRouterReady = () => process.env.EXPO_PUBLIC_E2E_OPENROUTER_OFF === '1'
  ? false
  : route('openrouter:key', { platform: 'rn' }).readiness === 'ready';

/** OpenCode Go's route in the kit: a plan key on the person's own plan, billed as that plan rather than per use.
 *  The route id is the account id the kit keeps the plan key under, so every ask names it exactly. */
export const OPENCODE_ROUTE = 'opencode:plan_key:opencode-go';

/** Whether the kit reports this phone's OpenCode Go route ready. Offered only then; the kit decides, not Ownvoice. */
export const openCodeReady = () => route(OPENCODE_ROUTE, { platform: 'rn' }).readiness === 'ready';

/** The kit's account id for one writer: plain providers are named as they are, while OpenCode Go is its
 *  plan-key route id (the plan's own account), which is the only name the kit's status, sign-out and
 *  ask calls accept. */
export const accountRoute = (key: CloudKey): string => key === 'opencode' ? OPENCODE_ROUTE : key;

function kitInstance(): Accounts | undefined {
  if (realInstance) return realInstance;
  try {
    const plans = offered().map(p => p.key);
    if (!plans.length) return undefined;
    const planOrder = plans.includes('claude') ? ['claude', ...plans.filter(k => k !== 'claude')] : plans;
    const offer = openRouterReady() ? [...planOrder, 'openrouter'] : planOrder;
    realInstance = new Accounts({ offer: [...offer, 'typesafe'], app: 'Ownvoice', store: () => store, keyStore: () => keyStore, fetch: responseFetch, originator: 'ownvoice', claudePlan, crypto: claudePlan.crypto, ...(authBase ? { authBase} : {}) }, withKeys(portable));
    return realInstance;
  } catch {
    return undefined;
  }
}

function getInstance(): Accounts {
  return kitInstance() ?? fallback;
}

export const accounts = fallback;
const fallbackProviders = fallback.providers;
Object.defineProperty(accounts, 'providers', {
  configurable: true,
  get: () => kitInstance()?.providers ?? fallbackProviders,
});
// Generic plan operations: the UI passes the provider key ('claude', 'chatgpt', etc.)
// These call getInstance() to get the kit-driven instance (if available) instead of fallback.
/** ChatGPT's own page in the app's in-app browser (the kit's `redirect`: one approval, no code). A code is
 *  asked for only through `via: 'code'`, from the page's "Use a code instead" button. */
export const signIn = (provider: string, via: 'code' | 'redirect' = provider === 'chatgpt' ? 'redirect' : 'code') => getInstance().login(member, provider, { via });
/** Finish the redirect sign-in with the address the in-app browser was sent back to. */
export const completeSignIn = (provider: string, address: string) => getInstance().complete(member, provider, address);
export const signOut = (provider: string) => getInstance().logout(member, provider);
export const refresh = () => getInstance().keepFresh([member]);
export const signInState = (provider: string) => getInstance().view(member, provider);
export const cancelSignIn = (provider: string) => getInstance().cancel(member, provider);
export const status = (provider: string) => getInstance().status(member, provider);
export const respond = ((member: string, ask: any) => getInstance().respond(member, ask)) as Accounts['respond'];
export const reportFailure = (provider: string, error: string) => getInstance().failed(member, provider, error);
// The code a provider's own page showed, handed back through the kit's paste seam (Claude's PKCE flow).
export const paste = (provider: string, text: string) => getInstance().paste(member, provider, text);
// Claude's PKCE flow is paste-based, so it starts without the device-code `via` ChatGPT uses.
export const signInClaude = () => getInstance().login(member, 'claude');
// OpenRouter is a key route: the person pastes their own OpenRouter key, which the kit keeps only in
// this phone's secure store. A phone has no OpenRouter OAuth sign-in, so there is no code to open or paste back.
export const connectOpenRouter = (secret: string) => getInstance().saveKey(member, 'openrouter', secret.trim(), { billedPerUse: true });
export const signOutOpenRouter = () => getInstance().logout(member, 'openrouter');
// Jev is a separate, explicitly billed account; never a writing source or automatic fallback.
export const connectJev = (secret: string) => getInstance().saveKey(member, 'typesafe', secret.trim(), { billedPerUse: true });
export const jevKey = () => getInstance().key(member, 'typesafe');
export const disconnectJev = () => getInstance().logout(member, 'typesafe');
// OpenCode Go is a plan key route: the kit's add() saves the key the plan gave the person as that plan's
// account, with the workspace every Go call names. A key that acts for several workspaces saves nothing and
// hands back the kit's list so the person picks one; connecting again with that workspace saves it.
// Each add() saves a new account, so an earlier one is signed out first: the route keeps one Go account.
export const connectOpenCode = async (secret: string, workspace?: string): Promise<OpenCodeGoWorkspace[] | undefined> => {
  await getInstance().logout(member, OPENCODE_ROUTE).catch(() => {});
  return (await getInstance().add(member, OPENCODE_ROUTE, { key: secret.trim(), ...(workspace ? { workspace } : {}) })).workspaces;
};
export const signOutOpenCode = () => getInstance().logout(member, OPENCODE_ROUTE);
export async function codexAuth(): Promise<{ access: string; accountId: string }> {
  const runtime = await getInstance().runtime(member);
  const auth = await runtime.getAuth('openai-codex');
  const credential = await runtime.readCredential('openai-codex');
  if (!auth?.auth?.apiKey || credential?.type !== 'oauth' || typeof credential.accountId !== 'string') throw new Error('Sign in with ChatGPT first.');
  return { access: auth.auth.apiKey, accountId: credential.accountId };
}

/** The vendor's own live list for one account: each row `{ id, name, available, why? }`, nothing kept in this app.
 *  Empty when the account is not ready; a list the vendor won't give throws, so the screen can say so and offer to try again. */
export const listModels = async (key: CloudKey) => getInstance().models(member, (await getInstance().status(member, accountRoute(key))).id);

const keyModels = new Map<string, Promise<Model<Api>>>();
let kitModels: Promise<ReturnType<KeyRuntime['createModels']>> | undefined;
const models = () => kitModels ??= keys().then(({ createModels }) => createModels({ authContext: { env: async () => undefined, fileExists: async () => false } }));

/** A key route's typed model for the id the person picked, resolved by the kit from the vendor's live list (limits and price
 *  when it gives them, else the kit's documented defaults); this app keeps no model rows. This is never shown to the person.
 *  `EXPO_PUBLIC_E2E_OPENROUTER_BASE` (emulator-only, see `proofRoute`) points OpenRouter's list and chat at the host's
 *  `e2e/pi-writer.mjs`, so the live reply proof can run on the real route without a provider key. */
function keyModel(key: 'openrouter' | 'opencode', id: string): Promise<Model<Api>> {
  const at = `${key}:${id}`;
  let found = keyModels.get(at);
  if (!found) {
    found = (async () => {
      const resolved = await resolveModel(await models(), key === 'opencode' ? 'opencode-go' : 'openrouter', id, { apiKey: await getInstance().key(member, accountRoute(key)), fetch: responseFetch });
      if (!resolved) throw new Error('This account lists no models.');
      // The plan's gateway turns away a request that carries no session (400 on activate), so the model opts into
      // the adapter's session-affinity headers through its own compat seam.
      return key === 'opencode' ? { ...resolved.model, compat: { ...resolved.model.compat, sendSessionAffinityHeaders: true, sessionAffinityFormat: 'openai' as const } } as Model<Api> : resolved.model;
    })();
    keyModels.set(at, found);
    found.catch(() => keyModels.delete(at));
  }
  return found;
}

/** One session id per app run, for the plan gateway's session-affinity headers. Random bytes from
 *  the phone's own source; nothing in it names the person or the message. */
let openCodeSession = '';
const openCodeSessionId = () => {
  if (!openCodeSession) openCodeSession = Array.from(getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  return openCodeSession;
};

export type CloudAsk = { instructions: string; input: string; json: boolean; onText?: (text: string) => void; signal?: AbortSignal; fetch?: typeof fetch };

/** Claude sometimes wraps a JSON answer in prose or fences; the JSON readers need the object itself. */
function jsonBody(text: string): string {
  const from = text.indexOf('{');
  const to = text.lastIndexOf('}');
  return from >= 0 && to > from ? text.slice(from, to + 1) : text;
}

/** The one typed boundary every cloud ask goes through — the panel writer, the selection rewrite and
 *  the ratings backend — so a second provider is a branch here, not a fork in the callers. Sign-in,
 *  refresh, resting and sign-out stay the kit's; only the ask shape differs per provider. */
export type CloudTarget = { account: CloudKey; model: string };
export async function askCloud({ account: key, model }: CloudTarget, ask: CloudAsk): Promise<string> {
  // Both key routes answer through the kit's own typed request: OpenRouter's per-use key, and
  // OpenCode Go's plan key on the plan's own endpoint (which also carries the run's session id,
  // so the adapter sends its session-affinity headers).
  if (key === 'openrouter' || key === 'opencode') {
    // The adapter's SDK makes its own abort signal, so the app's per-request fetch is handed over explicitly:
    // its consent checks and the status it reads run on the real request.
    const plan = key === 'opencode'
      ? { account: OPENCODE_ROUTE, model: await keyModel(key, model), options: { maxTokens: 8192, signal: ask.signal, sessionId: openCodeSessionId(), fetch: ask.fetch } }
      : { account: 'openrouter', model: await keyModel(key, model), options: { maxTokens: 8192, signal: ask.signal, fetch: ask.fetch } };
    let streamed = '';
    const result = await getInstance().respondKey(member, {
      ...plan,
      context: { systemPrompt: ask.instructions, messages: [{ role: 'user', content: [{ type: 'text', text: ask.input }], timestamp: Date.now() }] },
      onText: delta => { streamed += delta; ask.onText?.(delta); },
    });
    const text = streamed || result.content.map(part => part.type === 'text' ? part.text : '').join('');
    return ask.json ? jsonBody(text) : text;
  }
  if (key === 'claude') {
    const text = await respond(member, { provider: 'claude', model, max_tokens: 8192,
      system: ask.instructions, messages: [{ role: 'user', content: ask.input }], onText: ask.onText, signal: ask.signal });
    // Emulator proof builds only (EXPO_PUBLIC_E2E_CLAUDE_LOG=1): put the real Claude answer on
    // logcat so a live proof can read the answer, not just a stub. Never set in a distributable build.
    if (process.env.EXPO_PUBLIC_E2E_CLAUDE_LOG === '1') console.log(`Ownvoice claude answer: ${text}`);
    return ask.json ? jsonBody(text) : text;
  }
  return respond(member, { instructions: ask.instructions, input: ask.input, model, signal: ask.signal, onText: ask.onText,
    text: ask.json ? { verbosity: 'low', format: { type: 'json_object' } } : { verbosity: 'low' } });
}

import { responseFetch } from './responseFetch';
import * as SecureStore from 'expo-secure-store';
import { Accounts, offered, portable, PROVIDERS, secureStore } from '@byokit/accounts';
import { withKeys } from '@byokit/accounts/keys';
import { nativeStore } from '@byokit/secrets/native';
import { CryptoDigestAlgorithm, digest as sha256, getRandomValues } from 'expo-crypto';

import { CHATGPT_TERMS } from '../core/words';
import type { CloudKey } from '../core/source';
import type { Model } from '@byokit/accounts';
export { CHATGPT_TERMS };
const member = 'owner';
const store = secureStore(SecureStore, 'ownvoice.chatgpt.1');
// API keys (billed per use) live only in the phone's own secure store, never in the account store.
const keyStore = nativeStore({ secureStore: SecureStore, prefix: 'ownvoice.keys' });
// Emulator-only proof builds point the real sign-in stack at the host stand-in
// (mockOpenAI) with EXPO_PUBLIC_E2E_AUTH_BASE=http://10.0.2.2:<port>; never set
// in a distributable build, where sign-in always goes to OpenAI itself.
const authBase = process.env.EXPO_PUBLIC_E2E_AUTH_BASE || undefined;
// Claude's PKCE sign-in needs secure random bytes and SHA-256, which React Native lacks; expo-crypto supplies both.
const claudePlan = { crypto: { getRandomValues, subtle: { digest: (_algorithm: string, data: BufferSource) => sha256(CryptoDigestAlgorithm.SHA256, data) } } as unknown as Crypto };

// Start with hardcoded list to avoid calling offered() at module scope (RN crash).
// Wrapper functions will delegate to a lazily-initialized instance with kit-driven list.
const fallback = new Accounts({ offer: ['claude', 'chatgpt', 'openrouter'], app: 'Ownvoice', store: () => store, keyStore: () => keyStore, fetch: responseFetch, originator: 'ownvoice', claudePlan, ...(authBase ? { authBase } : {}) }, withKeys(portable));
let realInstance: Accounts | undefined;

function kitInstance(): Accounts | undefined {
  if (realInstance) return realInstance;
  try {
    const plans = offered().map(p => p.key);
    if (!plans.length) return undefined;
    const planOrder = ['claude', ...plans.filter(k => k !== 'claude'), 'openrouter'].filter((k, i, all) => all.indexOf(k) === i);
    realInstance = new Accounts({ offer: planOrder, app: 'Ownvoice', store: () => store, keyStore: () => keyStore, fetch: responseFetch, originator: 'ownvoice', claudePlan, ...(authBase ? { authBase} : {}) }, withKeys(portable));
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
export const signIn = (provider: string) => getInstance().login(member, provider, { via: 'code' });
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
export async function codexAuth(): Promise<{ access: string; accountId: string }> {
  const runtime = await getInstance().runtime(member);
  const auth = await runtime.getAuth('openai-codex');
  const credential = await runtime.readCredential('openai-codex');
  if (!auth?.auth?.apiKey || credential?.type !== 'oauth' || typeof credential.accountId !== 'string') throw new Error('Sign in with ChatGPT first.');
  return { access: auth.auth.apiKey, accountId: credential.accountId };
}

/** The model each provider writes with; the catalogue owns Claude's, as it does the plan's own naming. */
export const CHATGPT_MODEL = 'gpt-6-sol';
export const CLAUDE_MODEL = PROVIDERS.claude.models.strong;
/** OpenRouter's default writer: DeepSeek V4.1 Flash. A phone has no model catalogue, so the key route's
 *  full typed model (its api, provider, endpoint and size) is carried here; the kit's pinned adapter
 *  reads it. This is never shown to the person. */
export const OPENROUTER_MODEL = {
  id: 'deepseek/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', api: 'openai-completions',
  provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', reasoning: false,
  input: ['text'], cost: { input: 0.15, output: 0.6, cacheRead: 0.003, cacheWrite: 0 },
  contextWindow: 1048576, maxTokens: 384000,
} as Model<'openai-completions'>;

export type CloudAsk = { instructions: string; input: string; json: boolean; onText?: (text: string) => void; signal?: AbortSignal };

/** Claude sometimes wraps a JSON answer in prose or fences; the JSON readers need the object itself. */
function jsonBody(text: string): string {
  const from = text.indexOf('{');
  const to = text.lastIndexOf('}');
  return from >= 0 && to > from ? text.slice(from, to + 1) : text;
}

/** The one typed boundary every cloud ask goes through — the panel writer, the selection rewrite and
 *  the ratings backend — so a second provider is a branch here, not a fork in the callers. Sign-in,
 *  refresh, resting and sign-out stay the kit's; only the ask shape differs per provider. */
export async function askCloud(key: CloudKey, ask: CloudAsk): Promise<string> {
  if (key === 'openrouter') {
    let streamed = '';
    const result = await getInstance().respondKey(member, {
      account: 'openrouter', model: OPENROUTER_MODEL,
      context: { systemPrompt: ask.instructions, messages: [{ role: 'user', content: [{ type: 'text', text: ask.input }], timestamp: Date.now() }] },
      options: { maxTokens: 8192, signal: ask.signal },
      onText: delta => { streamed += delta; ask.onText?.(delta); },
    });
    const text = streamed || result.content.map(part => part.type === 'text' ? part.text : '').join('');
    return ask.json ? jsonBody(text) : text;
  }
  if (key === 'claude') {
    const text = await respond(member, { provider: 'claude', model: CLAUDE_MODEL, max_tokens: 8192,
      system: ask.instructions, messages: [{ role: 'user', content: ask.input }], onText: ask.onText, signal: ask.signal });
    return ask.json ? jsonBody(text) : text;
  }
  return respond(member, { instructions: ask.instructions, input: ask.input, model: CHATGPT_MODEL, signal: ask.signal, onText: ask.onText,
    text: ask.json ? { verbosity: 'low', format: { type: 'json_object' } } : { verbosity: 'low' } });
}

import { say } from '@byokit/accounts';
import type { SignIn, Status } from '@byokit/accounts';
import type { CloudKey } from '../core/source';
import { store } from '../core/store';
import { words } from '../core/words';

export const NAME = 'ChatGPT';
export const CLAUDE_NAME = 'Claude';
export const OPENROUTER_NAME = 'OpenRouter';
export const GPT_APPS_KEY = 'chatgpt-apps';

export const mocked = process.env.EXPO_PUBLIC_E2E_GPT === '1';
const signingOut: Record<CloudKey, number> = { chatgpt: 0, claude: 0, openrouter: 0 };
const signOutEpoch: Record<CloudKey, number> = { chatgpt: 0, claude: 0, openrouter: 0 };
export const signOutGuard = (key: CloudKey) => ({ active: signingOut[key] > 0, epoch: signOutEpoch[key] });
const leaving = async (key: CloudKey, run: () => Promise<GptState>): Promise<GptState> => {
  signingOut[key]++;
  signOutEpoch[key]++;
  try { return await run(); } finally { signingOut[key]--; }
};
const MOCK_CODE = 'KQPT-MXVD';
const MOCK_WAIT_MS = 9000;

export type GptState = {
  signedIn: boolean;
  /** Waiting for the person to finish on the provider's page: typing ChatGPT's code, or pasting Claude's back here. */
  waiting: boolean;
  code: string | null;
  url: string | null;
  /** The one plain line the screen shows under the button. */
  note: string | null;
  /** Connected but not writing right now (resting, or the plan doesn't include it), in byokit's words. */
  resting: string | null;
};

export const nothing: GptState = { signedIn: false, waiting: false, code: null, url: null, note: null, resting: null };

/** The sign-in screen's state, in byokit's own sentences; `waitingNote` covers the paste-back flow Claude needs. */
export function stateOf(view: SignIn | null, status: Status | null, name: string = NAME, waitingNote: string = say('signIn.opening', { name })): GptState {
  if (view?.state === 'waiting')
    return { signedIn: signed(status), waiting: true, code: view.code ?? null, url: view.url ?? null, note: view.code ? say('signIn.waitingUrl', { name }) : view.url ? waitingNote : say('signIn.opening', { name }), resting: null };
  if (view?.state === 'failed')
    return { ...nothing, note: view.error ?? null };
  const ready = signed(status);
  return { ...nothing, signedIn: !!ready, note: ready ? status!.words : null, resting: ready && ['resting', 'not_included'].includes(status!.state) ? status!.words : null };
}

const signed = (status: Status | null) => !!status && ['ready', 'resting', 'not_included'].includes(status.state);

export type Session = {
  current(): Promise<GptState>;
  start(): Promise<GptState>;
  cancel(): Promise<GptState>;
  signOut(): Promise<GptState>;
};

// Required lazily: the real session pulls in the phone's secure storage, which no jest run has.
const live = () => require('./accounts') as typeof import('./accounts');

let startedAt = 0;
let connectedAt = 0;

const mock: Session = {
  current: async () => {
    if (signingOut.chatgpt || !startedAt) return { ...nothing };
    if (Date.now() - startedAt < MOCK_WAIT_MS) return waiting();
    connectedAt = startedAt;
    return connected();
  },
  start: async () => {
    store.set(GPT_APPS_KEY, null);
    startedAt = Date.now();
    connectedAt = 0;
    return waiting();
  },
  cancel: async () => {
    startedAt = 0;
    return { ...nothing, note: say('signIn.cancelled', { name: NAME }) };
  },
  signOut: () => leaving('chatgpt', async () => {
    startedAt = 0;
    connectedAt = 0;
    store.set(GPT_APPS_KEY, null);
    return { ...nothing, note: say('status.signedOut', { name: NAME }) };
  }),
};

const waiting = (): GptState => ({ signedIn: false, waiting: true, code: MOCK_CODE, url: null, note: say('signIn.waitingUrl', { name: NAME }), resting: null });
const connected = (): GptState => ({ signedIn: !!connectedAt, waiting: false, code: null, url: null, note: say('status.ready', { name: NAME }), resting: null });

// Each account's sign-in is the kit's own, keyed by provider; Claude's is the paste-back flow, and
// it has no stand-in, so it is always the real one even in stub builds.
const accountSession = (key: CloudKey): Session => {
  const name = key === 'claude' ? CLAUDE_NAME : NAME;
  const readState = async (a: ReturnType<typeof live>) => stateOf(a.signInState(key), await a.status(key).catch(() => null), name, key === 'claude' ? words.claudeSignInNote : undefined);
  return {
    current: async () => {
      if (signingOut[key]) return nothing;
      const a = live();
      await a.refresh().catch(() => {});
      const state = await readState(a);
      return signingOut[key] ? nothing : state;
    },
    start: async () => {
      if (key === 'chatgpt') store.set(GPT_APPS_KEY, null);
      const a = live();
      await (key === 'claude' ? a.signInClaude() : a.signIn('chatgpt'));
      return readState(a);
    },
    cancel: async () => {
      live().cancelSignIn(key);
      return { ...nothing, note: say('signIn.cancelled', { name }) };
    },
    signOut: () => leaving(key, async () => {
      if (key === 'chatgpt') {
        // Best effort: the kit's signOut below revokes the account, and start() clears any consent this could not.
        try { store.set(GPT_APPS_KEY, null); } catch { /* sign-out must still revoke when storage fails */ }
      }
      await live().signOut(key);
      return { ...nothing, note: say('status.signedOut', { name }) };
    }),
  };
};

const tracked = (underlying: Session) => {
  let last: GptState = nothing;
  const session: Session = {
    current: async () => { const state = await underlying.current(); last = state; return state; },
    start: async () => { last = nothing; const state = await underlying.start(); last = state; return state; },
    cancel: async () => { last = nothing; const state = await underlying.cancel(); last = state; return state; },
    signOut: async () => { last = nothing; const state = await underlying.signOut(); last = state; return state; },
  };
  return { session, now: () => last };
};

// OpenRouter is a key route, not a plan sign-in: the person pastes their own key here and the kit
// checks it on the first request. There is no page to open, no code and nothing to wait for.
const openRouterSession = (): Session => ({
  current: async () => {
    if (signingOut.openrouter) return nothing;
    const a = live();
    await a.refresh().catch(() => {});
    const state = stateOf(null, await a.status('openrouter').catch(() => null), OPENROUTER_NAME);
    return signingOut.openrouter ? nothing : state;
  },
  start: async () => ({ ...nothing, waiting: true, note: words.openrouterKeyNote }),
  cancel: async () => ({ ...nothing, note: say('signIn.cancelled', { name: OPENROUTER_NAME }) }),
  signOut: () => leaving('openrouter', async () => {
    await live().signOutOpenRouter();
    return { ...nothing, note: say('status.signedOut', { name: OPENROUTER_NAME }) };
  }),
});

export const accountSessions: Record<CloudKey, { session: Session; now: () => GptState }> = {
  chatgpt: tracked(mocked ? mock : accountSession('chatgpt')),
  claude: tracked(accountSession('claude')),
  openrouter: tracked(openRouterSession()),
};

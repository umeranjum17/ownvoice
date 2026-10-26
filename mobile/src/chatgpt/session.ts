import { say } from '@byokit/accounts';
import type { SignIn, Status } from '@byokit/accounts';
import { accountOf, cardIds, isKeyCard, nameOf, viaOf, type CloudKey } from './cards';
import { store } from '../core/store';
import { CHATGPT_TERMS, words } from '../core/words';

export const NAME = nameOf('chatgpt');
/** The grey line under a sign-in: the kit's, except ChatGPT's, which says only what it uses. */
export const termsOf = (key: string, name: string, company: string) => key === 'chatgpt' ? CHATGPT_TERMS : say('terms.grey', { name, company });
export const CLAUDE_NAME = nameOf('claude');
export const OPENROUTER_NAME = nameOf('openrouter');
export const OPENCODE_NAME = nameOf('opencode');
export const GPT_APPS_KEY = 'chatgpt-apps';

export const mocked = process.env.EXPO_PUBLIC_E2E_GPT === '1';
/** Whether the person is asked which one writes. The emulator's ChatGPT stand-in (`mocked`) has no list to pick from; every other account has. */
export const asksModel = (key: CloudKey) => !(mocked && key === 'chatgpt');
const signingOut: Record<CloudKey, number> = Object.fromEntries(cardIds.map(id => [id, 0]));
const signOutEpoch: Record<CloudKey, number> = Object.fromEntries(cardIds.map(id => [id, 0]));
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
  const name = nameOf(key);
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
      await (viaOf(key) === 'paste' ? a.signInClaude() : a.signIn(accountOf(key)));
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

// A key card (OpenRouter's key, OpenCode Go's plan key) is not a page sign-in: the person pastes the key their
// account gave them and the kit keeps it as that account. There is no page to open, no code and nothing to wait for.
const keySession = (key: CloudKey, note: string): Session => {
  const name = nameOf(key);
  return {
    current: async () => {
      if (signingOut[key]) return nothing;
      const a = live();
      await a.refresh().catch(() => {});
      const state = stateOf(null, await a.status(accountOf(key)).catch(() => null), name);
      return signingOut[key] ? nothing : state;
    },
    start: async () => ({ ...nothing, waiting: true, note }),
    cancel: async () => ({ ...nothing, note: say('signIn.cancelled', { name }) }),
    signOut: () => leaving(key, async () => {
      await live().signOutAccount(key);
      return { ...nothing, note: say('status.signedOut', { name }) };
    }),
  };
};

// The kit's route table is read when a session is first used, never while the app loads.
const onUse = (make: () => Session): Session => {
  let session: Session | undefined;
  const use = () => session ??= make();
  return { current: () => use().current(), start: () => use().start(), cancel: () => use().cancel(), signOut: () => use().signOut() };
};

const keyNotes: Record<CloudKey, string> = { openrouter: words.openrouterKeyNote, opencode: words.openCodeKeyNote };

export const accountSessions: Record<CloudKey, { session: Session; now: () => GptState }> = Object.fromEntries(cardIds.map(key => [
  key,
  tracked(onUse(() => mocked && key === 'chatgpt' ? mock : isKeyCard(key) ? keySession(key, keyNotes[key]) : accountSession(key))),
]));

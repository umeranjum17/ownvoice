import { say } from '@byokit/accounts';
import type { SignIn, Status } from '@byokit/accounts';
import { store } from '../core/store';
import { words } from '../core/words';

export const NAME = 'ChatGPT';
export const CLAUDE_NAME = 'Claude';
export const GPT_APPS_KEY = 'chatgpt-apps';

export const mocked = process.env.EXPO_PUBLIC_E2E_GPT === '1';
let signingOut = 0;
let signOutEpoch = 0;
export const signOutGuard = () => ({ active: signingOut > 0, epoch: signOutEpoch });
const leaving = async (run: () => Promise<GptState>): Promise<GptState> => {
  signingOut++;
  signOutEpoch++;
  try { return await run(); } finally { signingOut--; }
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

const real: Session = {
  current: async () => {
    if (signingOut) return nothing;
    const a = live();
    await a.refresh().catch(() => {});
    const state = stateOf(a.signInStateChatGPT(), await a.statusChatGPT().catch(() => null));
    return signingOut ? nothing : state;
  },
  start: async () => {
    store.set(GPT_APPS_KEY, null);
    const a = live();
    await a.signInChatGPT();
    return stateOf(a.signInStateChatGPT(), await a.statusChatGPT().catch(() => null));
  },
  cancel: async () => {
    live().cancelSignInChatGPT();
    return { ...nothing, note: say('signIn.cancelled', { name: NAME }) };
  },
  signOut: () => leaving(async () => {
    try { store.set(GPT_APPS_KEY, null); } catch {}
    await live().signOutChatGPT();
    return { ...nothing, note: say('status.signedOut', { name: NAME }) };
  }),
};

let startedAt = 0;
let connectedAt = 0;

const mock: Session = {
  current: async () => {
    if (signingOut || !startedAt) return { ...nothing };
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
  signOut: () => leaving(async () => {
    startedAt = 0;
    connectedAt = 0;
    store.set(GPT_APPS_KEY, null);
    return { ...nothing, note: say('status.signedOut', { name: NAME }) };
  }),
};

const waiting = (): GptState => ({ signedIn: false, waiting: true, code: MOCK_CODE, url: null, note: say('signIn.waitingUrl', { name: NAME }), resting: null });
const connected = (): GptState => ({ signedIn: !!connectedAt, waiting: false, code: null, url: null, note: say('status.ready', { name: NAME }), resting: null });

const underlying = mocked ? mock : real;
let lastSession: GptState = nothing;
export const sessionNow = () => lastSession;
export const session: Session = {
  current: async () => { const state = await underlying.current(); lastSession = state; return state; },
  start: async () => { lastSession = nothing; const state = await underlying.start(); lastSession = state; return state; },
  cancel: async () => { lastSession = nothing; const state = await underlying.cancel(); lastSession = state; return state; },
  signOut: async () => { lastSession = nothing; const state = await underlying.signOut(); lastSession = state; return state; },
};

// Claude's own sign-in state, the same shape: the page opens, the person pastes its code back.
// No stand-in exists for it, so it is always the real flow, even in stub builds.
const claudeState = (view: SignIn | null, status: Status | null) => stateOf(view, status, CLAUDE_NAME, words.claudeSignInNote);
const claudeReal: Session = {
  current: async () => {
    if (signingOut) return nothing;
    const a = live();
    await a.refresh().catch(() => {});
    const state = claudeState(a.signInState('claude'), await a.status('claude').catch(() => null));
    return signingOut ? nothing : state;
  },
  start: async () => {
    const a = live();
    await a.signInClaude();
    return claudeState(a.signInState('claude'), await a.status('claude').catch(() => null));
  },
  cancel: async () => {
    live().cancelSignIn('claude');
    return { ...nothing, note: say('signIn.cancelled', { name: CLAUDE_NAME }) };
  },
  signOut: () => leaving(async () => {
    await live().signOut('claude');
    return { ...nothing, note: say('status.signedOut', { name: CLAUDE_NAME }) };
  }),
};
let lastClaude: GptState = nothing;
export const claudeNow = () => lastClaude;
export const claudeSession: Session = {
  current: async () => { const state = await claudeReal.current(); lastClaude = state; return state; },
  start: async () => { lastClaude = nothing; const state = await claudeReal.start(); lastClaude = state; return state; },
  cancel: async () => { lastClaude = nothing; const state = await claudeReal.cancel(); lastClaude = state; return state; },
  signOut: async () => { lastClaude = nothing; const state = await claudeReal.signOut(); lastClaude = state; return state; },
};

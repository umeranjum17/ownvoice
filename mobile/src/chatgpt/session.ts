import { say, signInError } from '@byokit/accounts';
import type { SignIn, Status } from '@byokit/accounts';
import { store } from '../core/store';

export const NAME = 'ChatGPT';
export const GPT_APPS_KEY = 'chatgpt-apps';

export const mocked = process.env.EXPO_PUBLIC_E2E_GPT === '1';
const MOCK_CODE = 'KQPT-MXVD';
const MOCK_WAIT_MS = 9000;

export type GptState = {
  signedIn: boolean;
  /** Waiting for the person to type the code on the ChatGPT page. */
  waiting: boolean;
  code: string | null;
  url: string | null;
  /** The one plain line the screen shows under the button. */
  note: string | null;
  /** Connected but not writing right now (resting, or the plan doesn't include it), in byokit's words. */
  resting: string | null;
};

export const nothing: GptState = { signedIn: false, waiting: false, code: null, url: null, note: null, resting: null };

/** The sign-in screen's state, in byokit's own sentences. */
export function stateOf(view: SignIn | null, status: Status | null): GptState {
  if (view?.state === 'waiting')
    return { signedIn: signed(status), waiting: true, code: view.code ?? null, url: view.url ?? null, note: view.code ? say('signIn.waitingUrl', { name: NAME }) : say('signIn.opening', { name: NAME }), resting: null };
  if (view?.state === 'failed')
    return { ...nothing, note: /cancel/i.test(view.error ?? '') ? say('signIn.cancelled', { name: NAME }) : signInError(NAME, view.error ?? '') };
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
    const a = live();
    await a.refresh().catch(() => {});
    return stateOf(a.signInState(), await a.status().catch(() => null));
  },
  start: async () => {
    const a = live();
    await a.signIn();
    return stateOf(a.signInState(), await a.status().catch(() => null));
  },
  cancel: async () => {
    live().cancelSignIn();
    return { ...nothing, note: say('signIn.cancelled', { name: NAME }) };
  },
  signOut: async () => {
    store.set(GPT_APPS_KEY, null);
    await live().signOut();
    return { ...nothing, note: say('status.signedOut', { name: NAME }) };
  },
};

let startedAt = 0;
let connectedAt = 0;

const mock: Session = {
  current: async () => {
    if (!startedAt) return { ...nothing };
    if (Date.now() - startedAt < MOCK_WAIT_MS) return waiting();
    connectedAt = startedAt;
    return connected();
  },
  start: async () => {
    startedAt = Date.now();
    connectedAt = 0;
    return waiting();
  },
  cancel: async () => {
    startedAt = 0;
    return { ...nothing, note: say('signIn.cancelled', { name: NAME }) };
  },
  signOut: async () => {
    startedAt = 0;
    connectedAt = 0;
    store.set(GPT_APPS_KEY, null);
    return { ...nothing, note: say('status.signedOut', { name: NAME }) };
  },
};

const waiting = (): GptState => ({ signedIn: false, waiting: true, code: MOCK_CODE, url: null, note: say('signIn.waitingUrl', { name: NAME }), resting: null });
const connected = (): GptState => ({ signedIn: !!connectedAt, waiting: false, code: null, url: null, note: say('status.ready', { name: NAME }), resting: null });

export const session: Session = mocked ? mock : real;

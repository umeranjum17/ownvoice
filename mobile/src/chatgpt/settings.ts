import { jev, type Backend } from '@byokit/decide';
import Native from '../../modules/ownvoice-native';
import { showsBubble } from '../core/privacy';
import { cloudNow, cloudOf, cloudSession, getSource, isOwnApp, phoneListed, SOURCE_KEY, type CloudKey, type Source } from '../core/source';
import { phoneCanWrite } from '../core/phoneStatus';
import { modelStatus } from '../core/phoneDownload';
import { chatgptEnabled, currentSwitch, type SwitchState } from '../core/switch';
import { store } from '../core/store';
import { cloudWords, needWriter, routeWriters, SendVeto, thrower, type WriterEvents, type WriterRoute } from '../core/writers';
import { phoneWriter } from '../panel/phoneWriter';
import { words } from '../core/words';
import { mocked, signOutGuard } from './session';
const stubbed = process.env.EXPO_PUBLIC_E2E_STUB === '1';
type BubbleRules = Awaited<ReturnType<typeof Native.bubbleRules>>;
let rulesNow: BubbleRules | null = null;
let rulesVersion = 0;
let rulesPending = false;
let switchNow: SwitchState | null = null;
export async function saveBubbleRules(rules: BubbleRules): Promise<void> {
  const version = ++rulesVersion;
  rulesNow = rules;
  rulesPending = true;
  try { await Native.setBubbleRules(rules); }
  catch (error) { if (version === rulesVersion) rulesNow = null; throw error; }
  finally { if (version === rulesVersion) rulesPending = false; }
}

const switchStore = {
  get: async () => {
    const choice = store.get<SwitchState>('chatgpt-switch', true);
    if (!switchNow || (choice?.seq ?? 0) >= switchNow.seq) switchNow = choice;
    return choice;
  },
  set: async (value: SwitchState) => { switchNow = value; store.set('chatgpt-switch', value); },
};

type Guard = { active: boolean; epoch: number };

/** Still signed in under the same sign-out epoch the send started with. */
function guardOk(key: CloudKey, before: Guard, signedIn: boolean): boolean {
  const after = signOutGuard(key);
  return signedIn && !after.active && after.epoch === before.epoch;
}

/** The remote-switch plus sign-in tail every cloud send ends with: an unknown switch
 *  stops nothing here (the panel resolved it at route time); off refuses with the provider's own line. */
async function switchAndSession(before: Guard, key: CloudKey = 'chatgpt'): Promise<boolean> {
  if (before.active) return false;
  if (!mocked) {
    const choice = await currentSwitch(switchStore).catch(() => { throw new SendVeto(cloudWords(key).switchUnavailable); });
    switchNow = choice;
    if (choice?.chatgpt === 'off') throw new SendVeto(cloudWords(key).off);
  }
  return guardOk(key, before, (await cloudSession(key).current()).signedIn);
}

/** The fetch-time recheck: no sign-out since the send, still signed in, switch not off. */
function fetchCore(epoch: number, key: CloudKey = 'chatgpt'): boolean {
  const guard = signOutGuard(key);
  return !guard.active && guard.epoch === epoch && cloudNow(key).signedIn && switchNow?.chatgpt !== 'off';
}

/** Lab-agent consent (phone-agent §4.3): the same sign-out epoch and remote-switch checks the
 *  panel route uses, without any app's bubble visibility (the agent runs in no app). Unlike the
 *  panel, an unknown switch also sends nothing and refuses with the provider's own line. */
export function agentConsent(key: CloudKey): Required<Pick<WriterEvents, 'beforeSend' | 'beforeFetch'>> {
  const beforeSend = async () => {
    const before = signOutGuard(key);
    if (before.active) return false;
    const signedIn = (await cloudSession(key).current()).signedIn;
    if (!signedIn) return false;
    if (!mocked) {
      await chatgptEnabled(switchStore).catch(() => false);
      const choice = await currentSwitch(switchStore).catch(() => null);
      switchNow = choice;
      if (!choice) throw new SendVeto(cloudWords(key).switchUnavailable);
      if (choice.chatgpt === 'off') throw new SendVeto(cloudWords(key).off);
    }
    return guardOk(key, before, signedIn);
  };
  const epoch = signOutGuard(key).epoch;
  const beforeFetch = () => fetchCore(epoch, key) && (mocked || switchNow?.chatgpt === 'on');
  return { beforeSend, beforeFetch };
}

/** The consent every cloud request sends under, re-checked immediately before sending: still signed in, never mid-sign-out, not paused, the app still on that account's routing and the switch not off (`app` is null for the app-agnostic rewrite sheet). */
export function cloudConsent(key: CloudKey, app: string | null): Required<Pick<WriterEvents, 'beforeSend' | 'beforeFetch'>> {
  const practice = app != null && isOwnApp(app);
  const beforeSend = async () => {
    const before = signOutGuard(key);
    if (before.active) return false;
    const version = rulesVersion;
    const pending = rulesPending;
    const current = await Native.bubbleRules().catch(() => null);
    if (version === rulesVersion && !pending && !rulesPending) rulesNow = current;
    if (!practice && (!current || current.paused || (app != null && (!showsBubble(app, current) || phoneListed(app))))) return false;
    return switchAndSession(before, key);
  };
  const epoch = signOutGuard(key).epoch;
  const beforeFetch = () => fetchCore(epoch, key)
    && (practice || (!!rulesNow && !rulesNow.paused && (app == null || (showsBubble(app, rulesNow) && !phoneListed(app)))));
  return { beforeSend, beforeFetch };
}

/** Who writes this app's drafts, and the one plain line the panel says above them. The route comes
 *  from the chosen source: phone chosen means never the cloud, even when signed in; a cloud source
 *  (ChatGPT, Claude, OpenRouter) means that account unless this app stays on the phone, nobody is signed in to it,
 *  or it is switched off remotely. */
export async function gptRoute(app: string, fetcher?: typeof fetch): Promise<WriterRoute> {
  const source = await getSource();
  // This phone was chosen but can no longer write: the panel says to choose again, as Home does
  // (stub builds pretend the phone writes).
  if (source === 'phone') return !stubbed && (await modelStatus().catch(() => null))?.phase === 'unsupported' ? { writer: needWriter, note: null } : { writer: phoneWriter, note: null };
  const practice = isOwnApp(app);
  if (source == null) return practice ? { writer: phoneWriter, note: null } : { writer: needWriter, note: null };
  const key: CloudKey = cloudOf(source) ?? 'chatgpt';
  const state = await cloudSession(key).current();
  const version = rulesVersion;
  const pending = rulesPending;
  const rules = await Native.bubbleRules().catch(() => null);
  if (version === rulesVersion && !pending && !rulesPending) rulesNow = rules;
  const visible = practice || (!!rules && !rules.paused && showsBubble(app, rules));
  const listed = !practice && phoneListed(app);
  let switchFailed = false;
  const enabled = state.signedIn && !listed && visible && (mocked || await chatgptEnabled(switchStore, fetcher).catch(() => { switchFailed = true; return false; }));
  if (enabled && !mocked) switchNow = await currentSwitch(switchStore).catch(() => null);
  const phone = await phoneCanWrite();
  if (switchFailed) return phone === 'cant'
    ? { writer: thrower(cloudWords(key).failedNoPhone), note: null }
    : { writer: phoneWriter, note: cloudWords(key).switchUnavailable };
  const route = routeWriters({
    source,
    signedIn: state.signedIn,
    phoneOnlyApp: listed || !visible,
    enabled,
    note: state.resting ?? (!state.signedIn ? state.note : null),
    phone,
    lines: cloudWords(key),
    chatgpt: () => ({ write: async (request, on = {}) => {
      const beforeSend = async () => {
        if ((await getSource()) !== key) return false;
        const before = signOutGuard(key);
        if (before.active) return false;
        const version = rulesVersion;
        const pending = rulesPending;
        const current = await Native.bubbleRules().catch(() => null);
        if (version === rulesVersion && !pending && !rulesPending) rulesNow = current;
        if (!practice && (!current || current.paused || !showsBubble(app, current) || phoneListed(app))) return false;
        return switchAndSession(before, key);
      };
      if (mocked && key === 'chatgpt') {
        if (!(await beforeSend())) throw new SendVeto(words.phoneWrote);
        return require('../panel/stubWriter').stubWriter().write(request, on);
      }
      const beforeFetch = () => store.peek<Source>(SOURCE_KEY) === key && fetchCore(epoch, key)
        && (practice || (!!rulesNow && !rulesNow.paused && showsBubble(app, rulesNow) && !phoneListed(app)));
      const epoch = signOutGuard(key).epoch;
      return require('./responses').cloudWriter(key).write(request, { ...on, beforeSend, beforeFetch });
    } }),
    fallbackNote: async () => {
      const current = await require('./accounts').status(key).catch(() => null);
      return current && ['resting', 'not_included', 'needs_again', 'signed_out'].includes(current.state) ? current.words : null;
    },
    phoneWriter,
  });
  return route;
}

const JEV_KEY = process.env.EXPO_PUBLIC_JEV_KEY ?? '';
// Emulator acceptance only (EXPO_PUBLIC_E2E_JEV_BASE): Jev's requests go to a host stand-in instead.
const JEV_BASE = process.env.EXPO_PUBLIC_E2E_JEV_BASE;

/** Fit ratings run on the person's signed-in ChatGPT plan by default, under the same consent as a
 *  ChatGPT send for this app: the post and drafts leave the phone only when the writer's would.
 *  Jev is used only when this build carries `EXPO_PUBLIC_JEV_KEY` (emulator stand-in proof builds).
 *  Checked before sending and again at dispatch; a blocked call abstains with the plain unsure read. */
export function fitBackends(app: string, o: { key?: string; fetch?: typeof fetch; on?: Pick<WriterEvents, 'started' | 'sent' | 'unsent'> } = {}): Backend[] {
  // The fit backend follows the chosen cloud source, so the ratings reach whichever account writes.
  const cloud: CloudKey = cloudOf(store.peek<Source>(SOURCE_KEY)) ?? 'chatgpt';
  const bubble = cloudConsent(cloud, app);
  const remote = agentConsent(cloud);
  const beforeSend = async () => (await getSource()) === cloud && await bubble.beforeSend() && await remote.beforeSend();
  const beforeFetch = () => store.peek<Source>(SOURCE_KEY) === cloud && bubble.beforeFetch() && remote.beforeFetch();
  const key = o.key ?? JEV_KEY;
  if (key) {
    const send = o.fetch ?? globalThis.fetch;
    return [jev({ key, fetch: async (url, init) => {
      if (!(await beforeSend()) || !beforeFetch()) throw new SendVeto(words.phoneWrote);
      await o.on?.started?.();
      const response = await send(JEV_BASE ? String(url).replace('https://api.typesafe.ai', JEV_BASE) : url, init);
      await o.on?.sent?.();
      return response;
    } })];
  }
  // The plan's default fit transport, over the same `askCloud` boundary the writer uses.
  return [require('./responses').fitBackend(cloud, { ...o.on, beforeSend, beforeFetch }, o.fetch)];
}

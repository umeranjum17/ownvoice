import Native from '../../modules/ownvoice-native';
import { showsBubble } from '../core/privacy';
import { getSource, isOwnApp, phoneListed } from '../core/source';
import { phoneCanWrite } from '../core/phoneStatus';
import { modelStatus } from '../core/phoneDownload';
import { CHATGPT_OFF, chatgptEnabled, currentSwitch, type SwitchState } from '../core/switch';
import { store } from '../core/store';
import { needWriter, routeWriters, SendVeto, thrower, type WriterEvents, type WriterRoute } from '../core/writers';
import { phoneWriter } from '../panel/phoneWriter';
import { words } from '../core/words';
import { mocked, session, sessionNow, signOutGuard } from './session';
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
function guardOk(before: Guard, signedIn: boolean): boolean {
  const after = signOutGuard();
  return signedIn && !after.active && after.epoch === before.epoch;
}

/** The remote-switch plus sign-in tail every ChatGPT send ends with: an unknown switch
 *  stops nothing here (the panel resolved it at route time); off refuses with CHATGPT_OFF. */
async function switchAndSession(before: Guard): Promise<boolean> {
  if (before.active) return false;
  if (!mocked) {
    const choice = await currentSwitch(switchStore).catch(() => { throw new SendVeto(words.switchUnavailable); });
    switchNow = choice;
    if (choice?.chatgpt === 'off') throw new SendVeto(CHATGPT_OFF);
  }
  return guardOk(before, (await session.current()).signedIn);
}

/** The fetch-time recheck: no sign-out since the send, still signed in, switch not off. */
function fetchCore(epoch: number): boolean {
  const guard = signOutGuard();
  return !guard.active && guard.epoch === epoch && sessionNow().signedIn && switchNow?.chatgpt !== 'off';
}

/** Lab-agent consent (phone-agent §4.3): the same sign-out epoch and remote-switch checks the
 *  panel route uses, without any app's bubble visibility (the agent runs in no app). Unlike the
 *  panel, an unknown switch also sends nothing and refuses with `switchUnavailable`. */
export function agentChatgptConsent(): Required<Pick<WriterEvents, 'beforeSend' | 'beforeFetch'>> {
  const beforeSend = async () => {
    const before = signOutGuard();
    if (before.active) return false;
    const signedIn = (await session.current()).signedIn;
    if (!signedIn) return false;
    if (!mocked) {
      await chatgptEnabled(switchStore).catch(() => false);
      const choice = await currentSwitch(switchStore).catch(() => null);
      switchNow = choice;
      if (!choice) throw new SendVeto(words.switchUnavailable);
      if (choice.chatgpt === 'off') throw new SendVeto(CHATGPT_OFF);
    }
    return guardOk(before, signedIn);
  };
  const epoch = signOutGuard().epoch;
  const beforeFetch = () => fetchCore(epoch) && (mocked || switchNow?.chatgpt === 'on');
  return { beforeSend, beforeFetch };
}

/** The consent every ChatGPT request sends under, re-checked immediately before sending: still signed in, never mid-sign-out, not paused, the app still on ChatGPT routing and the switch not off (`app` is null for the app-agnostic rewrite sheet). */
export function chatgptConsent(app: string | null): Required<Pick<WriterEvents, 'beforeSend' | 'beforeFetch'>> {
  const practice = app != null && isOwnApp(app);
  const beforeSend = async () => {
    const before = signOutGuard();
    if (before.active) return false;
    const version = rulesVersion;
    const pending = rulesPending;
    const current = await Native.bubbleRules().catch(() => null);
    if (version === rulesVersion && !pending && !rulesPending) rulesNow = current;
    if (!practice && (!current || current.paused || (app != null && (!showsBubble(app, current) || phoneListed(app))))) return false;
    return switchAndSession(before);
  };
  const epoch = signOutGuard().epoch;
  const beforeFetch = () => fetchCore(epoch)
    && (practice || (!!rulesNow && !rulesNow.paused && (app == null || (showsBubble(app, rulesNow) && !phoneListed(app)))));
  return { beforeSend, beforeFetch };
}

/** Who writes this app's drafts, and the one plain line the panel says above them. The route comes
 *  from the chosen source: phone chosen means never ChatGPT, even when signed in; ChatGPT chosen means
 *  ChatGPT unless this app stays on the phone, nobody is signed in, or it is switched off remotely. */
export async function gptRoute(app: string, fetcher?: typeof fetch): Promise<WriterRoute> {
  const source = await getSource();
  // This phone was chosen but can no longer write: the panel says to choose again, as Home does
  // (stub builds pretend the phone writes).
  if (source === 'phone') return !stubbed && await modelStatus().catch(() => null) === 'unavailable' ? { writer: needWriter, note: null } : { writer: phoneWriter, note: null };
  const practice = isOwnApp(app);
  if (source == null) return practice ? { writer: phoneWriter, note: null } : { writer: needWriter, note: null };
  const state = await session.current();
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
    ? { writer: thrower(words.gptFailedNoPhone), note: null }
    : { writer: phoneWriter, note: words.switchUnavailable };
  const route = routeWriters({
    source,
    signedIn: state.signedIn,
    phoneOnlyApp: listed || !visible,
    enabled,
    note: state.resting ?? (!state.signedIn ? state.note : null),
    phone,
    chatgpt: () => ({ write: async (request, on = {}) => {
      const beforeSend = async () => {
        const before = signOutGuard();
        if (before.active) return false;
        const version = rulesVersion;
        const pending = rulesPending;
        const current = await Native.bubbleRules().catch(() => null);
        if (version === rulesVersion && !pending && !rulesPending) rulesNow = current;
        if (!practice && (!current || current.paused || !showsBubble(app, current) || phoneListed(app))) return false;
        return switchAndSession(before);
      };
      if (mocked) {
        if (!(await beforeSend())) throw new SendVeto(words.phoneWrote);
        return require('../panel/stubWriter').stubWriter().write(request, on);
      }
      const beforeFetch = () => fetchCore(epoch)
        && (practice || (!!rulesNow && !rulesNow.paused && showsBubble(app, rulesNow) && !phoneListed(app)));
      const epoch = signOutGuard().epoch;
      return require('./responses').chatgptWriter.write(request, { ...on, beforeSend, beforeFetch });
    } }),
    fallbackNote: async () => {
      const current = await require('./accounts').status();
      return ['resting', 'not_included', 'needs_again', 'signed_out'].includes(current.state) ? current.words : null;
    },
    phoneWriter,
  });
  return route;
}

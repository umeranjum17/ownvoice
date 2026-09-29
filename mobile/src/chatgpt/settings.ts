import Native from '../../modules/ownvoice-native';
import { chatgptAllowed, showsBubble } from '../core/privacy';
import { getSource, isOwnApp, phoneOnly } from '../core/source';
import { phoneCanWrite } from '../core/phoneStatus';
import { CHATGPT_OFF, chatgptEnabled, currentSwitch, type SwitchState } from '../core/switch';
import { store } from '../core/store';
<<<<<<< HEAD
import { routeWriters, SendVeto, type WriterEvents, type WriterRoute } from '../core/writers';
=======
import { needWriter, routeWriters, SendVeto, type WriterEvents, type WriterRoute } from '../core/writers';
>>>>>>> d355308 (feat(mobile): route every draft through the chosen writing source (P3))
import { phoneWriter } from '../panel/phoneWriter';
import { words } from '../core/words';
import { GPT_APPS_KEY, mocked, session, sessionNow, signOutGuard } from './session';

export type GptApps = { on: string[] };

export const gptApps = (strict = false): GptApps | null => store.get<GptApps>(GPT_APPS_KEY, strict);
export async function saveGptApps(apps: GptApps): Promise<boolean> {
  const before = signOutGuard();
  if (before.active || !(await session.current()).signedIn) return false;
  const after = signOutGuard();
  if (after.active || after.epoch !== before.epoch) return false;
  store.set(GPT_APPS_KEY, apps);
  return true;
}
export const gptChoice = (app: string): boolean => !!gptApps()?.on.includes(app);
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

<<<<<<< HEAD
/** The consent every ChatGPT request sends under, re-checked immediately before sending: still signed in, never mid-sign-out, not paused, the app still chosen and the switch not off (`app` is null for the app-agnostic rewrite sheet). */
export function chatgptConsent(app: string | null): Required<Pick<WriterEvents, 'beforeSend' | 'beforeFetch'>> {
  const beforeSend = async () => {
    const before = signOutGuard();
    if (before.active) return false;
    const version = rulesVersion;
    const pending = rulesPending;
    const current = await Native.bubbleRules().catch(() => null);
    if (version === rulesVersion && !pending && !rulesPending) rulesNow = current;
    if (!current || current.paused || (app != null && !chatgptAllowed(showsBubble(app, current), gptChoice(app)))) return false;
    if (!mocked) {
      const choice = await currentSwitch(switchStore).catch(() => { throw new SendVeto(words.switchUnavailable); });
      switchNow = choice;
      if (choice?.chatgpt === 'off') throw new SendVeto(CHATGPT_OFF);
    }
    const signedIn = (await session.current()).signedIn;
    const after = signOutGuard();
    return signedIn && !after.active && after.epoch === before.epoch;
  };
  const epoch = signOutGuard().epoch;
  const beforeFetch = () => {
    const guard = signOutGuard();
    return !guard.active && guard.epoch === epoch && sessionNow().signedIn
      && !!rulesNow && !rulesNow.paused && (app == null || chatgptAllowed(showsBubble(app, rulesNow), !!store.peek<GptApps>(GPT_APPS_KEY)?.on.includes(app)))
      && switchNow?.chatgpt !== 'off';
  };
  return { beforeSend, beforeFetch };
}

/** Who writes this app's drafts, and the one plain line the panel says above them. */
=======
/** The consent every ChatGPT request sends under, re-checked immediately before sending: still signed in, never mid-sign-out, not paused, the app still chosen and the switch not off (`app` is null for the app-agnostic rewrite sheet). */
export function chatgptConsent(app: string | null): Required<Pick<WriterEvents, 'beforeSend' | 'beforeFetch'>> {
  const beforeSend = async () => {
    const before = signOutGuard();
    if (before.active) return false;
    const version = rulesVersion;
    const pending = rulesPending;
    const current = await Native.bubbleRules().catch(() => null);
    if (version === rulesVersion && !pending && !rulesPending) rulesNow = current;
    if (!current || current.paused || (app != null && !chatgptAllowed(showsBubble(app, current), gptChoice(app)))) return false;
    if (!mocked) {
      const choice = await currentSwitch(switchStore).catch(() => { throw new SendVeto(words.switchUnavailable); });
      switchNow = choice;
      if (choice?.chatgpt === 'off') throw new SendVeto(CHATGPT_OFF);
    }
    const signedIn = (await session.current()).signedIn;
    const after = signOutGuard();
    return signedIn && !after.active && after.epoch === before.epoch;
  };
  const epoch = signOutGuard().epoch;
  const beforeFetch = () => {
    const guard = signOutGuard();
    return !guard.active && guard.epoch === epoch && sessionNow().signedIn
      && !!rulesNow && !rulesNow.paused && (app == null || chatgptAllowed(showsBubble(app, rulesNow), !!store.peek<GptApps>(GPT_APPS_KEY)?.on.includes(app)))
      && switchNow?.chatgpt !== 'off';
  };
  return { beforeSend, beforeFetch };
}

/** Who writes this app's drafts, and the one plain line the panel says above them. The route comes
 *  from the chosen source: phone chosen means never ChatGPT, even when signed in; ChatGPT chosen means
 *  ChatGPT unless this app stays on the phone, nobody is signed in, or it is switched off remotely. */
>>>>>>> d355308 (feat(mobile): route every draft through the chosen writing source (P3))
export async function gptRoute(app: string, fetcher?: typeof fetch): Promise<WriterRoute> {
  const source = await getSource();
  if (source === 'phone') return { writer: phoneWriter, note: null };
  if (source == null) return { writer: needWriter, note: null };
  const practice = isOwnApp(app);
  const state = await session.current();
  const version = rulesVersion;
  const pending = rulesPending;
  const rules = await Native.bubbleRules().catch(() => null);
  if (version === rulesVersion && !pending && !rulesPending) rulesNow = rules;
  const visible = practice || (!!rules && !rules.paused && showsBubble(app, rules));
  const listed = !practice && phoneOnly().includes(app);
  let switchFailed = false;
  const enabled = state.signedIn && !listed && visible && (mocked || await chatgptEnabled(switchStore, fetcher).catch(() => { switchFailed = true; return false; }));
  if (enabled && !mocked) switchNow = await currentSwitch(switchStore).catch(() => null);
  if (switchFailed) return { writer: phoneWriter, note: words.switchUnavailable };
  const route = routeWriters({
    source,
    signedIn: state.signedIn,
    phoneOnlyApp: listed || !visible,
    enabled,
    note: state.resting ?? (!state.signedIn ? state.note : null),
    phone: await phoneCanWrite(),
    chatgpt: () => ({ write: async (request, on = {}) => {
<<<<<<< HEAD
      const { beforeSend, beforeFetch } = chatgptConsent(app);
=======
      const beforeSend = async () => {
        const before = signOutGuard();
        if (before.active) return false;
        const version = rulesVersion;
        const pending = rulesPending;
        const current = await Native.bubbleRules().catch(() => null);
        if (version === rulesVersion && !pending && !rulesPending) rulesNow = current;
        if (!practice && (!current || current.paused || !showsBubble(app, current) || phoneOnly().includes(app))) return false;
        if (!mocked) {
          const choice = await currentSwitch(switchStore).catch(() => { throw new SendVeto(words.switchUnavailable); });
          switchNow = choice;
          if (choice?.chatgpt === 'off') throw new SendVeto(CHATGPT_OFF);
        }
        const signedIn = (await session.current()).signedIn;
        const after = signOutGuard();
        return signedIn && !after.active && after.epoch === before.epoch;
      };
>>>>>>> d355308 (feat(mobile): route every draft through the chosen writing source (P3))
      if (mocked) {
        if (!(await beforeSend())) throw new SendVeto(words.phoneWrote);
        return require('../panel/stubWriter').stubWriter().write(request, on);
      }
<<<<<<< HEAD
=======
      const beforeFetch = () => {
        const guard = signOutGuard();
        return !guard.active && guard.epoch === epoch && sessionNow().signedIn
          && (practice || (!!rulesNow && !rulesNow.paused && showsBubble(app, rulesNow) && !phoneOnly().includes(app)))
          && switchNow?.chatgpt !== 'off';
      };
      const epoch = signOutGuard().epoch;
>>>>>>> d355308 (feat(mobile): route every draft through the chosen writing source (P3))
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

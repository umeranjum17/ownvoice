import Native from '../../modules/ownvoice-native';
import { chatgptAllowed, showsBubble } from '../core/privacy';
import { CHATGPT_OFF, chatgptEnabled, currentSwitch, type SwitchState } from '../core/switch';
import { store } from '../core/store';
import { routeWriters, SendVeto, type WriterRoute } from '../core/writers';
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

/** Who writes this app's drafts, and the one plain line the panel says above them. */
export async function gptRoute(app: string, fetcher?: typeof fetch): Promise<WriterRoute> {
  const state = await session.current();
  const version = rulesVersion;
  const pending = rulesPending;
  const rules = await Native.bubbleRules().catch(() => null);
  if (version === rulesVersion && !pending && !rulesPending) rulesNow = rules;
  const allowed = !!rules && !rules.paused && chatgptAllowed(showsBubble(app, rules), gptChoice(app));
  let switchFailed = false;
  const enabled = state.signedIn && allowed && (mocked || await chatgptEnabled(switchStore, fetcher).catch(() => { switchFailed = true; return false; }));
  if (enabled && !mocked) switchNow = await currentSwitch(switchStore).catch(() => null);
  const route = routeWriters({
    signedIn: state.signedIn,
    allowed,
    enabled,
    note: state.resting,
    chatgpt: () => ({ write: async (request, on = {}) => {
      const beforeSend = async () => {
        const before = signOutGuard();
        if (before.active) return false;
        const version = rulesVersion;
        const pending = rulesPending;
        const current = await Native.bubbleRules().catch(() => null);
        if (version === rulesVersion && !pending && !rulesPending) rulesNow = current;
        if (!current || current.paused || !chatgptAllowed(showsBubble(app, current), gptChoice(app))) return false;
        if (!mocked) {
          const choice = await currentSwitch(switchStore).catch(() => { throw new SendVeto(words.switchUnavailable); });
          switchNow = choice;
          if (choice?.chatgpt === 'off') throw new SendVeto(CHATGPT_OFF);
        }
        const signedIn = (await session.current()).signedIn;
        const after = signOutGuard();
        return signedIn && !after.active && after.epoch === before.epoch;
      };
      if (mocked) {
        if (!(await beforeSend())) throw new SendVeto(words.phoneWrote);
        return require('../panel/stubWriter').stubWriter().write(request, on);
      }
      const beforeFetch = () => {
        const guard = signOutGuard();
        return !guard.active && guard.epoch === epoch && sessionNow().signedIn
          && !!rulesNow && !rulesNow.paused && chatgptAllowed(showsBubble(app, rulesNow), !!store.peek<GptApps>(GPT_APPS_KEY)?.on.includes(app))
          && switchNow?.chatgpt !== 'off';
      };
      const epoch = signOutGuard().epoch;
      return require('./responses').chatgptWriter.write(request, { ...on, beforeSend, beforeFetch });
    } }),
    fallbackNote: async () => {
      const current = await require('./accounts').status();
      return ['resting', 'not_included', 'needs_again', 'signed_out'].includes(current.state) ? current.words : null;
    },
    phone: phoneWriter,
  });
  return switchFailed ? { ...route, note: words.switchUnavailable } : route;
}

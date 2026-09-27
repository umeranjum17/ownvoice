import Native from '../../modules/ownvoice-native';
import { chatgptAllowed, showsBubble } from '../core/privacy';
import { chatgptEnabled, currentSwitch, type SwitchState } from '../core/switch';
import { store } from '../core/store';
import { routeWriters, type WriterRoute } from '../core/writers';
import { phoneWriter } from '../panel/phoneWriter';
import { words } from '../core/words';
import { GPT_APPS_KEY, mocked, session, signOutGuard } from './session';

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

const switchStore = {
  get: async () => store.get<SwitchState>('chatgpt-switch', true),
  set: async (value: SwitchState) => { store.set('chatgpt-switch', value); },
};

/** Who writes this app's drafts, and the one plain line the panel says above them. */
export async function gptRoute(app: string, fetcher?: typeof fetch): Promise<WriterRoute> {
  const state = await session.current();
  const rules = await Native.bubbleRules().catch(() => null);
  const allowed = !!rules && !rules.paused && chatgptAllowed(showsBubble(app, rules), gptChoice(app));
  let switchFailed = false;
  const enabled = state.signedIn && allowed && (mocked || await chatgptEnabled(switchStore, fetcher).catch(() => { switchFailed = true; return false; }));
  const route = routeWriters({
    signedIn: state.signedIn,
    allowed,
    enabled,
    note: state.resting,
    chatgpt: () => ({ write: async (request, on = {}) => {
      const beforeSend = async () => {
        const before = signOutGuard();
        if (before.active) return false;
        const current = await Native.bubbleRules().catch(() => null);
        if (!current || current.paused || !chatgptAllowed(showsBubble(app, current), gptChoice(app))) return false;
        if (!mocked && !(await currentSwitch(switchStore).then(choice => choice?.chatgpt !== 'off', () => false))) return false;
        const signedIn = (await session.current()).signedIn;
        const after = signOutGuard();
        return signedIn && !after.active && after.epoch === before.epoch;
      };
      if (mocked) {
        if (!(await beforeSend())) throw new Error('App choice changed');
        return require('../panel/stubWriter').stubWriter().write(request, on);
      }
      return require('./responses').chatgptWriter.write(request, { ...on, beforeSend });
    } }),
    fallbackNote: async () => {
      const current = await require('./accounts').status();
      return ['resting', 'not_included', 'needs_again', 'signed_out'].includes(current.state) ? current.words : null;
    },
    phone: phoneWriter,
  });
  return switchFailed ? { ...route, note: words.switchUnavailable } : route;
}

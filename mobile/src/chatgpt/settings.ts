import Native from '../../modules/ownvoice-native';
import { chatgptAllowed, showsBubble } from '../core/privacy';
import { chatgptEnabled, type SwitchState } from '../core/switch';
import { store } from '../core/store';
import { routeWriters, type WriterRoute } from '../core/writers';
import { phoneWriter } from '../panel/phoneWriter';
import { GPT_APPS_KEY, mocked, session } from './session';

export type GptApps = { on: string[] };

export const gptApps = (): GptApps | null => store.get<GptApps>(GPT_APPS_KEY);
export async function saveGptApps(apps: GptApps): Promise<boolean> {
  if (!(await session.current()).signedIn) return false;
  store.set(GPT_APPS_KEY, apps);
  return true;
}
export const gptChoice = (app: string): boolean => !!gptApps()?.on.includes(app);

const switchStore = {
  get: async () => store.get<SwitchState>('chatgpt-switch'),
  set: async (value: SwitchState) => { store.set('chatgpt-switch', value); },
};

/** Who writes this app's drafts, and the one plain line the panel says above them. */
export async function gptRoute(app: string, fetcher?: typeof fetch): Promise<WriterRoute> {
  const state = await session.current();
  const rules = await Native.bubbleRules().catch(() => null);
  const allowed = !!rules && chatgptAllowed(showsBubble(app, rules), gptChoice(app));
  const enabled = state.signedIn && allowed && (mocked || await chatgptEnabled(switchStore, fetcher));
  return routeWriters({
    signedIn: state.signedIn,
    allowed,
    enabled,
    note: state.resting,
    chatgpt: () => (mocked ? { write: (request, on) => { on?.sent?.(); return require('../panel/stubWriter').stubWriter().write(request, on); } } : require('./responses').chatgptWriter),
    phone: phoneWriter,
  });
}

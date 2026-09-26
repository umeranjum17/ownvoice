import Native from '../../modules/ownvoice-native';
import { chatgptAllowed, showsBubble } from '../core/privacy';
import { chatgptEnabled, type SwitchState } from '../core/switch';
import { store } from '../core/store';
import { routeWriters, type WriterRoute } from '../core/writers';
import { phoneWriter } from '../panel/phoneWriter';
import { mocked, session } from './session';

export type GptApps = { on: string[]; off: string[] };
const APPS = 'chatgpt-apps';

export const gptApps = (): GptApps | null => store.get<GptApps>(APPS);
export const saveGptApps = (apps: GptApps): void => store.set(APPS, apps);
export const gptChoice = (app: string): boolean => !!gptApps()?.on.includes(app);

const switchStore = {
  get: async () => store.get<SwitchState>('chatgpt-switch'),
  set: async (value: SwitchState) => { store.set('chatgpt-switch', value); },
};

/** Who writes this app's drafts, and the one plain line the panel says above them. */
export async function gptRoute(app: string, fetcher?: typeof fetch): Promise<WriterRoute> {
  const state = await session.current();
  let enabled = false;
  if (state.signedIn) enabled = mocked || await chatgptEnabled(switchStore, fetcher);
  const rules = await Native.bubbleRules().catch(() => null);
  return routeWriters({
    signedIn: state.signedIn,
    allowed: !!rules && chatgptAllowed(showsBubble(app, rules), gptChoice(app)),
    enabled,
    note: state.resting,
    chatgpt: () => (mocked ? { write: (request, on) => { on?.sent?.(); return require('../panel/stubWriter').stubWriter().write(request, on); } } : require('./responses').chatgptWriter),
    phone: phoneWriter,
  });
}

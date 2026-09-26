import Native from '../../modules/ownvoice-native';
import { chatgptAllowed, showsBubble } from '../core/privacy';
import { chatgptEnabled, type SwitchState } from '../core/switch';
import { store } from '../core/store';
import { routeWriters, type WriterRoute } from '../core/writers';
import { phoneWriter } from '../panel/phoneWriter';
import { MOCK, mocked, session } from './session';

// "Apps that can use ChatGPT": the person's own switches, on top of the apps whose bubble is on
// (default: every app except the private workplace chats, which stay with the phone).
export type GptApps = { on: string[]; off: string[] };
const APPS = 'chatgpt-apps';

export const gptApps = (): GptApps => store.get<GptApps>(APPS) ?? { on: [], off: [] };

/** null means the person hasn't chosen for this app, so the default applies. */
export function gptChoice(app: string): boolean | undefined {
  const rules = gptApps();
  return rules.on.includes(app) ? true : rules.off.includes(app) ? false : undefined;
}

export function setGptApp(app: string, on: boolean): void {
  const current = gptApps();
  const next: GptApps = { on: current.on.filter(value => value !== app), off: current.off.filter(value => value !== app) };
  (on ? next.on : next.off).push(app);
  store.set(APPS, next);
}

const switchStore = {
  get: async () => store.get<SwitchState>('chatgpt-switch'),
  set: async (value: SwitchState) => { store.set('chatgpt-switch', value); },
};

/** Who writes this app's drafts, and the one plain line the panel says above them. */
export async function gptRoute(app: string, fetcher?: typeof fetch): Promise<WriterRoute> {
  const state = await session.current();
  let enabled = false;
  if (state.signedIn) enabled = mocked ? MOCK !== 'off' : await chatgptEnabled(switchStore, fetcher);
  const rules = await Native.bubbleRules().catch(() => null);
  return routeWriters({
    signedIn: state.signedIn,
    allowed: !!rules && chatgptAllowed(app, showsBubble(app, rules), gptChoice(app)),
    enabled,
    note: state.resting,
    // The real ChatGPT writer is only pulled in when it is the one that writes; the emulator stand-in
    // writes fixed drafts so proof never needs an account.
    chatgpt: () => (mocked ? { write: (request, on) => { on?.sent?.(); return require('../panel/stubWriter').stubWriter().write(request, on); } } : require('./responses').chatgptWriter),
    phone: phoneWriter,
  });
}

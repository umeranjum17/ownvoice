import Native from '../../modules/ownvoice-native';
import { GPT_APPS_KEY, session } from '../chatgpt/session';
import type { GptApps } from '../chatgpt/settings';
import { CHATGPT_DEFAULT_OFF, DEFAULT_ON, showsBubble } from './privacy';
import { store } from './store';

export type Source = 'phone' | 'chatgpt' | null;
export const SOURCE_KEY = 'writer-source';
export const PHONE_ONLY_KEY = 'chatgpt-phone-only';

/** The chosen writing source, migrating the old sign-in state once when no choice is stored. */
export async function getSource(): Promise<Source> {
  const saved = store.get<Source>(SOURCE_KEY);
  if (saved) return saved;
  const setup = !!store.get<boolean>('setup-done');
  const on = setup ? store.get<GptApps>(GPT_APPS_KEY)?.on ?? [] : [];
  if (on.length && (await session.current()).signedIn) {
    const rules = await Native.bubbleRules().catch(() => ({ paused: false, on: [], off: [] }));
    const bubble = new Set([...DEFAULT_ON, ...rules.on]);
    // Apps that used to keep the phone keep it now; everything else the bubble shows follows ChatGPT.
    store.set(PHONE_ONLY_KEY, [...bubble].filter(app => showsBubble(app, rules) && !on.includes(app)));
    store.set(SOURCE_KEY, 'chatgpt');
    return 'chatgpt';
  }
  if (!setup) return null;
  store.set(SOURCE_KEY, 'phone');
  return 'phone';
}

export function setSource(source: Source): void { store.set(SOURCE_KEY, source); }

/** Apps that stay on this phone even when ChatGPT writes; starts as the old default-off list. */
export function phoneOnly(): string[] { return store.get<string[]>(PHONE_ONLY_KEY) ?? [...CHATGPT_DEFAULT_OFF]; }

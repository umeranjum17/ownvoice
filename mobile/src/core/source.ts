import Native from '../../modules/ownvoice-native';
import { claudeNow, claudeSession, GPT_APPS_KEY, session, sessionNow } from '../chatgpt/session';
import { CHATGPT_DEFAULT_OFF, DEFAULT_ON, showsBubble } from './privacy';
import { store } from './store';

/** The accounts the app can write with, as chosen in How Ownvoice writes. */
export type CloudKey = 'chatgpt' | 'claude';
/** The chosen writing source: 'phone' for on-device, a plan provider key ('claude', 'chatgpt', etc.) for cloud, or null when not chosen. */
export type Source = 'phone' | string | null;
/** The cloud account a source names, or null for phone, not chosen, or anything else. */
export const cloudOf = (source: Source | undefined): CloudKey | null => source === 'chatgpt' || source === 'claude' ? source : null;
/** The chosen cloud account's own session, and its synchronous mirror. */
export const cloudSession = (key: CloudKey) => key === 'claude' ? claudeSession : session;
export const cloudNow = (key: CloudKey) => (key === 'claude' ? claudeNow : sessionNow)();
export const SOURCE_KEY = 'writer-source';
export const PHONE_ONLY_KEY = 'chatgpt-phone-only';
// "Not chosen" on purpose (signed out on a phone that can't write): kept, never migrated again.
const NONE = 'none';

/** The choice as last stored, without migrating: undefined when nothing is stored yet. */
export function storedSource(): Source | undefined {
  const saved = store.get<Source | typeof NONE>(SOURCE_KEY);
  return saved === NONE ? null : saved ?? undefined;
}

/** The chosen writing source, migrating the old sign-in state once when no choice is stored. */
export async function getSource(): Promise<Source> {
  const saved = storedSource();
  if (saved !== undefined) return saved;
  const setup = !!store.get<boolean>('setup-done');
  const on = setup ? store.get<{ on: string[] }>(GPT_APPS_KEY)?.on ?? [] : [];
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

export function setSource(source: Source): void { store.set(SOURCE_KEY, source ?? NONE); }

/** Apps that stay on this phone even when ChatGPT writes; starts as the old default-off list. */
export function phoneOnly(strict = false): string[] { return store.get<string[]>(PHONE_ONLY_KEY, strict) ?? [...CHATGPT_DEFAULT_OFF]; }

/** Whether the app stays on this phone; an unreadable list keeps every app on the phone. */
export function phoneListed(app: string): boolean {
  try { return phoneOnly(true).includes(app); } catch { return true; }
}

/** Ownvoice's own app: the setup practice chat. Its drafts always go through, never gated by lists. */
export const isOwnApp = (app: string): boolean => app.startsWith('dev.ownvoice.')

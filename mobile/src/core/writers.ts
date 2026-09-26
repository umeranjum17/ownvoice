import { CHATGPT_OFF } from './switch';
import { words } from './words';
import type { ScreenText } from './drafts';

export type DraftRequest = { conversation: string; written: string; nodes?: ScreenText[]; fieldTop?: number; typed: string; guide?: string; dashes?: 'keep' | 'remove'; avoid?: string[] };
export type WriterState = 'downloading' | 'writing';
export type WriterEvents = { state?: (state: WriterState) => void; landed?: (text: string, slot: number, label?: string) => void; reset?: () => void; fraction?: (value: number) => void; sent?: () => void };
export type Choice = { drafts: string[]; reason?: string };
export interface Writer { write(request: DraftRequest, on?: WriterEvents): Promise<Choice> }

export async function withPhoneFallback(primary: Writer, phone: Writer, request: DraftRequest, on?: WriterEvents): Promise<Choice> {
  try {
    const { drafts } = await primary.write(request, on);
    if (drafts.length !== 3 || drafts.some(draft => !draft.trim())) throw new Error('empty');
    return { drafts };
  } catch {
    on?.reset?.();
    return { ...(await phone.write(request, on)), reason: words.fallback };
  }
}

/** Which writer the panel uses for one screen, and the one plain line it says above the drafts. */
export type WriterRoute = { writer: Writer; note: string | null };

/** ChatGPT is the main writer when it is signed in and allowed here; the phone model takes over when it is turned
 *  off remotely, rests, or fails. `note` is byokit's own line for resting or a plan that doesn't include this. */
export function routeWriters(options: { signedIn: boolean; allowed: boolean; enabled: boolean; note?: string | null; chatgpt: () => Writer; phone: Writer }): WriterRoute {
  const { phone } = options;
  if (!options.signedIn || !options.allowed) return { writer: phone, note: null };
  if (!options.enabled) return { writer: phone, note: CHATGPT_OFF };
  if (options.note) return { writer: phone, note: options.note };
  return { writer: { write: (request, on) => withPhoneFallback(options.chatgpt(), phone, request, on) }, note: null };
}

import { classify } from '@byokit/accounts';
import { CHATGPT_OFF } from './switch';
import { words } from './words';
import type { ScreenText } from './drafts';
import type { PhoneCanWrite } from './phoneStatus';
import type { Source } from './source';

export type DraftRequest = { conversation: string; written: string; nodes?: ScreenText[]; fieldTop?: number; typed: string; guide?: string; dashes?: 'keep' | 'remove'; avoid?: string[] };
export type WriterState = 'downloading' | 'writing';
export type WriterEvents = { state?: (state: WriterState) => void; landed?: (text: string, slot: number, label?: string) => void; reset?: () => void; fraction?: (value: number) => void; sent?: () => void | Promise<void>; unsent?: () => void | Promise<void>; started?: () => void; beforeSend?: () => Promise<boolean>; beforeFetch?: () => boolean };
export type Choice = { drafts: string[]; reason?: string };
export interface Writer { write(request: DraftRequest, on?: WriterEvents): Promise<Choice> }
export class SendVeto extends Error {}

/** No writer chosen yet: the panel says to choose first instead of drafting. */
export const needWriter: Writer = { write: async () => { throw new Error(words.needWriterPanel); } };

/** Failed lines worth a Try again button: sending again can work once the network, ChatGPT or its switch recovers. */
export const retryLines: Set<string> = new Set([words.gptFailedNoPhone, words.offlineNoPhone, words.gptOffNoPhone]);

const thrower = (line: string): Writer => ({ write: async () => { throw new Error(line); } });

/** The one plain line for a failed ChatGPT call on a phone that cannot write instead. */
function noPhoneLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof SendVeto && message === CHATGPT_OFF) return words.gptOffNoPhone;
  if (classify(message)?.kind === 'network') return words.offlineNoPhone;
  return words.gptFailedNoPhone;
}

export async function withPhoneFallback(primary: Writer, phone: Writer, request: DraftRequest, on?: WriterEvents, fallbackNote?: () => Promise<string | null>, phoneStatus?: PhoneCanWrite): Promise<Choice> {
  try {
    const { drafts } = await primary.write(request, on);
    if (drafts.length !== 3 || drafts.some(draft => !draft.trim())) throw new Error('empty');
    return { drafts };
  } catch (error) {
    on?.reset?.();
    if (phoneStatus === 'cant') throw new Error(noPhoneLine(error));
    const message = error instanceof Error ? error.message : String(error);
    const reason = error instanceof SendVeto ? error.message
      : classify(message)?.kind === 'network' ? words.offlinePhone
      : (await fallbackNote?.().catch(() => null)) ?? words.fallback;
    return { ...(await phone.write(request, on)), reason };
  }
}

/** Which writer the panel uses for one screen, and the one plain line it says above the drafts. */
export type WriterRoute = { writer: Writer; note: string | null };

/** The route comes from the chosen source, never from sign-in plus an allow-list. Phone chosen means
 *  never ChatGPT, even when signed in. ChatGPT chosen means ChatGPT unless this app stays on the phone,
 *  nobody is signed in, or it is switched off remotely. The phone writes as the fallback only when it
 *  can; otherwise the panel gets the no-phone line for the failure. `note` is byokit's own line for
 *  resting or a plan that doesn't include this, or the sign-in line when signed out. */
export function routeWriters(options: { source: Source; signedIn: boolean; phoneOnlyApp: boolean; enabled: boolean; note?: string | null; phone: PhoneCanWrite; chatgpt: () => Writer; phoneWriter: Writer; fallbackNote?: () => Promise<string | null> }): WriterRoute {
  const { phoneWriter } = options;
  if (options.source === 'phone') return { writer: phoneWriter, note: null };
  if (options.source == null) return { writer: needWriter, note: null };
  if (options.phoneOnlyApp) return { writer: phoneWriter, note: null };
  if (!options.signedIn) return options.phone === 'cant'
    ? { writer: thrower(options.note ?? words.needWriterNote), note: null }
    : { writer: phoneWriter, note: null };
  if (!options.enabled) return options.phone === 'cant'
    ? { writer: thrower(words.gptOffNoPhone), note: null }
    : { writer: phoneWriter, note: CHATGPT_OFF };
  if (options.note) return options.phone === 'cant'
    ? { writer: thrower(options.note), note: null }
    : { writer: phoneWriter, note: options.note };
  return { writer: { write: (request, on) => withPhoneFallback(options.chatgpt(), phoneWriter, request, on, options.fallbackNote, options.phone) }, note: null };
}

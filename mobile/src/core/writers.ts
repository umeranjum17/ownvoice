import { classify } from '@byokit/accounts';
import { CHATGPT_OFF } from './switch';
import { words } from './words';
import type { ScreenText } from './drafts';
import type { Platform } from './platforms';
import type { PhoneCanWrite } from './phoneStatus';
import type { CloudKey, Source } from './source';

/** `point`: in grow mode, what they typed; replies start from it while `typed` stays empty. */
/** `never`: their never-say phrases; a reply card still using one is dropped so the slot is asked once more. */
/** `samples`: the same selected replies the fit call judges as "Sounds like you"; the phone prompts fit the shortest that hold. */
/** `post`: the feed post a reply answers, as the panel read it (replyPost). */
export type DraftRequest = { conversation: string; written: string; nodes?: ScreenText[]; fieldTop?: number; post?: string; typed: string; point?: string; guide?: string; never?: string[]; samples?: string[]; dashes?: 'keep' | 'remove'; avoid?: string[]; platform?: Platform };
export type WriterState = 'downloading' | 'writing';
export type WriterEvents = { state?: (state: WriterState) => void; landed?: (text: string, slot: number, label?: string) => void; reset?: () => void; fraction?: (value: number) => void; sent?: () => void | Promise<void>; unsent?: () => void | Promise<void>; started?: () => void; fallback?: () => void; refused?: (line: string) => void; beforeSend?: () => Promise<boolean>; beforeFetch?: () => boolean };
/** `unchanged`: no drafts because the writer gave their text back as it was, so it already reads well. */
export type Choice = { drafts: string[]; reason?: string; unchanged?: boolean; declined?: boolean };
export interface Writer { write(request: DraftRequest, on?: WriterEvents): Promise<Choice> }
export class SendVeto extends Error {}
/** The account's plan limit (a rate limit) was reached: the phone writes instead, with the plan's own line. */
export class PlanLimit extends Error {}
/** The writer account refused this phone's request (its key or workspace was turned away): the message names the writer and what to do. */
export class AccountRefused extends Error {}

/** No writer chosen yet: the panel says to choose first instead of drafting. */
export const needWriter: Writer = { write: async () => { throw new Error(words.needWriterPanel); } };

/** Failed lines worth a Try again button: sending again can work once the network, the account or its switch recovers. */
export const retryLines: Set<string> = new Set([words.gptFailedNoPhone, words.offlineNoPhone, words.gptOffNoPhone, words.claudeFailed, words.claudeOffNoPhone, words.openrouterFailed, words.openrouterOffNoPhone, words.openCodeFailed, words.openCodeOffNoPhone, words.computerFailed, words.computerOffNoPhone, words.computerUnaskedNoPhone, words.tookTooLong]);

/** A writer that never drafts: the panel shows its line instead. */
export const thrower = (line: string): Writer => ({ write: async () => { throw new Error(line); } });

/** Whether a shown line is a cloud plan limit: the person can still pick another writer. */
export const isPlanLimitLine = (line: string | null | undefined): boolean => !!line && line.startsWith(words.claudePlanLimit);
/** Whether a shown line says the person's writer account needs another writer or a reconnect: the panel offers the switch. */
export const isOtherWriterLine = (line: string | null | undefined): boolean => isPlanLimitLine(line) || line === words.openCodeRefused || line === words.openrouterRefused;

/** The plain lines one cloud provider's route says; ChatGPT's stay the exact shipped strings. */
export type CloudWords = { off: string; offNoPhone: string; failedNoPhone: string; fallback: string; needNote: string; switchUnavailable: string; planLimit?: string; refused?: string; unasked?: string; unaskedNoPhone?: string };
export const computerWords: CloudWords = { off: words.computerOff, offNoPhone: words.computerOffNoPhone, failedNoPhone: words.computerFailed, fallback: words.computerFallback, needNote: words.computerNone, switchUnavailable: words.computerUnasked, unasked: words.computerUnasked, unaskedNoPhone: words.computerUnaskedNoPhone };
export const cloudWords = (key: CloudKey | 'computer'): CloudWords => key === 'computer' ? computerWords : key === 'claude'
  ? { off: words.claudeOff, offNoPhone: words.claudeOffNoPhone, failedNoPhone: words.claudeFailed, fallback: words.claudeFallback, needNote: words.claudeNeedNote, switchUnavailable: words.claudeSwitchUnavailable, planLimit: words.claudePlanLimit }
  : key === 'openrouter'
  ? { off: words.openrouterOff, offNoPhone: words.openrouterOffNoPhone, failedNoPhone: words.openrouterFailed, fallback: words.openrouterFallback, needNote: words.openrouterNeedNote, switchUnavailable: words.openrouterSwitchUnavailable, refused: words.openrouterRefused }
  : key === 'opencode'
  ? { off: words.openCodeOff, offNoPhone: words.openCodeOffNoPhone, failedNoPhone: words.openCodeFailed, fallback: words.openCodeFallback, needNote: words.openCodeNeedNote, switchUnavailable: words.openCodeSwitchUnavailable, refused: words.openCodeRefused }
  : { off: CHATGPT_OFF, offNoPhone: words.gptOffNoPhone, failedNoPhone: words.gptFailedNoPhone, fallback: words.fallback, needNote: words.needWriterNote, switchUnavailable: words.switchUnavailable };

/** The one plain line for a failed cloud call on a phone that cannot write instead. */
export function noPhoneLine(error: unknown, lines: CloudWords): string {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof PlanLimit || error instanceof AccountRefused) return message;
  if (error instanceof SendVeto && message === lines.off) return lines.offNoPhone;
  if (error instanceof SendVeto && message === lines.unasked) return lines.unaskedNoPhone ?? lines.failedNoPhone;
  if (classify(message)?.kind === 'network') return words.offlineNoPhone;
  return lines.failedNoPhone;
}

/** Developer diagnostics (logcat `Ownvoice` lines, never on screen) that survive release
 *  minification, which strips console.*. A logging failure never fails the write. */
export function devlog(line: string): void {
  try {
    const native = require('../../modules/ownvoice-native').default;
    native?.logDev?.(line);
  } catch { /* diagnostics must never break the write */ }
}

/** The error and its one wrapped cause as a single developer line: a refusal can bury
 *  the real failure (for example a veto carrying the pre-dispatch error that caused it). */
export const causeOf = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error.cause : undefined;
  const inner = cause == null ? '' : cause instanceof Error ? cause.message : String(cause);
  return inner && inner !== message ? `${message} (caused by: ${inner})` : message;
};

export async function withPhoneFallback(primary: Writer, phone: Writer, request: DraftRequest, lines: CloudWords, on?: WriterEvents, fallbackNote?: () => Promise<string | null>, phoneStatus?: PhoneCanWrite): Promise<Choice> {
  try {
    const { drafts, unchanged, declined } = await primary.write(request, on);
    // A successful refusal is not a transport failure: don't ask another writer to polish it.
    if (declined) return { drafts: [], declined: true };
    if (unchanged && !drafts.length) return { drafts, unchanged };
    // Grow-mode feed replies (a point is set) may fill two or three slots; a repeated, echo or
    // never-say card is dropped and the retry can still leave fewer, and showing them beats throwing
    // the whole answer away. A typed-empty request with no point keeps the legacy fixed-three rule.
    const threeSlots = request.point == null && !request.typed.trim();
    if (!drafts.length || (threeSlots && drafts.length !== 3) || drafts.some(draft => !draft.trim())) throw new Error('empty');
    return { drafts };
  } catch (error) {
    on?.reset?.();
    const limit = error instanceof PlanLimit ? error.message : null;
    if (phoneStatus === 'cant') throw new Error(noPhoneLine(error, lines));
    const message = error instanceof Error ? error.message : String(error);
    const reason = error instanceof SendVeto ? error.message
      : limit ?? (error instanceof AccountRefused ? error.message : classify(message)?.kind === 'network' ? words.offlinePhone
      : (await fallbackNote?.().catch(() => null)) ?? lines.fallback);
    on?.fallback?.();
    try {
      return { ...(await phone.write(request, on)), reason };
    } catch (fallback) {
      // The next writer could not write either: keep the plan-limit line instead of a dead-end error.
      if (limit) throw new Error(limit);
      // The selected cloud writer's failure is the real story, never the phone's own error:
      // showing that error (for example "get this phone ready") masked a real cloud no-answer
      // in testing. Say the cloud failure in plain words with a retry, and keep both causes
      // in the developer log.
      const cause = causeOf(error);
      const phoneCause = fallback instanceof Error ? fallback.message : String(fallback);
      devlog(`Ownvoice cloud write failed: ${cause} (phone fallback: ${phoneCause})`);
      throw new Error(noPhoneLine(error, lines));
    }
  }
}

/** Which writer the panel uses for one screen, and the one plain line it says above the drafts. */
export type WriterRoute = { writer: Writer; note: string | null };

/** The route comes from the chosen source, never from sign-in plus an allow-list. Phone chosen means
 *  never the cloud, even when signed in. A cloud source (ChatGPT, Claude, OpenRouter) means that account unless this
 *  app stays on the phone, nobody is signed in, or it is switched off remotely. The phone writes as the
 *  fallback only when it can; otherwise the panel gets the no-phone line for the failure. `note` is
 *  byokit's own line for resting or a plan that doesn't include this, or the sign-in line when signed
 *  out, and `lines` is the provider's own plain wording. */
export function routeWriters(options: { source: Source; signedIn: boolean; phoneOnlyApp: boolean; enabled: boolean; note?: string | null; phone: PhoneCanWrite; chatgpt: () => Writer; phoneWriter: Writer; fallbackNote?: () => Promise<string | null>; lines: CloudWords }): WriterRoute {
  const { phoneWriter, lines } = options;
  if (options.source === 'phone') return { writer: phoneWriter, note: null };
  if (options.source == null) return { writer: needWriter, note: null };
  // An app kept on this phone never goes to the cloud, even where the phone can't write: say how to change it.
  if (options.phoneOnlyApp) return options.phone === 'cant'
    ? { writer: thrower(words.phoneOnlyCant), note: null }
    : { writer: phoneWriter, note: null };
  if (!options.signedIn) return options.phone === 'cant'
    ? { writer: thrower(options.note ?? lines.needNote), note: null }
    : { writer: phoneWriter, note: null };
  if (!options.enabled) return options.phone === 'cant'
    ? { writer: thrower(lines.offNoPhone), note: null }
    : { writer: phoneWriter, note: lines.off };
  if (options.note) return options.phone === 'cant'
    ? { writer: thrower(options.note), note: null }
    : { writer: phoneWriter, note: options.note };
  return { writer: { write: (request, on) => withPhoneFallback(options.chatgpt(), phoneWriter, request, lines, on, options.fallbackNote, options.phone) }, note: null };
}

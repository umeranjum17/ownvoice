import { classify } from '@byokit/accounts';
import { CHATGPT_OFF } from './switch';
import { words } from './words';
import type { ScreenText } from './drafts';
import type { Platform } from './platforms';
import type { PhoneCanWrite } from './phoneStatus';
import { genericWords } from './accountWords';
import type { CloudKey, Source } from './source';

/** `point`: in grow mode, what they typed; replies start from it while `typed` stays empty. */
/** `never`: their never-say phrases; a reply card still using one is dropped so the slot is asked once more. */
/** `samples`: the same selected replies the fit call judges as "Sounds like you"; the phone prompts fit the shortest that hold. */
/** `post`: the feed post a reply answers, as the panel read it (replyPost). */
export type DraftRequest = { conversation: string; written: string; nodes?: ScreenText[]; fieldTop?: number; post?: string; typed: string; point?: string; guide?: string; never?: string[]; samples?: string[]; dashes?: 'keep' | 'remove'; avoid?: string[]; platform?: Platform };
export type WriterState = 'downloading' | 'writing';
export type WriterEvents = { state?: (state: WriterState) => void; landed?: (text: string, slot: number, label?: string) => void; reset?: () => void; fraction?: (value: number) => void; sent?: () => void | Promise<void>; unsent?: () => void | Promise<void>; started?: () => void; fallback?: () => void; refused?: (line: string) => void; beforeSend?: () => Promise<boolean>; beforeFetch?: () => boolean };
/** `unchanged`: no drafts because the writer gave their text back as it was, so it already reads well. */
/** `ask`: the chosen account could not be reached, so nothing was written; the person picks Try again or this phone writing this once. */
export type Choice = { drafts: string[]; reason?: string; unchanged?: boolean; declined?: boolean; ask?: PhoneAsk };
/** `line` is what they read while they decide; `reason` is what shows above the phone's cards once they pick the phone. */
export type PhoneAsk = { line: string; reason: string };
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

/** Whether the phone may be offered for one write: not when it cannot write, nor when it still needs its one-time download. */
export const offersPhone = (status?: PhoneCanWrite): boolean => status !== 'cant' && status !== 'needsDownload';

/** A writer that writes nothing and hands the person the choice. */
export const asker = (ask: PhoneAsk): Writer => ({ write: async () => ({ drafts: [], ask }) });

/** A writer that never drafts: the panel shows its line instead. */
export const thrower = (line: string): Writer => ({ write: async () => { throw new Error(line); } });

/** The refusal lines of the accounts worded by their name: added as an account's words are made, so a line shown is always in it. */
const refusedLines = new Set<string>();

/** Whether a shown line is a cloud plan limit: the person can still pick another writer. */
export const isPlanLimitLine = (line: string | null | undefined): boolean => !!line && line.startsWith(words.claudePlanLimit);
/** Whether a shown line says the person's writer account needs another writer or a reconnect: the panel offers the switch. */
export const isOtherWriterLine = (line: string | null | undefined): boolean => isPlanLimitLine(line) || line === words.openCodeRefused || refusedLines.has(line ?? '') || line === words.openrouterRefused || line === words.needModelPanel;

/** The plain lines one cloud provider's route says; ChatGPT's stay the exact shipped strings. */
export type CloudWords = { off: string; offNoPhone: string; failedNoPhone: string; fallback: string; needNote: string; switchUnavailable: string; planLimit?: string; refused?: string; unasked?: string; unaskedNoPhone?: string };
export const computerWords: CloudWords = { off: words.computerOff, offNoPhone: words.computerOffNoPhone, failedNoPhone: words.computerFailed, fallback: words.computerFallback, needNote: words.computerNone, switchUnavailable: words.computerUnasked, unasked: words.computerUnasked, unaskedNoPhone: words.computerUnaskedNoPhone };
export const cloudWords = (key: CloudKey | 'computer'): CloudWords => key === 'computer' ? computerWords : genericCloud(key) ?? (key === 'claude'
  ? { off: words.claudeOff, offNoPhone: words.claudeOffNoPhone, failedNoPhone: words.claudeFailed, fallback: words.claudeFallback, needNote: words.claudeNeedNote, switchUnavailable: words.claudeSwitchUnavailable, planLimit: words.claudePlanLimit }
  : key === 'openrouter'
  ? { off: words.openrouterOff, offNoPhone: words.openrouterOffNoPhone, failedNoPhone: words.openrouterFailed, fallback: words.openrouterFallback, needNote: words.openrouterNeedNote, switchUnavailable: words.openrouterSwitchUnavailable, refused: words.openrouterRefused }
  : key === 'opencode'
  ? { off: words.openCodeOff, offNoPhone: words.openCodeOffNoPhone, failedNoPhone: words.openCodeFailed, fallback: words.openCodeFallback, needNote: words.openCodeNeedNote, switchUnavailable: words.openCodeSwitchUnavailable, refused: words.openCodeRefused }
  : { off: CHATGPT_OFF, offNoPhone: words.gptOffNoPhone, failedNoPhone: words.gptFailedNoPhone, fallback: words.fallback, needNote: words.needWriterNote, switchUnavailable: words.switchUnavailable });

/** Any other account the kit lists is worded by its name, the way OpenRouter and OpenCode Go are. */
function genericCloud(key: CloudKey): CloudWords | null {
  const generic = genericWords(key);
  if (generic) { retryLines.add(generic.failed); retryLines.add(generic.offNoPhone); refusedLines.add(generic.refused); }
  return generic && { off: generic.off, offNoPhone: generic.offNoPhone, failedNoPhone: generic.failed, fallback: generic.fallback, needNote: generic.needNote, switchUnavailable: generic.switchUnavailable, refused: generic.refused };
}

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

/** The chosen account failed: the person is asked, and the phone is never used unless they pick it (the panel runs it once).
 *  A phone that cannot be offered gets the plain failure line instead. */
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
    const failure = noPhoneLine(error, lines);
    if (!offersPhone(phoneStatus)) {
      devlog(`Ownvoice cloud write failed: ${causeOf(error)}`);
      throw new Error(failure);
    }
    const message = error instanceof Error ? error.message : String(error);
    const own = error instanceof PlanLimit || error instanceof AccountRefused;
    const account = own || error instanceof SendVeto || classify(message)?.kind === 'network' ? null : await fallbackNote?.().catch(() => null);
    const reason = error instanceof SendVeto ? error.message
      : own ? message : classify(message)?.kind === 'network' ? words.offlinePhone
      : account ?? lines.fallback;
    devlog(`Ownvoice cloud write failed: ${causeOf(error)}`);
    return { drafts: [], ask: { line: own ? message : account ?? failure, reason } };
  }
}

/** Which writer the panel uses for one screen, and the one plain line it says above the drafts. */
export type WriterRoute = { writer: Writer; note: string | null };

/** The route comes from the chosen source, never from sign-in plus an allow-list. Phone chosen means
 *  never the cloud, even when signed in. A cloud source (ChatGPT, Claude, OpenRouter) means that account unless this
 *  app stays on the phone. When that account can't be reached (signed out, switched off, resting, failed) nothing
 *  is written: the writer returns the choice (`ask`) and the phone writes only if the person picks it, once;
 *  a phone that cannot write gets the no-phone line for the failure. `note` is
 *  byokit's own line for resting or a plan that doesn't include this, or the sign-in line when signed
 *  out, and `lines` is the provider's own plain wording. */
export function routeWriters(options: { source: Source; signedIn: boolean; phoneOnlyApp: boolean; enabled: boolean; needsModel?: boolean; note?: string | null; phone: PhoneCanWrite; chatgpt: () => Writer; phoneWriter: Writer; fallbackNote?: () => Promise<string | null>; lines: CloudWords }): WriterRoute {
  const { phoneWriter, lines } = options;
  if (options.source === 'phone') return { writer: phoneWriter, note: null };
  if (options.source == null) return { writer: needWriter, note: null };
  // An app kept on this phone never goes to the cloud, even where the phone can't write: say how to change it.
  if (options.phoneOnlyApp) return options.phone === 'cant'
    ? { writer: thrower(words.phoneOnlyCant), note: null }
    : { writer: phoneWriter, note: null };
  const ask = (line: string, reason = line, none = line): WriterRoute => ({ writer: offersPhone(options.phone) ? asker({ line, reason }) : thrower(none), note: null });
  if (!options.signedIn) return ask(options.note ?? words.signedOutAsk, undefined, options.note ?? lines.needNote);
  if (!options.enabled) return ask(lines.offNoPhone, lines.off);
  if (options.note) return ask(options.note);
  // The account is ready but the person has not picked which one writes: ask, never pick (not even the phone) for them.
  if (options.needsModel) return { writer: thrower(words.needModelPanel), note: null };
  return { writer: { write: (request, on) => withPhoneFallback(options.chatgpt(), phoneWriter, request, lines, on, options.fallbackNote, options.phone) }, note: null };
}

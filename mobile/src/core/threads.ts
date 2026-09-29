// Thread writer and hooks (parity package 5): from text the person typed in a
// feed app, split into a numbered thread within the place's cap, plus 3 opening
// lines for it. Decision B: only from a line they typed, never from nothing,
// with the fact check on. Plain data and prompt text; no new framework.
import { addedNumbers, inventedTimes } from './slop';
import { platformLine, polishLine, type Platform } from './platforms';
import { words } from './words';

export type Thread = { parts: string[]; hooks: string[] };

/** The copy a future panel shows above a thread; kept here so it stays plain. */
export const threadCopy = { title: words.threadTitle, ready: words.threadReady, hooks: words.hooksTitle };

/** Only typed text threads: a blank box has nothing to split and stays refused. */
export const canThread = (text: string): boolean => text.trim().length > 0;

/** The cap worth splitting for: feed places only (X, LinkedIn, Reddit). */
export function threadLimit(platform?: Platform | null): number | null {
  if (!platform || platform.kind !== 'feed' || platform.limit == null) return null;
  return platform.limit;
}

/** Sentences keep their closing mark; bare lines without one stay whole. */
function segments(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    for (const match of line.match(/[^.!?]+[.!?]+["”')\]]?|\S[^.!?]*$/g) ?? []) {
      const sentence = match.trim();
      if (sentence) out.push(sentence);
    }
  }
  return out;
}

/** One over-long sentence wraps at word breaks; a single word past the budget
 *  keeps whole (splitting a link helps nobody). */
function wrap(segment: string, budget: number): string[] {
  const out: string[] = [];
  let current = '';
  for (const word of segment.split(/\s+/)) {
    if (!current) { current = word; continue; }
    if (current.length + 1 + word.length > budget) { out.push(current); current = word; }
    else current += ` ${word}`;
  }
  if (current) out.push(current);
  return out;
}

/** Packs sentences in order so every part fits the budget; never rewords. */
function pack(text: string, budget: number): string[] {
  const out: string[] = [];
  let current = '';
  const push = (part: string) => { if (part.trim()) out.push(part.trim()); };
  for (const segment of segments(text)) {
    for (const piece of segment.length > budget ? wrap(segment, budget) : [segment]) {
      if (!current) { current = piece; continue; }
      if (current.length + 1 + piece.length > budget) { push(current); current = piece; }
      else current += ` ${piece}`;
    }
  }
  push(current);
  return out.length ? out : [text.trim()];
}

/** Splits typed text into numbered parts, each within the cap including its
 *  number (`1/3 ...`). The split is deterministic: the model only picks nicer
 *  breaks, and this is the fallback when its answer fails the fact check. */
export function splitThread(text: string, limit: number): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (pack(clean, limit).length === 1) return [clean];
  let raw = pack(clean, limit - '1/1 '.length);
  for (let round = 0; round < 3; round++) {
    const width = ` ${raw.length}/${raw.length} `.length;
    const next = pack(clean, limit - width);
    if (next.length === raw.length) { raw = next; break; }
    raw = next;
  }
  if (raw.length === 1) return raw;
  return raw.map((part, i) => `${i + 1}/${raw.length} ${part}`);
}

const flat = (text: string) => text.replace(/\s+/g, ' ').trim();
const stripNumber = (part: string) => part.replace(/^\s*\d+\s*\/\s*\d+\s+/, '').trim();

/** One model call for nicer breaks plus 3 opening lines, all in their words. */
export function threadPrompt(text: string, platform?: Platform | null, guide = '', dashes: 'keep' | 'remove' = 'remove'): string {
  const limit = threadLimit(platform) ?? 280;
  const place = [platformLine(platform), polishLine(platform)].filter(Boolean).join('\n');
  return [
    `You split a text someone typed on their phone into numbered posts for ${platform?.label ?? 'their feed'}. The screen is context only: split THEIR text, never write from nothing.`,
    `Split at sentence ends, in order, so every post fits ${limit} on its own. Use only their words: keep every fact, number, name and promise; add none. Never add experience, results, "we" or anything they didn't write.`,
    'Then write 3 opening lines for this thread, each usable as the first post\'s first line. Each must use only words they typed, in their voice and language.',
    'Sound like them typing on a phone: plain words, short sentences, their casing. No flattery openers, no closing question just to invite replies, no hashtags, no lists of three.',
    `Don't add long dashes (—).`,
    `- their dashes: ${dashes}`,
    place,
    guide ? `Their rules and note: ${guide}` : '',
    'Output only JSON: {"parts":["..."],"hooks":["...","...","..."]}',
    `\nTheir text:\n${text}`,
  ].filter(Boolean).join('\n');
}

/** Every word of a hook must come from their text (case-insensitive); numbers count as words. */
function wordsFrom(text: string, vocabulary: Set<string>): boolean {
  const terms = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return terms.length > 0 && terms.every(term => vocabulary.has(term));
}

/** True when the model's answer keeps every part within the cap and every
 *  word, number and time from their text, both ways. Anything else is null and
 *  the caller falls back to the deterministic split. */
export function cleanThread(answer: string, original: string, limit: number): Thread | null {
  const take = (key: string): string[] | null => {
    const list = answer.match(new RegExp(`"${key}"\\s*:\\s*\\[`));
    if (!list || list.index == null) return null;
    let i = list.index + list[0].length;
    const out: string[] = [];
    for (;;) {
      while (i < answer.length && (/\s/.test(answer[i]) || answer[i] === ',')) i++;
      if (i >= answer.length || answer[i] !== '"') return out;
      let value = '';
      i++;
      for (;;) {
        if (i >= answer.length) return out;
        const char = answer[i++];
        if (char === '"') break;
        if (char !== '\\') { value += char; continue; }
        if (i >= answer.length) return out;
        const esc = answer[i++];
        if (esc === 'n') value += '\n';
        else if (esc === 't') value += '\t';
        else if (esc === 'r') value += '\r';
        else if (esc === 'b') value += '\b';
        else if (esc === 'f') value += '\f';
        else if (esc === '"' || esc === '\\' || esc === '/') value += esc;
        else if (esc === 'u') {
          const hex = answer.slice(i, i + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) return out;
          value += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        }
        else return out;
      }
      out.push(value);
    }
  };
  const parts = take('parts');
  const hooks = take('hooks');
  if (!parts?.length || hooks?.length !== 3) return null;
  // The numbers go on here, so the raw posts must leave room for them.
  const width = parts.length === 1 ? 0 : ` ${parts.length}/${parts.length} `.length;
  if (parts.some(part => !part.trim() || part.length > limit - width)) return null;
  const stripped = parts.map(stripNumber);
  // Nothing reworded, dropped or added: the parts rejoin to their text.
  if (flat(stripped.join(' ')) !== flat(original)) return null;
  const joined = stripped.join(' ');
  if (addedNumbers(original, joined).length || addedNumbers(joined, original).length) return null;
  if (inventedTimes(original, joined).length) return null;
  const vocabulary = new Set(flat(original).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  if (hooks.some(hook => !hook.trim() || hook.length > limit || !wordsFrom(hook, vocabulary))) return null;
  if (new Set(hooks.map(hook => flat(hook).toLowerCase())).size !== 3) return null;
  const numbered = stripped.length === 1 ? stripped : stripped.map((part, i) => `${i + 1}/${parts.length} ${part}`);
  return { parts: numbered, hooks: hooks.map(hook => hook.trim()) };
}

const firstSentences = (text: string): string[] => segments(text).slice(0, 3);

/** The offline answer: the deterministic split, with the text's own first
 *  lines as the hooks. Same shape as the model's, always within the cap. */
export function fallbackThread(text: string, limit: number): Thread {
  const clean = text.trim();
  const trunc = (hook: string): string => {
    const h = hook.trim();
    if (h.length <= limit) return h;
    const idx = h.lastIndexOf(' ', limit);
    return (idx > 0 ? h.slice(0, idx) : h.slice(0, limit)).trim() || h.slice(0, limit);
  };
  const flatWords = flat(clean).split(' ').filter(Boolean);
  const cands = [...firstSentences(clean).map(trunc)];
  for (let n = 1; n <= flatWords.length; n++) cands.push(trunc(flatWords.slice(0, n).join(' ')));
  const uniq = [...new Set(cands.map(hook => hook.trim()))].filter(Boolean);
  for (let guard = 0; uniq.length < 3 && uniq.length > 0 && guard < 5; guard++) {
    const base = uniq[0];
    const k = uniq.length;
    const cand = trunc(base.length + k <= limit ? `${base}${'.'.repeat(k)}` : `${base.slice(0, Math.max(1, limit - k))}${'.'.repeat(k)}`);
    if (cand && cand.length <= limit && !uniq.includes(cand)) uniq.push(cand);
    else {
      const shorter = trunc(base.slice(0, Math.max(1, base.length - k)));
      if (shorter && shorter.length <= limit && !uniq.includes(shorter)) uniq.push(shorter);
      else break;
    }
  }
  return { parts: splitThread(text, limit), hooks: uniq.slice(0, 3) };
}

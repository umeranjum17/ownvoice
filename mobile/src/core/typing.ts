import type NSpell from 'nspell';
import * as Slop from './slop.ts';
import { protectedTokens } from './drafts.ts';

// The typing check (off unless the person switches it on): spelling from a dictionary on the phone,
// a short list of common slips, and the stock-phrase rules. Nothing here is sent or kept.
export type Slip = Slop.Hit & { fix?: string };
export type Speller = Pick<NSpell, 'correct' | 'suggest'>;

export const SPELLING = 'spelling';
export const GRAMMAR = 'a common slip';

// Chat shorthand people mean on purpose.
const SHORTHAND = new Set(['ok', 'okay', 'lol', 'lmao', 'omg', 'btw', 'tbh', 'imo', 'imho', 'idk', 'lmk', 'brb', 'np', 'ty', 'thx', 'pls', 'plz', 'haha', 'hahaha', 'hehe', 'yeah', 'yep', 'nope', 'hmm', 'ugh', 'wow', 'yay', 'xoxo', 'fyi', 'asap', 'tmrw', 'gonna', 'wanna', 'gotta', 'kinda', 'sorta', 'ya', 'yo', 'bro', 'emoji', 'emojis']);
// Contractions typed without the apostrophe: the dictionary only offers look-alike words for these.
const APOSTROPHE: Record<string, string> = Object.assign(Object.create(null), {
  dont: "don't", doesnt: "doesn't", didnt: "didn't", isnt: "isn't", arent: "aren't", wasnt: "wasn't", werent: "weren't",
  havent: "haven't", hasnt: "hasn't", hadnt: "hadn't", couldnt: "couldn't", wouldnt: "wouldn't", shouldnt: "shouldn't",
  im: "I'm", ive: "I've", youre: "you're", theyre: "they're", youve: "you've", theyve: "they've", thats: "that's", whats: "what's", theres: "there's", wouldve: "would've", couldve: "could've", shouldve: "should've",
});
// Very common words win ties between equally close suggestions ("shoud" is "should", not "shod").
const COMMON = new Set('the be to of and a in that have it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us is was are been has had were said did should really thanks thank please sorry tomorrow today tonight meeting maybe probably friend friends weekend definitely receive believe different'.split(' '));

const WORD = /[\p{L}][\p{L}'’]*/gu;
const unprotected = (text: string) => text.replace(protectedTokens, m => '\0'.repeat(m.length));
const DOUBLE_WORDS = new Set('the a an'.split(' '));
const letters = (w: string) => w.replace(/’/g, "'").replace(/'+$/, '');

/** Damerau distance, capped: close typos only. */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const cost = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}

const keepCase = (from: string, to: string) => (/^\p{Lu}/u.test(from) ? to[0].toUpperCase() + to.slice(1) : to);

function candidates(word: string, speller: Speller) {
  const plain = letters(word).toLowerCase();
  return [...new Set(speller.suggest(letters(word)))].map((s, i) => ({ s, i, d: distance(plain, s.toLowerCase()) }))
    .filter(c => c.d <= 2)
    .sort((x, y) => x.d - y.d || Number(COMMON.has(y.s.toLowerCase())) - Number(COMMON.has(x.s.toLowerCase())) || x.i - y.i);
}

export function suggestion(word: string, speller: Speller): string | undefined {
  const plain = letters(word).toLowerCase();
  if (APOSTROPHE[plain]) return keepCase(word, APOSTROPHE[plain]);
  return candidates(word, speller)[0]?.s;
}

/** Words the dictionary doesn't know. Capitalised words are left alone: they are mostly names. */
function spelling(text: string, speller: Speller): Slip[] {
  const out: Slip[] = [];
  // Links, addresses, handles and tags are blanked out first, keeping every other word where it is.
  const words = unprotected(text);
  for (const m of words.matchAll(WORD)) {
    const word = letters(m[0]);
    // ponytail: capitalised words are skipped, so "Recieve" at a sentence start goes unmarked; a name list would fix that.
    if (/\p{Lu}/u.test(word) || word.length < 2 || SHORTHAND.has(word) || /^i'(?:m|ve|ll|d)$/.test(word)) continue;
    if (!APOSTROPHE[word] && speller.correct(word)) continue;
    out.push({ start: m.index!, end: m.index! + word.length, reason: SPELLING, fix: APOSTROPHE[word] });
  }
  return out;
}

const VERBISH = "a|an|the|not|been|going|gonna|so|ok|okay|fine|just|really|very|too|time|all|about|like|getting|still|also|always|never|only|hard|easy|great|good|late|over|true|done|my|your|our|their|what|how";
const LETS = 'go|do|get|see|meet|talk|try|make|have|be|grab|catch|start|keep|call|chat|say|play|eat|move|plan|find|hope|wait|leave|head|check|think|not|just';
const THAN = 'more|less|better|worse|rather|other|fewer|bigger|smaller|faster|slower|higher|lower|older|younger|easier|harder|longer|shorter|greater|larger|cheaper|nicer|sooner|further|farther|cooler|stronger|weaker';
const A_AN_SOUND = /^(?:uni|use|usu|uti|ure|uro|eu|ewe|one|once|ufo)/i;
const AN_SILENT_H = /^(?:hour|honest|hono(?:u)?r|heir)/i;
const SKIP_DOUBLE = /^(?:that|had|is|do|bye|no|so|very|ha|haha|really|yeah|yes|well|tsk)$/i;

// Each rule marks group 1; group 2, when there, is the next word (read, never marked).
type Rule = { re: RegExp; fix: (word: string, next: string) => string | null };
const RULES: Rule[] = [
  { re: new RegExp(`\\b(its)(?= (${VERBISH})\\b)`, 'gi'), fix: w => keepCase(w, "it's") },
  { re: /\b(it['’]s)(?= (own)\b)/gi, fix: w => keepCase(w, 'its') },
  // "lets go" at the start of a sentence or after "so", "ok", "and": "she lets go" stays.
  { re: new RegExp(`(?:^|[.!?]\\s+|,\\s+|\\b(?:so|ok|okay|and|but|then|now|yes|yeah|sure),?\\s+)(lets)(?= (${LETS})\\b)`, 'gim'), fix: w => keepCase(w, "let's") },
  // Only before a lowercase word: "an MBA" and "a UFO" go by their sound, not their first letter.
  { re: /\b([Aa])(?= ([aeiou]\p{Ll}*)\b)/gu, fix: (w, next) => (A_AN_SOUND.test(next) ? null : keepCase(w, 'an')) },
  { re: /\b([Aa]n)(?= ([b-df-hj-np-tv-z]\p{Ll}*)\b)/gu, fix: (w, next) => (AN_SILENT_H.test(next) ? null : keepCase(w, 'a')) },
  { re: new RegExp(`\\b(?:${THAN}) (then)\\b`, 'gi'), fix: w => keepCase(w, 'than') },
];
// A full stop that ends an abbreviation, an initial, a number or "...", not a sentence.
const NOT_AN_END = /(?:\b(?:e\.g|i\.e|etc|vs|mr|mrs|ms|dr|st|approx)|\b\p{L}|\d|\.\.)[.]\s+$/iu;

/** Common slips a dictionary can't see. Lowercase i and a missing capital are only called out when the text uses capitals elsewhere. */
function grammar(text: string): Slip[] {
  const out: Slip[] = [];
  const add = (start: number, word: string, fix: string, end = start + word.length) => out.push({ start, end, reason: GRAMMAR, fix });
  for (const rule of RULES) for (const m of text.matchAll(rule.re)) {
    const fix = rule.fix(m[1], m[2] ?? '');
    if (fix) add(m.index! + m[0].length - m[1].length, m[1], fix);
  }
  // The second of two same words goes, with the space before it.
  for (const m of text.matchAll(/\b(\p{L}+)\s+\1\b/giu)) if (!SKIP_DOUBLE.test(m[1])) add(m.index! + m[1].length, '', '', m.index! + m[0].length);
  if (!/\p{Lu}/u.test(text.replace(/\bI\b/g, ''))) return out;
  for (const m of text.matchAll(/(?<![\p{L}\d'’])i(?=(?:['’](?:m|ve|ll|d))?(?![\p{L}\d'’]|\.\p{L}))/gu)) add(m.index!, 'i', 'I');
  for (const m of text.matchAll(/(?:^|[.!?]\s+)(\p{Ll}[\p{L}'’]*)/gu)) {
    const at = m.index! + m[0].length - m[1].length;
    if (/\p{Lu}|^i$/u.test(m[1]) || NOT_AN_END.test(text.slice(0, at))) continue;
    add(at, m[1][0], m[1][0].toUpperCase());
  }
  return out;
}

/** Every slip in [text], sorted, one per spot. Known spelling fixes are immediate; dictionary suggestions wait for a tap because they can be slow. */
export function slips(text: string, speller: Speller | null): Slip[] {
  const spell = speller ? spelling(text, speller) : [];
  // Known slips remain detectable when the dictionary is not loaded.
  for (const m of unprotected(text).matchAll(WORD)) {
    const fix = AUTO_SPELLING.get(m[0].toLowerCase());
    if (fix) spell.push({start:m.index!,end:m.index!+m[0].length,reason:SPELLING,fix:keepCase(m[0],fix)});
  }
  const gram = grammar(text);
  const sentenceStart = new Set(gram.filter(g => (g.fix ?? '').length === 1 && /^\p{Lu}$/u.test(g.fix!)).map(g => g.start));
  for (const s of spell) if (s.fix && sentenceStart.has(s.start)) s.fix = s.fix[0].toUpperCase() + s.fix.slice(1);
  const found = [...spell, ...gram];
  const seen = new Set<number>();
  return found.sort((a, b) => a.start - b.start).filter(s => !seen.has(s.start) && !!seen.add(s.start));
}

/** What the bubble's count shows after a typing pause: slips plus the stock phrases and never-say rules. */
export function count(text: string, speller: Speller | null, voice: Slop.Rules): number {
  return slips(text, speller).length + Slop.hits(text, voice).length;
}

/** [text] with one slip fixed. A doubled word's fix is empty: the second copy goes, with the space before it. */
export function fixed(text: string, slip: Slip): string {
  if (slip.fix === undefined) return text;
  return text.slice(0, slip.start) + slip.fix + text.slice(slip.end);
}

const AMBIGUOUS_APOSTROPHE = new Set('cant wont lets were well hell shed wed ill id its'.split(' '));
const AUTO_SPELLING = new Map([['shoud', 'should'], ['teh', 'the'], ['recieve', 'receive']]);

/** Capitalise an ordinary word only at a sentence boundary the rewrite introduced. */
export function fixedSentenceSplits(original: string, text: string, spell: Speller | null): string {
  const protectedSpans = [...text.matchAll(protectedTokens), ...text.matchAll(/`+[\s\S]*?`+/g)].map(m => [m.index!, m.index! + m[0].length]);
  const codeWords = new Set([...original.matchAll(/`+([\s\S]*?)`+/g)].flatMap(m => m[1].match(/[\p{L}\p{N}_-]+/gu) ?? []));
  return text.replace(/([.!?])([ \t]+)(\p{Ll}[\p{L}\p{N}_-]*)(?![\p{L}\p{N}_])/gu, (match, stop: string, gap: string, word: string, at: number) => {
    const start = at + stop.length + gap.length;
    const prefix = text.slice(0, start).replace(/['’]/g, '');
    if ((NOT_AN_END.test(prefix) && !/\d[.!?][ \t]+$/.test(prefix)) || protectedSpans.some(([a, b]) => start >= a && start < b)) return match;
    // Skip identifier syntax, source code words and unknown words; reuse the common-word list offline.
    if (!/^\p{Ll}+$/u.test(word) || /^(?:[ \t]*[(:=]|\.\p{L})/u.test(text.slice(start + word.length)) || codeWords.has(word)) return match;
    if (!(spell?.correct(word) || COMMON.has(word))) return match;
    const previous = text.slice(0, at).match(/[\p{L}\p{N}_-]+$/u)?.[0] ?? '';
    if (new RegExp(`(?<![\\p{L}\\p{N}_-])${previous}[.!?]\\s+${word}(?![\\p{L}\\p{N}_-])`, 'iu').test(original)) return match;
    return stop + gap + word[0].toUpperCase() + word.slice(1);
  });
}

export function fixedSlips(text: string, spell: Speller | null): string {
  const corrections: Slip[] = [];
  if (spell) for (const slip of spelling(text, spell)) {
    const word = text.slice(slip.start, slip.end);
    if (AMBIGUOUS_APOSTROPHE.has(word)) continue;
    if (APOSTROPHE[word]) {
      corrections.push({ ...slip, fix: APOSTROPHE[word] });
      continue;
    }
    if (spell.correct(word)) continue;
    const fix = AUTO_SPELLING.get(word);
    if (!fix || /\p{Lu}/u.test(fix)) continue;
    corrections.push({ ...slip, fix });
  }
  let result = text;
  for (const slip of corrections.sort((a, b) => b.start - a.start)) result = fixed(result, slip);
  const deletions: Slip[] = [];
  for (const m of unprotected(result).matchAll(/(?<![\p{L}\p{M}\p{N}_'’])([a-z]+)(?:[ \t]+\1(?![\p{L}\p{M}\p{N}_'’]))+/giu)) {
    if (DOUBLE_WORDS.has(m[1])) deletions.push({ start: m.index! + m[1].length, end: m.index! + m[0].length, reason: GRAMMAR, fix: '' });
  }
  for (const slip of deletions.reverse()) result = fixed(result, slip);
  const articles = [...unprotected(result).matchAll(/(?<![\p{L}\p{M}\p{N}_'’])([Ii]ts)(?= (?:a|an|the)(?![\p{L}\p{M}\p{N}_'’]))/gu)];
  for (const m of articles.reverse()) result = fixed(result, { start: m.index!, end: m.index! + m[1].length, reason: GRAMMAR, fix: keepCase(m[1], "it's") });
  return result;
}

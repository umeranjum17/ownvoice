import { avoidLine, itemVerbsKept, rebuildLines, undash, versionAcceptor } from './drafts.ts';
import { lineRetryPrompt, rewrite, versionsList } from './judge.ts';
import { fixedSentenceSplits, fixedSlips, type Speller } from './typing.ts';
import { speller } from './speller.ts';
import { words } from './words.ts';

/** A message needs words: a face or punctuation marks alone carry nothing to rewrite, so no writer is asked. */
const hasWords = (text: string) => /[\p{L}\p{N}]/u.test(text);

/** Check the original, not a fluent rewrite: reordering nonsense cannot supply a missing point.
 *  One short question with a few examples: keyboard mash and grammatical nonsense are both unclear,
 *  while a short everyday reply or a new post's one-line topic is clear (the small on-phone writer
 *  once declined both). */
export async function canPolish(text: string, ask: (prompt: string) => Promise<string>): Promise<boolean> {
  if (!hasWords(text)) return false;
  const answer = await ask(`Does the text below say something a person clearly means, that a reader could understand and answer? Random letters, keyboard mash, and words that make no sense together are UNCLEAR. A short everyday reply or a line about what a post should say is CLEAR. Answer only CLEAR or UNCLEAR.\n\nasdf qwer zxcv -> UNCLEAR\nthe chair sang my homework into green soup soup -> UNCLEAR\nsee you at 6 -> CLEAR\nour app launches next week -> CLEAR\ngot it, thanks -> CLEAR\nwill do -> CLEAR\n\nText, between the lines:\n---\n${text}\n---\nAnswer CLEAR or UNCLEAR for that text only.`);
  // A small model wraps the verdict in markup or explains after it ('CLEAR: it makes sense'):
  // the leading word decides, unless the answer echoes both verdicts back.
  const verdict = answer.replace(/[*_`"']/g, '').trim().toUpperCase();
  const echo = /\bCLEAR\s+OR\s+UNCLEAR\b|\bUNCLEAR\s+OR\s+CLEAR\b/.test(verdict);
  const lead = verdict.match(/^[A-Z]+/)?.[0];
  if (!echo && lead === 'CLEAR') return true;
  if (!echo && lead === 'UNCLEAR') return false;
  // Unreadable evidence is a transient failure, not proof that the text has no point.
  throw new Error(words.noVersions);
}

/** Keyboard mash: under half of its words are in the English dictionary. Without a dictionary, text counts as real.
 *  The dictionary is only the fast path: it misses every other language, so a miss below goes to the writer
 *  for a second opinion instead of declining. */
const isMash = (text: string, dictionary: Speller | null) => {
  const found = text.match(/\p{L}+/gu) ?? [];
  return !!dictionary && found.filter(w => dictionary.correct(w) || dictionary.correct(w.toLowerCase())).length * 2 < found.length;
};

/** Model-side mash check, asked only after the dictionary misses: random keystrokes are MASH in any
 *  language, while real words in any language the writer cannot translate are still WORDS. An unreadable
 *  answer fails open, so real text never dead-ends on a weak model. */
const isKeyboardMash = async (text: string, ask: (prompt: string, maxTokens: number) => Promise<string>) => {
  const answer = await ask(`Is the text below random keyboard mash with no real words, or real words in any language? Random letters with no meaning are MASH. Real words in any language, even words you cannot translate, are WORDS. Answer only MASH or WORDS.\n\nasdf qwer zxcv -> MASH\nqwerty asdf zxcvb -> MASH\nma\u00f1ana hablamos -> WORDS\nsee you at 6 -> WORDS\n\nText, between the lines:\n---\n${text}\n---\nAnswer MASH or WORDS for that text only.`, 8);
  const verdict = answer.replace(/[*_`"']/g, '').trim().toUpperCase();
  return verdict.match(/^[A-Z]+/)?.[0] === 'MASH';
};

export async function polishAcceptor(original: string, dashes: 'keep' | 'remove', avoid: string[], spell?: Speller | null) {
  const dictionary = spell === undefined ? await speller().catch(() => null) : spell;
  const acceptor = versionAcceptor(original, dashes, avoid);
  const corrected = fixedSlips(original, dictionary);
  const localText = dashes === 'remove' ? undash(corrected) : corrected;
  const local = localText === original ? null : acceptor.accept(localText, 0, versionsList[0].label);
  const countWords = (text: string) => text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  const originalWords = countWords(original);
  // Lists only (ordinary single-line text is out of scope): the Shorter card must cut words,
  // so a casing-only or same-length version is not accepted. An exact echo still delegates,
  // keeping the unchanged evidence the panel reports as their own text.
  const isList = original.includes('\n');
  const flatLines = (value: string) => value.replace(/\r\n/g, '\n').split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim()).join('\n').trim();
  const shorterKept = (text: string) => countWords(text) < originalWords;
  /** A rejected card still gets the existing one-row retry: queue it when nothing usable landed. */
  const queueRetry = (slot: number, label?: string) => {
    if (!acceptor.results.some(r => r.slot === slot) && !acceptor.layoutFails.some(f => f.slot === slot)) acceptor.layoutFails.push({ slot, label });
  };
  /** Main point first may reorder list items but must keep each item's own verbs: a reorder
   *  that changes verbs is not shown; the existing row retry falls back to the polished
   *  same-order version instead of dropping the card. */
  const verbsKept = (text: string) => itemVerbsKept(original, text);
  return {
    local,
    mash: isMash(original, dictionary),
    results: acceptor.results,
    layoutFails: acceptor.layoutFails,
    get unchanged() { return acceptor.unchanged; },
    accept(text: string, slot: number, label?: string) {
      if (slot === 0) return null;
      const fixed = fixedSentenceSplits(original, text, dictionary);
      if (slot === 1 && isList && flatLines(fixed) !== flatLines(original) && !shorterKept(fixed)) { queueRetry(slot, label); return null; }
      if (slot === 2 && isList && flatLines(fixed) !== flatLines(original) && !verbsKept(fixed)) { queueRetry(slot, label); return null; }
      return acceptor.accept(fixed, slot, label);
    },
    fix(text: string, slot: number, label?: string) {
      if (slot === 0) return null;
      const fixed = fixedSentenceSplits(original, text, dictionary);
      if (slot === 1 && isList && flatLines(fixed) !== flatLines(original) && !shorterKept(fixed)) return null;
      // No verb gate on the fallback: the row rescue is same-order by construction, and a card
      // must never be traded for no card. The reorder attempt above already refused verb changes.
      return acceptor.fix(fixed, slot, label);
    },
  };
}

export type PolishRequest = {
  typed: string;
  conversation: string;
  guide: string;
  dashes: 'keep' | 'remove';
  platform?: Parameters<typeof rewrite>[6];
  avoid: string[];
  /** The point check's verdict (canPolish). Advisory on the phone: only UNCLEAR keyboard mash with no usable version is declined. */
  clear: boolean | Promise<boolean> | (() => Promise<boolean>);
  /** Ask each version in its own short call, skipping the one combined call: the phone's model answers the combined call without a usable list. */
  slotsFirst?: boolean;
};
export type PolishOutcome = { drafts: string[]; unchanged?: boolean; declined?: boolean };

const ALTERNATIVE_WORDING = 'Give a genuinely different wording even when their text already reads well; do not copy it back. For a list, shorten or rephrase within the existing rows: keep the intro and every item. The Shorter version keeps their order; the Main point first version may reorder the items to put the main point first but keeps each item\'s own words. If the main point is already first, rephrase in place instead of moving or merging rows. A row may stay as it is, but the complete version must use different words.';
const DIFFERENT_WORDS = 'Their text came back unchanged: write each version in different words, keeping the same point.';
/** The Main point first row retry is the polished same-order fallback: copy each row's words
 *  instead of asking for different words, which drops days and rewords verbs on a weak model. */
const KEEP_ROWS_WORDS = 'Copy each row word-for-word in its original order. Do not reword, add or drop any word, day or time; you may only change the first letter\'s casing.';

/** The phone's polish (the eval supplies the same endpoint and bundled dictionary): the point check is advisory, so an UNCLEAR answer still gets the versions. With no usable
 *  version, only UNCLEAR keyboard mash the writer confirms as mash is declined with the unclear message; real text is never declined, so it
 *  ends as their own text when the writer handed it back, else "Couldn't polish that this time. Try again."
 *  Versions that come back as their own text get one more pass asking for different words. */
export async function polishVersions(
  ask: (prompt: string, maxTokens: number) => Promise<string>,
  request: PolishRequest,
  landed: (text: string, slot: number, label?: string) => void,
  spell?: Speller | null,
): Promise<PolishOutcome> {
  if (!hasWords(request.typed)) return { drafts: [], declined: true };
  const acceptor = await polishAcceptor(request.typed, request.dashes, request.avoid, spell);
  if (acceptor.local != null) landed(acceptor.local, 0, versionsList[0].label);
  const note = avoidLine(request.avoid);
  const askWith = (extra: string) => (prompt: string, maxTokens: number) => ask(prompt + [note, ALTERNATIVE_WORDING, extra].filter(Boolean).map(line => `\n\n${line}`).join(''), maxTokens);
  const writeAll = (extra: string) => rewrite({ ask: askWith(extra) }, request.typed, '', request.guide, (version, text) => {
    const slot = versionsList.findIndex(v => v.name === version.name);
    const clean = acceptor.accept(text, slot, version.label);
    if (clean != null) landed(clean, slot, version.label);
  }, request.dashes, request.platform, request.slotsFirst);
  await writeAll('');
  if (acceptor.unchanged) await writeAll(DIFFERENT_WORDS);
  // Retry each missing writer slot, including an echo when its sibling already landed.
  // Rebuilding row by row keeps the intro, items and original markers together.
  const list = request.typed.includes('\n');
  for (const [slot, version] of versionsList.entries()) {
    if (slot === 0 || acceptor.results.some(r => r.slot === slot)) continue;
    const prompt = lineRetryPrompt(request.typed, '', version, request.guide, request.dashes, request.platform);
    // The Main point first retry is the same-order fallback, so it keeps each row's words
    // rather than asking for different words (which drops days and times on a weak model).
    const extra = list && version.name === 'FIRST' ? KEEP_ROWS_WORDS : DIFFERENT_WORDS;
    let rebuilt: string | null;
    try {
      rebuilt = rebuildLines(request.typed, await askWith(extra)(prompt, 256));
    } catch { continue; }
    if (rebuilt == null) continue;
    const fixed = acceptor.fix(rebuilt, slot, version.label);
    if (fixed != null) landed(fixed, slot, version.label);
  }
  const drafts = acceptor.results.sort((a, b) => a.slot - b.slot).map(r => r.text);
  if (!drafts.length && !(await (typeof request.clear === 'function' ? request.clear() : request.clear)) && await isKeyboardMash(request.typed, ask).catch(() => false)) return { drafts: [], declined: true };
  return { drafts, unchanged: acceptor.unchanged };
}

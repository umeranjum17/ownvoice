import { avoidLine, listMarkers, rebuildLines, undash, versionAcceptor } from './drafts.ts';
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

/** Keyboard mash: under half of its words are in the dictionary. Without a dictionary, text counts as real.
 *  ponytail: English dictionary only, so UNCLEAR non-English text still reads as mash; a per-language list fixes it. */
const isMash = (text: string, dictionary: Speller | null) => {
  const found = text.match(/\p{L}+/gu) ?? [];
  return !!dictionary && found.filter(w => dictionary.correct(w) || dictionary.correct(w.toLowerCase())).length * 2 < found.length;
};

export async function polishAcceptor(original: string, dashes: 'keep' | 'remove', avoid: string[], spell?: Speller | null) {
  const dictionary = spell === undefined ? await speller().catch(() => null) : spell;
  const acceptor = versionAcceptor(original, dashes, avoid);
  const corrected = fixedSlips(original, dictionary);
  const localText = dashes === 'remove' ? undash(corrected) : corrected;
  const local = localText === original ? null : acceptor.accept(localText, 0, versionsList[0].label);
  return {
    local,
    mash: isMash(original, dictionary),
    results: acceptor.results,
    layoutFails: acceptor.layoutFails,
    get unchanged() { return acceptor.unchanged; },
    accept(text: string, slot: number, label?: string) { return slot === 0 ? null : acceptor.accept(fixedSentenceSplits(original, text, dictionary), slot, label); },
    fix(text: string, slot: number, label?: string) { return slot === 0 ? null : acceptor.fix(fixedSentenceSplits(original, text, dictionary), slot, label); },
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
  clear: boolean;
};
export type PolishOutcome = { drafts: string[]; unchanged?: boolean; declined?: boolean };

const DIFFERENT_WORDS = 'Their text came back unchanged: write each version in different words, keeping the same point.';

/** The phone's polish: the point check is advisory, so an UNCLEAR answer still gets the versions. With no usable
 *  version, only UNCLEAR keyboard mash is declined with the unclear message; real text is never declined, so it
 *  ends as their own text when the writer handed it back, else "Couldn't polish that this time. Try again."
 *  Versions that come back as their own text get one more pass asking for different words. List text is written
 *  row by row from the start: the small writer flattens or echoes a whole list. */
export async function polishVersions(
  ask: (prompt: string, maxTokens: number) => Promise<string>,
  request: PolishRequest,
  landed: (text: string, slot: number, label?: string) => void,
): Promise<PolishOutcome> {
  if (!hasWords(request.typed)) return { drafts: [], declined: true };
  const acceptor = await polishAcceptor(request.typed, request.dashes, request.avoid);
  if (acceptor.local != null) landed(acceptor.local, 0, versionsList[0].label);
  const note = avoidLine(request.avoid);
  const askWith = (extra: string) => (prompt: string, maxTokens: number) => ask(prompt + [note, extra].filter(Boolean).map(line => `\n\n${line}`).join(''), maxTokens);
  const writeAll = (extra: string) => rewrite({ ask: askWith(extra) }, request.typed, request.conversation, request.guide, (version, text) => {
    const slot = versionsList.findIndex(v => v.name === version.name);
    const clean = acceptor.accept(text, slot, version.label);
    if (clean != null) landed(clean, slot, version.label);
  }, request.dashes, request.platform);
  // Row by row: the rebuild keeps the original markers, so the layout is kept by construction -
  // only a missing row or a changed number/time drops it. True when the version landed.
  const writeRows = async (slot: number, extra: string) => {
    const prompt = lineRetryPrompt(request.typed, request.conversation, versionsList[slot], request.guide, request.dashes, request.platform);
    let rebuilt: string | null;
    try {
      rebuilt = rebuildLines(request.typed, await askWith(extra)(prompt, 256));
    } catch { return false; }
    const fixed = rebuilt == null ? null : acceptor.fix(rebuilt, slot, versionsList[slot].label);
    if (fixed != null) landed(fixed, slot, versionsList[slot].label);
    return fixed != null;
  };
  if (listMarkers(request.typed).length) {
    for (let slot = 1; slot < versionsList.length; slot++) {
      if (!await writeRows(slot, '')) await writeRows(slot, DIFFERENT_WORDS);
    }
  } else {
    await writeAll('');
    if (acceptor.unchanged) await writeAll(DIFFERENT_WORDS);
    // A flattened layout goes back row by row once per slot.
    const retried = new Set<number>();
    for (const fail of acceptor.layoutFails) {
      if (retried.has(fail.slot) || acceptor.results.some(r => r.slot === fail.slot)) continue;
      retried.add(fail.slot);
      await writeRows(fail.slot, '');
    }
  }
  const drafts = acceptor.results.sort((a, b) => a.slot - b.slot).map(r => r.text);
  if (!drafts.length && !request.clear && acceptor.mash) return { drafts: [], declined: true };
  return { drafts, unchanged: acceptor.unchanged };
}

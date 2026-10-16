import { undash, versionAcceptor } from './drafts.ts';
import { versionsList } from 'ownvoice-engine/src/judge.ts';
import { fixedSentenceSplits, fixedSlips, type Speller } from './typing.ts';
import { speller } from './speller.ts';
import { words } from './words.ts';

/** A message needs words: a face or punctuation marks alone carry nothing to rewrite, so no writer is asked. */
const hasWords = (text: string) => /[\p{L}\p{N}]/u.test(text);

/** Check the original, not a fluent rewrite: reordering nonsense cannot supply a missing point.
 *  One short question with a few examples: keyboard mash and grammatical nonsense are both unclear,
 *  while a short everyday reply is clear (the small on-phone writer once declined those). */
export async function canPolish(text: string, ask: (prompt: string) => Promise<string>): Promise<boolean> {
  if (!hasWords(text)) return false;
  const answer = await ask(`Does the text below say something a person clearly means, that a reader could understand and answer? Random letters, keyboard mash, and words that make no sense together are UNCLEAR. A short everyday reply is CLEAR. Answer only CLEAR or UNCLEAR.\n\nasdf qwer zxcv -> UNCLEAR\nthe chair sang my homework into green soup soup -> UNCLEAR\nsee you at 6 -> CLEAR\ngot it, thanks -> CLEAR\nwill do -> CLEAR\n\nText:\n${text}`);
  if (/^CLEAR[.]?$/i.test(answer.trim())) return true;
  if (/^UNCLEAR[.]?$/i.test(answer.trim())) return false;
  // Unreadable evidence is a transient failure, not proof that the text has no point.
  throw new Error(words.noVersions);
}

export async function polishAcceptor(original: string, dashes: 'keep' | 'remove', avoid: string[], spell?: Speller | null) {
  const dictionary = spell === undefined ? await speller().catch(() => null) : spell;
  const acceptor = versionAcceptor(original, dashes, avoid);
  const corrected = fixedSlips(original, dictionary);
  const localText = dashes === 'remove' ? undash(corrected) : corrected;
  const local = localText === original ? null : acceptor.accept(localText, 0, versionsList[0].label);
  return {
    local,
    results: acceptor.results,
    layoutFails: acceptor.layoutFails,
    get unchanged() { return acceptor.unchanged; },
    accept(text: string, slot: number, label?: string) { return slot === 0 ? null : acceptor.accept(fixedSentenceSplits(original, text, dictionary), slot, label); },
    fix(text: string, slot: number, label?: string) { return slot === 0 ? null : acceptor.fix(fixedSentenceSplits(original, text, dictionary), slot, label); },
  };
}

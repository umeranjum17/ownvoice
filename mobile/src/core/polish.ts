import { undash, versionAcceptor } from './drafts.ts';
import { versionsList } from 'ownvoice-engine/src/judge.ts';
import { fixedSentenceSplits, fixedSlips, type Speller } from './typing.ts';
import { speller } from './speller.ts';
import { words } from './words.ts';

/** A message needs words: a face or punctuation marks alone carry nothing to rewrite, so no writer is asked. */
const hasWords = (text: string) => /[\p{L}\p{N}]/u.test(text);

/** Check the original, not a fluent rewrite: reordering nonsense cannot supply a missing point.
 *  The small on-phone writer reads a narrow question ("real message or keyboard mash?") with a few
 *  examples better than the old paraphrase judgment, which it answered UNCLEAR for short replies. */
export async function canPolish(text: string, ask: (prompt: string) => Promise<string>): Promise<boolean> {
  if (!hasWords(text)) return false;
  const answer = await ask(`Is the text below a real message someone could send, or is it random letters or keyboard mash? A short everyday reply is a real message. Answer only CLEAR or UNCLEAR.\n\nasdf qwer zxcv -> UNCLEAR\nsee you at 6 -> CLEAR\ngot it, thanks -> CLEAR\nwill do -> CLEAR\n\nText:\n${text}`);
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

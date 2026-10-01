import { undash, versionAcceptor } from './drafts.ts';
import { versionsList } from './judge.ts';
import { fixedSlips, type Speller } from './typing.ts';
import { speller } from './speller.ts';

export async function polishAcceptor(original: string, dashes: 'keep' | 'remove', avoid: string[], spell?: Speller | null) {
  const dictionary = spell === undefined ? await speller().catch(() => null) : spell;
  let acceptor = versionAcceptor(original, dashes, avoid);
  const corrected = fixedSlips(original, dictionary);
  const localText = dashes === 'remove' ? undash(corrected) : corrected;
  const local = localText === original ? null : acceptor.accept(localText, 0, versionsList[0].label);
  return {
    local,
    get results() { return acceptor.results; },
    get layoutFails() { return acceptor.layoutFails; },
    rejectLocal() { acceptor = versionAcceptor(original, dashes, avoid); },
    get unchanged() { return acceptor.unchanged; },
    accept(text: string, slot: number, label?: string) { return slot === 0 ? null : acceptor.accept(text, slot, label); },
    fix(text: string, slot: number, label?: string) { return slot === 0 ? null : acceptor.fix(text, slot, label); },
  };
}

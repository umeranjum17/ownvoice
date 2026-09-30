import { versionAcceptor } from './drafts.ts';
import { versionsList } from './judge.ts';
import { fixedSlips, type Speller } from './typing.ts';
import { speller } from './speller.ts';

export async function polishAcceptor(original: string, dashes: 'keep' | 'remove', avoid: string[], spell?: Speller | null) {
  const dictionary = spell === undefined ? await speller().catch(() => null) : spell;
  const acceptor = versionAcceptor(original, dashes, avoid);
  const local = acceptor.accept(fixedSlips(original, dictionary), 0, versionsList[0].label);
  return {
    local,
    results: acceptor.results,
    layoutFails: acceptor.layoutFails,
    get unchanged() { return acceptor.unchanged; },
    accept(text: string, slot: number, label?: string) { return slot === 0 ? null : acceptor.accept(text, slot, label); },
    fix(text: string, slot: number, label?: string) { return slot === 0 ? null : acceptor.fix(text, slot, label); },
  };
}

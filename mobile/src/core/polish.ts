import { versionAcceptor } from './drafts.ts';
import { fixedSlips, type Speller } from './typing.ts';
import { speller } from './speller.ts';

export async function polishAcceptor(original: string, dashes: 'keep' | 'remove', avoid: string[], spell?: Speller | null) {
  const dictionary = spell === undefined ? await speller().catch(() => null) : spell;
  const acceptor = versionAcceptor(original, dashes, avoid);
  const cleaned = (text: string, slot: number) => slot === 0 ? fixedSlips(text, dictionary) : text;
  return {
    results: acceptor.results,
    layoutFails: acceptor.layoutFails,
    get unchanged() { return acceptor.unchanged; },
    accept(text: string, slot: number, label?: string) { return acceptor.accept(cleaned(text, slot), slot, label); },
    fix(text: string, slot: number, label?: string) { return acceptor.fix(cleaned(text, slot), slot, label); },
  };
}

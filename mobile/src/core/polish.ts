import { numbersAndTimesKept, protectedTokens, versionAcceptor } from './drafts.ts';
import { fixedSlips, type Speller } from './typing.ts';
import { speller } from './speller.ts';

function protectedWording(text: string) {
  const tokens: string[] = [];
  const words = text.replace(protectedTokens, token => {
    tokens.push(token);
    return '\0'.repeat(token.length);
  });
  const names = [...words.matchAll(/[\p{L}][\p{L}\p{M}'’]*/gu)]
    .map(match => match[0]).filter(word => /^\p{Lu}/u.test(word) && !/^I(?:ts|t['’]s|['’](?:m|ve|ll|d))?$/.test(word));
  return { tokens, names };
}

export async function polishAcceptor(original: string, dashes: 'keep' | 'remove', avoid: string[], spell?: Speller | null) {
  const dictionary = spell === undefined ? await speller().catch(() => null) : spell;
  const acceptor = versionAcceptor(original, dashes, avoid);
  const local = fixedSlips(original, dictionary);
  const protectedOriginal = protectedWording(local);
  const cleaned = (text: string, slot: number) => {
    if (slot !== 0) return text;
    const version = fixedSlips(text, dictionary);
    const protectedVersion = protectedWording(version);
    // New sentence capitals are allowed; every original name occurrence must remain.
    const names = protectedVersion.names.filter(word => protectedOriginal.names.includes(word));
    return numbersAndTimesKept(local, version)
      && JSON.stringify(protectedOriginal.tokens) === JSON.stringify(protectedVersion.tokens)
      && JSON.stringify(protectedOriginal.names) === JSON.stringify(names) ? version : local;
  };
  return {
    results: acceptor.results,
    layoutFails: acceptor.layoutFails,
    get unchanged() { return acceptor.unchanged; },
    accept(text: string, slot: number, label?: string) { return acceptor.accept(cleaned(text, slot), slot, label); },
    fix(text: string, slot: number, label?: string) { return acceptor.fix(cleaned(text, slot), slot, label); },
  };
}

import { fresh, layoutKept, numbersAndTimesKept, undash, versionAcceptor } from './drafts.ts';
import { versionPrompt, versionsList } from './judge.ts';
import { fixedSlips, type Speller } from './typing.ts';
import { speller } from './speller.ts';
import { polishDiagnostic } from './polishDiagnostics.ts';

/** One bounded retry for an empty checked set, through the same writer and guard. */
export function shorterRetryPrompt(original: string, screen: string, guide: string, dashes: 'keep' | 'remove', platform?: Parameters<typeof versionPrompt>[5]) {
  return versionPrompt(original, screen, versionsList[1], guide, dashes, platform)
    + '\n\nThe previous set had no qualifying revision. Try Shorter once more: retain EVERY point and uncertainty word (think, maybe, probably, guess, only, might), actor, name, condition, negation, modal and promise. Use equivalent contractions and tighter sentence structure, not deleted information. Keep every list row and marker. Fix clear spelling/grammar slips without replacing unfamiliar vocabulary. It must have fewer words, not merely shorter spellings or squeezed punctuation. Return the original unchanged if that is impossible.';
}

export async function polishAcceptor(original: string, dashes: 'keep' | 'remove', avoid: string[], spell?: Speller | null) {
  const trace = polishDiagnostic(original);
  const dictionary = spell === undefined ? await speller().catch(() => null) : spell;
  let acceptor = versionAcceptor(original, dashes, avoid);
  const corrected = fixedSlips(original, dictionary);
  const localText = dashes === 'remove' ? undash(corrected) : corrected;
  const local = localText === original ? null : acceptor.accept(localText, 0, versionsList[0].label);
  const take = (text: string, slot: number, label: string | undefined, stage: 'accept' | 'fix') => {
    const clean = (dashes === 'remove' ? undash(text) : text).trim();
    const checks = trace ? { layout: layoutKept(original, clean), numbersAndTimes: numbersAndTimesKept(original, clean),
      notExactInput: clean !== original.trim(), fresh: fresh(clean, [...acceptor.results.map(result => result.text), ...avoid]) } : undefined;
    const accepted = slot === 0 ? null : acceptor[stage](text, slot, label);
    trace?.({ stage, slot, text: clean, checks, accepted: accepted != null });
    return accepted;
  };
  return {
    local,
    get results() { return acceptor.results; },
    get layoutFails() { return acceptor.layoutFails; },
    /** Record raw layout failures without accepting unchecked text into the final results. */
    layoutRetries(candidates: { text: string; slot: number }[]) {
      const probe = versionAcceptor(original, dashes, avoid);
      for (const { text, slot } of candidates) {
        if (slot > 0 && !layoutKept(original, text)) probe.accept(text, slot, versionsList[slot].label);
      }
      return [...probe.layoutFails, ...acceptor.layoutFails].filter((fail, index, all) => fail.slot > 0 && all.findIndex(other => other.slot === fail.slot) === index);
    },
    rejectLocal() { acceptor = versionAcceptor(original, dashes, avoid); },
    get unchanged() { return acceptor.unchanged; },
    accept(text: string, slot: number, label?: string) { return take(text, slot, label, 'accept'); },
    fix(text: string, slot: number, label?: string) { return take(text, slot, label, 'fix'); },
  };
}

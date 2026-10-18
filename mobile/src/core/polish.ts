import { avoidLine, rebuildLines, undash, versionAcceptor } from './drafts.ts';
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
  const answer = await ask(`Does the text below say something a person clearly means, that a reader could understand and answer? Random letters, keyboard mash, and words that make no sense together are UNCLEAR. A short everyday reply or a line about what a post should say is CLEAR. Answer only CLEAR or UNCLEAR.\n\nasdf qwer zxcv -> UNCLEAR\nthe chair sang my homework into green soup soup -> UNCLEAR\nsee you at 6 -> CLEAR\nour app launches next week -> CLEAR\ngot it, thanks -> CLEAR\nwill do -> CLEAR\n\nText:\n${text}`);
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

/** Shared phone polish pipeline; the eval supplies the same endpoint and bundled dictionary. */
export async function polishVersions(
  ask: (prompt: string, maxTokens: number) => Promise<string>,
  request: { typed: string; conversation: string; guide: string; dashes: 'keep' | 'remove'; avoid: string[]; platform?: Parameters<typeof rewrite>[6] },
  landed: (text: string, slot: number, label?: string) => void,
  spell?: Speller | null,
) {
  const note = avoidLine(request.avoid);
  const engine = { ask: (prompt: string, maxTokens: number) => ask(prompt + (note ? `\n\n${note}` : ''), maxTokens) };
  const acceptor = await polishAcceptor(request.typed, request.dashes, request.avoid, spell);
  if (acceptor.local != null) landed(acceptor.local, 0, versionsList[0].label);
  await rewrite(engine, request.typed, request.conversation, request.guide, (version, text) => {
    const slot = versionsList.findIndex(v => v.name === version.name);
    const clean = acceptor.accept(text, slot, version.label);
    if (clean != null) landed(clean, slot, version.label);
  }, request.dashes, request.platform);
  for (const fail of acceptor.layoutFails) {
    const prompt = lineRetryPrompt(request.typed, request.conversation, versionsList[fail.slot], request.guide, request.dashes, request.platform);
    let rebuilt: string | null;
    try { rebuilt = rebuildLines(request.typed, await engine.ask(prompt, 256)); }
    catch { continue; }
    if (rebuilt == null) continue;
    const fixed = acceptor.fix(rebuilt, fail.slot, fail.label);
    if (fixed != null) landed(fixed, fail.slot, fail.label);
  }
  return { drafts: acceptor.results.sort((a, b) => a.slot - b.slot).map(r => r.text), unchanged: acceptor.unchanged };
}

import { avoidLine, cleanDrafts, copiesPost, copiesPrompt, fresh, undash } from './drafts.ts';
import { addedNumbers, inventedTimes, matcher } from './slop.ts';
import { polishLine, type Platform } from './platforms.ts';

/** Three angles on one set of raw notes, so the posts differ in what they lead with, not only in wording.
 *  None ends on a question: a person's "end posts on a statement" rule holds for every card. */
export const NOTE_POSTS = [
  { label: 'Main point', ask: 'Lead with the most concrete point in the notes, then one detail that backs it.' },
  { label: 'What happened', ask: 'Tell what they did or what happened, in order, as a short update.' },
  { label: 'What I learned', ask: 'Share the one thing the notes show they learned or noticed, said plainly.' },
] as const;

export type NotesRequest = { notes: string; guide: string; platform: Platform; never: string[]; dashes: 'keep' | 'remove' };

/** One post per call: the phone's model writes one post per call reliably, and the cloud writers get the same prompt. */
const POST_TOKENS = 200;

/** The instructions half of one post call. The answer is checked against it, so a copied instruction is never a post. */
function postRules(request: NotesRequest, slot: number, avoid: string[]): string {
  const { platform } = request;
  return [
    `Turn their raw notes into one ${platform.label || 'social'} post they would write themselves.`,
    `The post: ${NOTE_POSTS[slot].ask}`,
    `Write in first person, in their voice: plain words, short sentences. Keep it under ${Math.min(platform.limit ?? 280, 600)} characters: one post, not a thread.`,
    polishLine(platform),
    'Use only facts from the notes. Never add numbers, names, dates, times or results that are not in the notes, and never say how people felt or reacted beyond what the notes say.',
    'Write the post itself, not advice about writing one, and do not copy the notes as they are.',
    request.dashes === 'remove' ? 'No hashtags, emoji, flattery or long dashes.' : 'No hashtags, emoji or flattery.',
    request.guide ? `Their rules and note: ${request.guide}` : '',
    avoidLine(avoid),
    'Output only the post text.',
  ].filter(Boolean).join('\n');
}

export function notesPostPrompt(request: NotesRequest, slot: number, avoid: string[]): { prompt: string; rules: string } {
  const rules = postRules(request, slot, avoid);
  return { rules, prompt: `${rules}\n\nTheir notes:\n---\n${request.notes.slice(0, 3000)}\n---` };
}

/** A label or app name the writer printed above the post is formatting, not part of it. */
const PREAMBLE = /^(?:(?:post|draft|tweet|x|linkedin|reddit|threads|bluesky|main point|what happened|what i learned)\s*\d*\s*:\s*)+/i;

/** An answer that talks about a post, or about the notes, instead of being the post. */
export const postInstruction = (text: string): boolean =>
  /^(?:(?:okay|sure)[,!.]?\s*)?(?:here(?:'s| is| are)\b|(?:in\s+)?this post\b|(?:write|share|tell|lead with|start with|post about|turn)\b)/i.test(text.trim())
  || /\b(?:the|their|your|these|my) notes\b/i.test(text);

/** The post to show from one answer, or null: an empty, too long, never-say, copied, instruction-like or
 *  repeated answer, or one with a number or time the notes don't have, is never a card. */
export function acceptNotesPost(raw: string, request: NotesRequest, rules: string, shown: string[]): string | null {
  const first = (cleanDrafts([raw], 1)[0] ?? '').replace(PREAMBLE, '').replace(/^["“]([\s\S]*)["”]$/, '$1').trim();
  const text = request.dashes === 'remove' ? undash(first) : first;
  const { notes, platform } = request;
  if (!text || platform.limit != null && text.length > platform.limit) return null;
  if (request.never.some(phrase => phrase.trim() && matcher(phrase).test(text))) return null;
  if (copiesPost(text, notes) || copiesPrompt(text, rules) || postInstruction(text)) return null;
  if (addedNumbers(notes, text).length || inventedTimes(notes, text).length) return null;
  return fresh(text, shown) && !shown.some(other => copiesPost(text, other)) ? text : null;
}

/** Three posts from raw notes, one call each. A rejected answer gets one more call, then its card stays empty
 *  rather than showing a bad post. A writer failure before any post lands is the writer's failure; after one
 *  lands, the posts already shown stay. */
export async function notesPosts(
  ask: (prompt: string, maxTokens: number) => Promise<string>,
  request: NotesRequest,
  landed: (text: string, slot: number, label: string) => void,
): Promise<string[]> {
  const made: string[] = [];
  for (let slot = 0; slot < NOTE_POSTS.length; slot++) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { prompt, rules } = notesPostPrompt(request, slot, made);
      let answer: string;
      try { answer = await ask(prompt, POST_TOKENS); }
      catch (error) { if (!made.length) throw error; break; }
      const post = acceptNotesPost(answer, request, rules, made);
      if (post) { made.push(post); landed(post, slot, NOTE_POSTS[slot].label); break; }
    }
  }
  return made;
}

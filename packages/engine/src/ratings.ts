// Per-card ratings for feed apps: an engagement rating from concrete things the draft's text
// shows on that platform, and a separate stock-wording rating from the shared slop rules. Plain
// code, no model call. Text checks can flag what tends to hold a post back; they can't tell
// whether a reply is good or how far it will go, so nothing here rates a draft up.
import * as Slop from './slop.ts';
import type { Platform } from './platforms.ts';

/** `concern`: counts against the draft. `note`: a plain fact about the text, counted neither way. */
export type Signal = { concern: boolean; text: string };
export type Engagement = { level: 'concerns' | 'none'; label: string; title: string; signals: Signal[]; unknown: string[] };
export type Stock = { level: 'none' | 'some' | 'lots'; label: string; title: string; signals: Signal[] };
export type Ratings = { engagement: Engagement; stock: Stock };

export const REACH_UNKNOWN = "Text alone can't predict reach";
export const POST_UNREAD = "Couldn't read the post to compare";
const LEVEL = { concerns: 'Holds it back', none: 'Nothing flagged' } as const;
const STOCK = { none: 'None found', some: 'Some', lots: 'A lot' } as const;

const STOP = new Set(('this that with have from they them their there what when where which while about would could should ' +
  'just like your yours been were will into than then also only more most some such very really much many over even ' +
  'because these those does doing done being here every other same still dont cant wont isnt thats youre theyre').split(' '));
const content = (text: string) => (text.toLowerCase().replace(/['’]/g, '').match(/\p{L}{4,}/gu) ?? []).filter(w => !STOP.has(w));
const LINK = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|ly|dev|app)\b\/?/i;

/** Ratings for one card on a known feed app; null for chats, mail and unknown apps, where neither applies.
 *  `post` is the text being replied to ('' when none could be read), or null for a new post, which
 *  has no parent to compare with. */
export function rate(text: string, platform: Platform, post: string | null, rules: Slop.Rules = Slop.NO_RULES): Ratings | null {
  if (platform.kind !== 'feed' || platform.id === 'default') return null;
  const parent = post?.trim() ?? '';
  const hits = Slop.hits(text, rules, true);

  const signals: Signal[] = [];
  if (platform.limit != null && text.length > platform.limit) signals.push({ concern: true, text: `Too long for ${platform.label}` });
  if (LINK.test(text)) signals.push({ concern: true, text: 'Has a link' });
  const tagged = [...text.matchAll(/(?<![\w@])@[A-Za-z0-9_]{1,15}\b/g)].map(m => m[0].toLowerCase());
  if (parent && tagged.some(handle => !parent.toLowerCase().includes(handle))) signals.push({ concern: true, text: "Tags people who aren't in the post" });
  // A question mark is a fact about the text; it can't show the question is worth answering.
  if (/\?(?:\s|$)/.test(text)) signals.push({ concern: false, text: 'Asks a question' });
  const level = signals.some(s => s.concern) ? 'concerns' : 'none';
  signals.sort((a, b) => Number(b.concern) - Number(a.concern));

  const stockSignals: Signal[] = [...new Map(hits.map(h => [h.reason, `“${text.slice(h.start, h.end).trim()}”: ${h.reason}`])).values()]
    .map(line => ({ concern: true, text: line }));
  // A word-overlap count, not a judgement of meaning: most of its longer words appear in the post.
  if (parent) {
    const postWords = new Set(content(parent));
    const own = [...new Set(content(text))];
    if (own.length >= 4 && own.filter(w => postWords.has(w)).length / own.length >= 2 / 3) stockSignals.unshift({ concern: true, text: "Reuses most of the post's words" });
  }
  const stock = stockSignals.length === 0 ? 'none' : stockSignals.length <= 2 ? 'some' : 'lots';

  return {
    engagement: { level, label: LEVEL[level], title: `Engagement on ${platform.label}`, signals, unknown: [REACH_UNKNOWN, ...(post !== null && !parent ? [POST_UNREAD] : [])] },
    stock: { level: stock, label: STOCK[stock], title: 'Stock wording', signals: stockSignals },
  };
}

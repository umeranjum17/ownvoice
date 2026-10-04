// Per-card ratings for feed apps: an engagement rating from concrete things the draft's text
// shows on that platform, and a separate stock-wording rating from the shared slop rules. Plain
// code, no model call. Text checks can point out things worth a second look; they can't show
// that a reply is good, that a link or tag costs reach, or how far it will go, so nothing here
// rates a draft up or predicts an outcome.
import * as Slop from './slop.ts';
import type { Platform } from './platforms.ts';

/** `concern`: counts against the draft. `note`: a plain fact about the text, counted neither way. */
export type Signal = { concern: boolean; text: string };
export type Engagement = { level: 'concerns' | 'none'; label: string; title: string; signals: Signal[]; unknown: string[] };
export type Stock = { level: 'none' | 'some' | 'lots'; label: string; title: string; signals: Signal[] };
export type Ratings = { engagement: Engagement; stock: Stock };

export const REACH_UNKNOWN = "Text alone can't predict reach";
export const POST_UNREAD = "Couldn't read the post to compare";
const LEVEL = { concerns: 'Worth a second look', none: 'Nothing flagged' } as const;
const STOCK = { none: 'None found', some: 'Some', lots: 'A lot' } as const;

const STOP = new Set(('this that with have from they them their there what when where which while about would could should ' +
  'just like your yours been were will into than then also only more most some such very really much many over even ' +
  'because these those does doing done being here every other same still dont cant wont isnt thats youre theyre').split(' '));
const content = (text: string) => (text.toLowerCase().replace(/['’]/g, '').match(/\p{L}{4,}/gu) ?? []).filter(w => !STOP.has(w));
const HANDLE = /(?<![\w@])@[A-Za-z0-9_]{1,15}(?![A-Za-z0-9_])/g;
const UHANDLE = /(?<![\w@])u\/[A-Za-z0-9_-]{1,20}(?![A-Za-z0-9_-])/gi;
const URL_SPAN = /https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.(?:com|net|org|io|co|ly|dev|app)\b\/?\S*/gi;
const handles = (text: string) => {
  const bare = text.replace(URL_SPAN, ' ');
  return new Set([...bare.matchAll(HANDLE), ...bare.matchAll(UHANDLE)].map(m => m[0].toLowerCase()));
};
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
  // Whole handles only: @alice is not in a post that names only @alice2.
  const inPost = handles(parent);
  if (parent && [...handles(text)].some(handle => !inPost.has(handle))) signals.push({ concern: true, text: "Tags people who aren't in the post" });
  // A question mark is a fact about the text; it can't show the question is worth answering.
  if (/\?(?:\s|$)/.test(text)) signals.push({ concern: false, text: 'Asks a question' });
  const level = signals.some(s => s.concern) ? 'concerns' : 'none';
  signals.sort((a, b) => Number(b.concern) - Number(a.concern));

  const stockSignals: Signal[] = [...new Map(hits.map(h => [h.reason, `“${text.slice(h.start, h.end).trim()}”: ${h.reason}`])).values()]
    .map(line => ({ concern: true, text: line }));
  // A word-overlap count, not a judgement of meaning: two thirds or more of the draft's own longer
  // words also appear in the post. It says nothing about how much of the post the draft covers.
  if (parent) {
    const postWords = new Set(content(parent));
    const own = [...new Set(content(text))];
    if (own.length >= 4 && own.filter(w => postWords.has(w)).length / own.length >= 2 / 3) stockSignals.unshift({ concern: true, text: 'Shares most of its wording with the post' });
  }
  const stock = stockSignals.length === 0 ? 'none' : stockSignals.length <= 2 ? 'some' : 'lots';

  return {
    engagement: { level, label: LEVEL[level], title: `Engagement on ${platform.label}`, signals, unknown: [REACH_UNKNOWN, ...(post !== null && !parent ? [POST_UNREAD] : [])] },
    stock: { level: stock, label: STOCK[stock], title: 'Stock wording', signals: stockSignals },
  };
}

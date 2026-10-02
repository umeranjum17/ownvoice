// Per-card ratings for feed apps: an engagement rating from what the draft itself shows on
// that platform, and a separate stock-phrasing rating from the shared slop rules. Plain code,
// no model call. Neither rating forecasts reach: how far a post goes can't be known from its text.
import * as Slop from './slop.ts';
import type { Platform } from './platforms.ts';

export type Signal = { ok: boolean; text: string };
export type Engagement = { level: 'helps' | 'hurts' | 'neutral'; label: string; title: string; signals: Signal[]; unknown: string[] };
export type Stock = { level: 'none' | 'some' | 'lots'; label: string; title: string; signals: Signal[] };
export type Ratings = { engagement: Engagement; stock: Stock };

export const REACH_UNKNOWN = 'Reach unknown until you post';
export const POST_UNREAD = "Couldn't read the post to compare";
const LEVEL = { helps: 'Helps', hurts: 'Holds it back', neutral: 'Nothing stands out' } as const;
const STOCK = { none: 'None found', some: 'Some', lots: 'A lot' } as const;

const STOP = new Set(('this that with have from they them their there what when where which while about would could should ' +
  'just like your yours been were will into than then also only more most some such very really much many over even ' +
  'because these those does doing done being here every other same still dont cant wont isnt thats youre theyre').split(' '));
const content = (text: string) => (text.toLowerCase().replace(/['’]/g, '').match(/\p{L}{4,}/gu) ?? []).filter(w => !STOP.has(w));
const LINK = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|ly|dev|app)\b\/?/i;

/** Ratings for one card on a known feed app; null for chats, mail and unknown apps, where neither applies. */
export function rate(text: string, platform: Platform, post: string, rules: Slop.Rules = Slop.NO_RULES): Ratings | null {
  if (platform.kind !== 'feed' || platform.id === 'default') return null;
  const read = !!post.trim();
  const postWords = new Set(content(post));
  const own = content(text);
  const fresh = [...new Set(own.filter(w => !postWords.has(w)))];
  const hits = Slop.hits(text, rules, true);
  const bait = hits.filter(h => h.reason === 'ends by asking for their thoughts');

  const signals: Signal[] = [];
  if (platform.limit != null && text.length > platform.limit) signals.push({ ok: false, text: `Too long for ${platform.label}` });
  if (LINK.test(text)) signals.push({ ok: false, text: 'Has a link' });
  const tagged = [...text.matchAll(/(?<![\w@])@[A-Za-z0-9_]{1,15}\b/g)].map(m => m[0].toLowerCase());
  if (read && tagged.some(handle => !post.toLowerCase().includes(handle))) signals.push({ ok: false, text: "Tags people who aren't in the post" });
  // A question they can answer, not the stock "thoughts?" ending.
  const questions = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().endsWith('?'));
  if (questions.some(q => !bait.some(h => q.includes(text.slice(h.start, h.end).trim())))) signals.push({ ok: true, text: 'Gives them something to answer' });
  if (read && fresh.length >= 3) signals.push({ ok: true, text: "Adds something the post didn't say" });
  const level = signals.some(s => !s.ok) ? 'hurts' : signals.length ? 'helps' : 'neutral';
  signals.sort((a, b) => Number(a.ok) - Number(b.ok));

  const stockSignals: Signal[] = [...new Map(hits.map(h => [h.reason, `“${text.slice(h.start, h.end).trim()}”: ${h.reason}`])).values()]
    .map(line => ({ ok: false, text: line }));
  // Restating the post without a new point is the tell that survives a clean-up.
  if (read && own.length >= 4 && fresh.length < 3 && fresh.length / own.length < 1 / 3) stockSignals.unshift({ ok: false, text: 'Mostly repeats the post' });
  const stock = stockSignals.length === 0 ? 'none' : stockSignals.length <= 2 ? 'some' : 'lots';

  return {
    engagement: { level, label: LEVEL[level], title: `Engagement on ${platform.label}`, signals, unknown: [REACH_UNKNOWN, ...(read ? [] : [POST_UNREAD])] },
    stock: { level: stock, label: STOCK[stock], title: 'Stock wording', signals: stockSignals },
  };
}

import { latestMessage, type ScreenText } from './drafts.ts';
import { CHROME_URL_BAR } from './platforms.ts';

export type FeedCounts = Partial<Record<'replies' | 'likes' | 'reposts' | 'upvotes', number>>;
export type FeedRead = { post: string; author?: string; age?: string; counts?: FeedCounts; subredditRules?: string[]; thread?: string[] };

const AGE = /\b(?:\d{1,3}\s*[mhd]|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2})\b/i;
const ageOnly = (text: string) => new RegExp(`^${AGE.source}$`, 'i').test(text.trim());

// A short header, never a mention buried inside prose. Values remain untrusted
// screen data; this module neither interprets instructions nor builds prompts.
function authorOf(text: string): string | undefined {
  const header = text.trim();
  const match = header.match(/^(?:[^@\n]{0,60})?(@[A-Za-z0-9_]{1,15})(?![A-Za-z0-9_])(?:\s*[·•]\s*.*)?$/)
    ?? header.match(/^(?:Posted by\s+)?(u\/[A-Za-z0-9_-]{1,20})(?:\s*[·•]\s*.*)?$/i);
  return match?.[1];
}

function countsOf(nodes: ScreenText[]): FeedCounts {
  const counts: FeedCounts = {};
  for (const node of nodes) {
    if (!node.clickable) continue;
    const label = node.description?.trim() || node.text;
    for (const match of label.matchAll(/(?:^|[\s,;·])((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?[kKmM]?)\s+(repl(?:y|ies)|likes?|reposts?|upvotes?)\b/gi)) {
      const raw = match[1].replace(/,/g, '');
      const value = Number.parseFloat(raw) * (/k$/i.test(raw) ? 1000 : /m$/i.test(raw) ? 1000000 : 1);
      const word = match[2].toLowerCase();
      const key = word.startsWith('repl') ? 'replies' : word.startsWith('like') ? 'likes' : word.startsWith('repost') ? 'reposts' : 'upvotes';
      if (Number.isSafeInteger(value) && counts[key] === undefined) counts[key] = value;
    }
  }
  return counts;
}

/** Best-effort screen extraction, using latestMessage's existing block/gap
 * heuristic. The nearest body above the field is the post; other header-led
 * blocks are visible thread context, not guaranteed ancestors. No layout
 * evidence means precisely the existing post-only fallback. */
export function feedRead(nodes: ScreenText[] = [], fieldTop?: number | null): FeedRead {
  const fallback = { post: latestMessage(nodes, fieldTop ?? undefined) };
  if (fieldTop == null || !Number.isFinite(fieldTop)) return fallback;
  const visible = nodes.filter(n => n.bottom <= fieldTop && n.text.trim() && n.viewId !== CHROME_URL_BAR)
    .slice().sort((a, b) => a.top - b.top || a.left - b.left);
  const headers = visible.filter(n => authorOf(n.text));
  if (!headers.length) return fallback;

  const ruleNodes = new Set<ScreenText>();
  const rules: string[] = [];
  if (headers.some(n => authorOf(n.text)?.startsWith('u/'))) {
    const heading = visible.findIndex(n => /^(?:Subreddit )?Rules$/i.test(n.text.trim()));
    if (heading >= 0) {
      ruleNodes.add(visible[heading]);
      let previous = visible[heading];
      for (const node of visible.slice(heading + 1)) {
        if (node.clickable || authorOf(node.text) || node.top - previous.bottom > 24 || Math.abs(node.left - previous.left) > 16) break;
        ruleNodes.add(node);
        rules.push(node.text.trim());
        previous = node;
      }
    }
  }
  const bodies = visible.filter(n => !n.clickable && !authorOf(n.text) && !ageOnly(n.text) && !ruleNodes.has(n));
  const nearest = bodies.at(-1);
  if (!nearest) return fallback;
  const header = headers.filter(n => n.bottom <= nearest.top).at(-1);
  if (!header) return fallback;
  const body = bodies.filter(n => n.top >= header.bottom);
  const post = latestMessage(body, fieldTop);
  if (!post) return fallback;
  // Find the top of the same contiguous block latestMessage reads, so an old
  // distant header does not lend its author to unrelated screen text.
  const descending = body.slice().sort((a, b) => b.bottom - a.bottom);
  let first = descending[0];
  let length = first.text.trim().length;
  for (const node of descending.slice(1)) {
    const gap = first.top - node.bottom;
    if (gap < 0 || gap > 24 || Math.abs(first.left - node.left) > 16 || length >= 1500) break;
    first = node;
    length += node.text.trim().length + 1;
  }
  if (first.top - header.bottom > 80) return fallback;
  const result: FeedRead = { post, author: authorOf(header.text) };
  const ageNode = visible.find(n => n !== header && ageOnly(n.text) && Math.abs(n.top - header.top) <= 24);
  const age = header.text.match(AGE)?.[0] ?? ageNode?.text.trim();
  if (age) result.age = age;
  const counts = countsOf(visible.filter(n => n.top >= header.top));
  if (Object.keys(counts).length) result.counts = counts;
  if (result.author?.startsWith('u/') && rules.length) result.subredditRules = rules;
  const thread: string[] = [];
  for (let i = headers.length - 1; i >= 0 && thread.length < 3; i--) {
    const other = headers[i];
    if (other === header) continue;
    const nextHeader = headers[i + 1]?.top ?? fieldTop;
    const firstBody = bodies.find(n => n.top >= other.bottom && n.bottom <= nextHeader);
    if (!firstBody) continue;
    // A reply's action row closes its body; the next author's display name can
    // appear before the next @handle and must not become the previous reply.
    const action = visible.find(n => n.clickable && n.top >= firstBody.bottom && n.top < nextHeader);
    const end = action?.top ?? nextHeader;
    const replyNodes = bodies.filter(n => n.top >= other.bottom && n.bottom <= end);
    if (!replyNodes.length || replyNodes[0].top - other.bottom > 80) continue;
    const reply = latestMessage(replyNodes, end);
    if (reply && reply !== post && !thread.includes(reply)) thread.unshift(reply);
  }
  if (thread.length) result.thread = thread;
  return result;
}

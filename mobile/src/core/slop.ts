// Port of Slop.kt and Voice.matcher: marks stock phrasing; never guesses who wrote a text.
export type Hit = { start: number; end: number; reason: string };
export type Rules = { never: string[]; noDashes: boolean; statementEndings: boolean; note: string };
export const NO_RULES: Rules = { never: [], noDashes: false, statementEndings: false, note: '' };
export const NEVER_SAY = 'on your never-say list';
export const ENDS_ON_QUESTION = 'ends on a question';
export const LONG_DASH = 'long dash (—)';

const STOCK = new RegExp('\\b(' + [
  'delve', 'delving', 'game[- ]changer', 'at the end of the day', "in today's [\\w-]+ world",
  'navigat\\w+ the complexit\\w+', 'a testament to', 'tapestry', 'unlock(?:ing)? (?:the|your) (?:full )?potential',
  'elevate your', 'seamless(?:ly)?', 'leverag\\w+', "it'?s worth noting", 'needless to say',
  'in conclusion', 'rest assured', 'hope this (?:message|email) finds you well', "let'?s dive in",
  'dive deep(?:er)?', 'deep dive', 'embark on', 'resonates? with', 'cutting[- ]edge', 'synerg\\w+',
  'circle back', 'touch base', 'moving forward', 'a friendly reminder', 'i completely understand',
  'thrilled to', 'super excited', 'wealth of', 'plays a (?:crucial|pivotal|vital) role',
  '(?:crucial|pivotal|vital) (?:role|step|part)', 'fostering', 'in the realm of', 'ever-evolving',
].join('|') + ')\\b', 'gi');

const CONTRAST = [
  /\bnot (?!sure\b)(?:just |only |merely )?[\w'’ -]{1,40}?,? but (?:also )?\b/gi,
  /\b(?:is|are|was|it's|it’s|that's|that’s) not (?:just|only|merely|about)\b/gi,
  /\b(?:isn't|isn’t|aren't|aren’t|wasn't|wasn’t) (?:just|only|merely|about)\b/gi,
  /\bmore than just\b/gi,
  /\bthe real (?:question|problem|issue|win|story|secret|magic|lesson|point|answer|key)\b/gi,
];

const ITEM = "(?<![\\w'’-])(?!(?:i|you|he|she|it|we|they)\\b|[\\w-]*['’])[\\w'’-]+(?: [\\w'’-]+)?";
const TRIAD = new RegExp(`${ITEM}, ${ITEM},? (?:and|or) ${ITEM}(?=[.,;:!?]|$)`, 'gi');
const DASH = /—| – | -- /g;
const FLATTERY = new RegExp(
  "^\\s*(?:great|excellent|fantastic|brilliant|awesome|amazing|love (?:this|that|it)|what an? (?:great|fantastic|brilliant|insightful|amazing)|" +
  "(?:such|what) an? (?:great|thoughtful|insightful|important)|this is (?:so |such )?(?:spot on|brilliant|amazing|fantastic|great|a great)|" +
  "absolutely|couldn't agree more|couldn’t agree more|thanks (?:so much )?for sharing|you're (?:absolutely |so )?right|you’re (?:absolutely |so )?right)" +
  '[^.!?\\n]{0,40}[.!?,]?', 'gi');
const PREAMBLE = new RegExp(
  "^\\s*(?:(?:sure|certainly|of course|absolutely)[!,.]\\s*)?(?:here(?:'s|’s| is| are) (?:a|an|my|the|some|one|your)?\\s*" +
  "(?:[\\w,'’-]+ ){0,3}(?:reply|replies|response|responses|draft|drafts|version|message|rewrite|option|suggestion)s?\\b[^\\n:]*:?" +
  '|(?:reply|response|draft|rewrite):|as an ai\\b[^.\\n]*\\.?)', 'gi');
const CTA = new RegExp(
  "(?:what do you think|what are your thoughts|thoughts\\?|let me know (?:if|what|your|how)|feel free to|drop (?:a|your) \\w+|" +
  "share your (?:thoughts|experience)|i'?d love to hear|i’d love to hear|follow (?:me )?for more|hope (?:this|that) helps|agree\\?|" +
  "don't hesitate to|don’t hesitate to|looking forward to hearing)[^.!?\\n]*[.!?]*\\s*$", 'gi');
const HASHTAG = /(?<![\w#])#[\p{L}\d_]+/gu;
const LAST_SENTENCE = /[.!?\n]\s+(?=\S[^.!?\n]*[.!?]*\s*$)/g;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Matches a never-say phrase: any case, any run of spaces, straight or curly apostrophes, whole words only. */
export function matcher(phrase: string) {
  const p = phrase.trim();
  const body = p.split(/\s+/).map((w) => [...w].map((c) => (c === "'" || c === '’' ? "['’]" : escape(c))).join('')).join('\\s+');
  const edge = (c: string) => /[\p{L}\p{N}]/u.test(c);
  return new RegExp(`${edge(p[0]) ? '(?<![\\p{L}\\d])' : ''}${body}${edge(p[p.length - 1]) ? '(?![\\p{L}\\d])' : ''}`, 'giu');
}

export function hits(text: string, voice: Rules = NO_RULES, post = false): Hit[] {
  const out: Hit[] = [];
  const add = (re: RegExp, reason: string) => { for (const m of text.matchAll(re)) out.push({ start: m.index!, end: m.index! + m[0].length, reason }); };
  voice.never.filter((p) => p.trim()).forEach((p) => add(matcher(p), NEVER_SAY));
  add(STOCK, 'a phrase people say to anyone');
  CONTRAST.forEach((re) => add(re, '“not this, but that” pattern'));
  add(TRIAD, 'three things in a row');
  add(DASH, LONG_DASH);
  add(FLATTERY, 'starts with flattery');
  add(PREAMBLE, 'starts with “Here’s a reply”');
  const all = [...text.matchAll(LAST_SENTENCE)];
  const last = all.length ? all[all.length - 1] : null;
  const lastSentence = last ? last.index! + last[0].length : 0;
  CTA.lastIndex = lastSentence;
  const cta = CTA.exec(text);
  CTA.lastIndex = 0;
  if (cta) out.push({ start: cta.index, end: cta.index + cta[0].length, reason: 'ends by asking for their thoughts' });
  const trimmed = text.trimEnd();
  if (post && voice.statementEndings && trimmed.endsWith('?')) out.push({ start: lastSentence, end: trimmed.length, reason: ENDS_ON_QUESTION });
  const tags = [...text.matchAll(HASHTAG)];
  if (tags.length >= 2) tags.forEach((m) => out.push({ start: m.index!, end: m.index! + m[0].length, reason: 'lots of hashtags' }));
  const emoji: [number, number][] = [];
  for (let i = 0; i < text.length;) {
    const cp = text.codePointAt(i)!;
    const n = cp > 0xffff ? 2 : 1;
    if ((cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf)) emoji.push([i, i + n]);
    i += n;
  }
  if (emoji.length >= 3) emoji.forEach(([s, e]) => out.push({ start: s, end: e, reason: 'lots of emoji' }));
  const seen = new Set<string>();
  return out.filter((h) => h.end > h.start).sort((a, b) => a.start - b.start)
    .filter((h) => { const k = `${h.start}:${h.reason}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

export const score = (hitCount: number, generic?: number | null, specific?: number | null) =>
  Math.min(20, Math.max(0, 2 * hitCount + (generic == null || specific == null ? 0 : generic + (10 - specific)))) * 5;
export const natural = (s: number) => s < 25;
export const words = (s: number) => (natural(s) ? 'Sounds natural' : s <= 55 ? 'A bit stock' : 'Sounds canned');
export function addedNumbers(original: string, rewrite: string): string[] {
  const nums = (s: string) => [...s.matchAll(/\d+(?:[.,:]\d+)*/g)].map(m => m[0]);
  const key = (s: string) => s.replace(/,(?=\d{3}(?!\d))/g, '').replace(/:/g, '.');
  const have = new Set(nums(original).map(key));
  const seen = new Set<string>();
  return nums(rewrite).filter(n => !have.has(key(n)) && !seen.has(key(n)) && !!seen.add(key(n)));
}

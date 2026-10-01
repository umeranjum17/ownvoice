// Port of Slop.kt and Voice.matcher: marks stock phrasing; never guesses who wrote a text.
export type Hit = { start: number; end: number; reason: string };
export type Rules = { never: string[]; noDashes: boolean; statementEndings: boolean; note: string; samples?: string[] };
export const NO_RULES: Rules = { never: [], noDashes: false, statementEndings: false, note: '', samples: [] };
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
  // Deliberate change from Kotlin (spec 5.4): a long dash is only called out when the writer's
  // no-dashes switch is on; otherwise their own dashes are theirs to keep.
  if (voice.noDashes) add(DASH, LONG_DASH);
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
const TIMES = /\b\d{1,2}(?::\d{2})?\s*(?:a\.m\.|p\.m\.|(?:am|pm)\b)|\b\d{1,2}[:.]\d{2}\b/gi;
const timeParts = (t: string) => {
  const norm = t.toLowerCase().replace(/a\s*\.\s*m\s*\./g, 'am').replace(/p\s*\.\s*m\s*\./g, 'pm').replace(/\s+/g, '');
  const m = norm.match(/(am|pm)$/);
  return { core: norm.replace(/(am|pm)$/, '').replace(/(\d)[.:](\d)/g, '$1:$2'), mer: m ? m[1] : '' };
};
const DAYWORDS = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|may\s+\d{1,2}(?:st|nd|rd|th)?\b|january|february|march|april|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|today|tomorrow|tonight|yesterday|morning|afternoon|evening|noon|midnight|midday)\b/gi;
// Sat/Sun match in any case; lowercase needs day-like left context so the verb "sat" ("we sat down") and the noun "sun" ("the sun") stay quiet.
const DAYABBR = /\b(Sat|Sun)\b|(?<=\b(?:on|this|next|last|every)\s)(sat|sun)\b/g;
const HOURPREP = /\b(?:at|around|about|by|after|before|past|until|till|toward|towards|from|between)\s+(\d{1,2})\b(?![.:]\d)/gi;
const hourKey = (h: string) => h.replace(/^0+(?=\d)/, '');
const wordKey = (w: string) => {
  const l = w.toLowerCase();
  if (/^(mon(day)?)$/.test(l)) return 'mon';
  if (/^(tue(s)?|tuesday)$/.test(l)) return 'tue';
  if (/^(wed(nesday)?)$/.test(l)) return 'wed';
  if (/^(thu(r(s)?)?|thursday)$/.test(l)) return 'thu';
  if (/^(fri(day)?)$/.test(l)) return 'fri';
  if (/^(sat(urday)?)$/.test(l)) return 'sat';
  if (/^(sun(day)?)$/.test(l)) return 'sun';
  if (/^(jan(uary)?)$/.test(l)) return 'jan';
  if (/^(feb(ruary)?)$/.test(l)) return 'feb';
  if (/^(mar(ch)?)$/.test(l)) return 'mar';
  if (/^(apr(il)?)$/.test(l)) return 'apr';
  if (/^(jun(e)?)$/.test(l)) return 'jun';
  if (/^(jul(y)?)$/.test(l)) return 'jul';
  if (/^(aug(ust)?)$/.test(l)) return 'aug';
  if (/^(sep(t)?(ember)?)$/.test(l)) return 'sep';
  if (/^(oct(ober)?)$/.test(l)) return 'oct';
  if (/^(nov(ember)?)$/.test(l)) return 'nov';
  if (/^(dec(ember)?)$/.test(l)) return 'dec';
  return l;
};
/** Times, days and dates in the rewrite that never appear in the original ("my flight is at 10 AM" with no time on screen). */
export function inventedTimes(original: string, rewrite: string): string[] {
  const have = new Map<string, Set<string>>();
  for (const m of original.matchAll(TIMES)) {
    const { core, mer } = timeParts(m[0]);
    if (!have.has(core)) have.set(core, new Set());
    have.get(core)!.add(mer);
  }
  const haveHours = new Set([...original.matchAll(HOURPREP)].map(m => hourKey(m[1])));
  for (const m of original.matchAll(TIMES)) haveHours.add(hourKey(timeParts(m[0]).core.split(':')[0]));
  const seen = new Set<string>();
  const clocks = [...rewrite.matchAll(TIMES)].map(m => m[0]).filter(t => {
    const { core, mer } = timeParts(t);
    const key = core + '|' + mer;
    if (seen.has(key)) return false;
    const mers = have.get(core);
    if (mers !== undefined && (mer === '' || mers.has('') || mers.has(mer))) { seen.add(key); return false; }
    if (mers === undefined) {
      const normCore = core.replace(/^0+(?=\d)/, '');
      if (!normCore.includes(':') && haveHours.has(normCore)) { seen.add(key); return false; }
    }
    seen.add(key);
    return true;
  });
  const bare = [...rewrite.matchAll(HOURPREP)].sort((a, b) => a.index! - b.index!).map(m => m[1]).filter(h => {
    const key = hourKey(h);
    if (haveHours.has(key) || seen.has('h:' + key)) return false;
    if ([...seen].some(k => k.split('|')[0] === key)) return false;
    seen.add('h:' + key);
    return true;
  });
  const haveWords = new Set([...original.matchAll(DAYWORDS)].map(m => wordKey(m[0])));
  for (const m of original.matchAll(DAYABBR)) haveWords.add(wordKey(m[0]));
  const wordCands = [...rewrite.matchAll(DAYWORDS), ...rewrite.matchAll(DAYABBR)].sort((a, b) => a.index! - b.index!);
  const daywords = wordCands.map(m => m[0]).filter(w => {
    const key = wordKey(w);
    if (haveWords.has(key) || seen.has('w:' + key)) return false;
    seen.add('w:' + key);
    return true;
  });
  return [...clocks, ...bare, ...daywords];
}
export function addedNumbers(original: string, rewrite: string): string[] {
  const nums = (s: string) => [...s.matchAll(/\d+(?:[.,:]\d+)*/g)].map(m => m[0]);
  const key = (s: string) => s.replace(/,(?=\d{3}(?!\d))/g, '').replace(/:/g, '.');
  const have = new Set(nums(original).map(key));
  const seen = new Set<string>();
  return nums(rewrite).filter(n => { const normalized = key(n); if (have.has(normalized) || seen.has(normalized)) return false; seen.add(normalized); return true; });
}

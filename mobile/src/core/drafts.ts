// Draft-quality logic (look spec section 5). Pure TypeScript; the writers call it.
import type { Rules } from './slop';

// ---- Cleanup of raw model output (moved from the phone writer; behaviour unchanged, spec 5.5) ----

const count = 3;
const numbered = /(?:^|\s)(?:(?:draft|option|version)\s*)?([1-3])[.):]\s+/gi;
const labelled = /(?:^|\s)(?:draft|option|version)\s*([1-3])[.):]\s*/gi;

function unquote(text: string) {
  return text.replace(/^"([\s\S]*)"$/, '$1').replace(/^“([\s\S]*)”$/, '$1')
    .replace(/^'([\s\S]*)'$/, '$1').replace(/^‘([\s\S]*)’$/, '$1').trim();
}

function body(text: string, polishing: boolean) {
  const lines = text.trim().split(/\r?\n/);
  const first = lines[0]?.trim() ?? '';
  if (/^(?:(?:okay|sure)[,!.]?\s*)?here(?:'s| is) (?:a|the|your) reply\s*:/i.test(first) ||
    !polishing && /^(?:(?:okay|sure)[,!.]?\s*)?(?:here (?:are|is)|these are|below are)\b[^:]*\b(?:versions?|options?|drafts?)\b\s*:/i.test(first)) {
    const colon = first.indexOf(':');
    lines[0] = colon < 0 ? '' : first.slice(colon + 1).trim();
  }
  return lines.join('\n').trim();
}

function parts(text: string, polishing: boolean) {
  const input = unquote(text.trim());
  const value = body(input, polishing);
  if (polishing) return [value];
  const explicit = /\b(?:versions?|options?|drafts?)\b/i.test(input.split(/\r?\n/, 1)[0]) && value !== input;
  const pattern = explicit ? numbered : labelled;
  const markers: { start: number; end: number }[] = [];
  for (const match of value.matchAll(pattern)) markers.push({ start: match.index! + match[0].search(/\S/), end: match.index! + match[0].length });
  if (markers.length > 1 && !value.slice(0, markers[0].start).trim()) {
    return markers.map((marker, index) => value.slice(marker.end, markers[index + 1]?.start ?? value.length));
  }
  if (explicit) {
    const lines = value.split(/\r?\n/);
    const bullets = lines.map((line, index) => ({ line, index })).filter(({ line }) => /^\s*[-*•]\s+/.test(line));
    if (bullets.length > 1 && !lines.slice(0, bullets[0].index).join('').trim())
      return bullets.map(({ line, index }, i) => [line.replace(/^\s*[-*•]\s+/, ''), ...lines.slice(index + 1, bullets[i + 1]?.index ?? lines.length)].join('\n'));
  }
  if (explicit && [...value.matchAll(numbered)].length === 1)
    return [value.replace(/^\s*[1-3][.):]\s+/, '')];
  return [value];
}

export function cleanDrafts(candidates: string[], limit = count, polishing = false, unique = true) {
  const drafts: string[] = [];
  for (const candidate of candidates) {
    for (const part of parts(candidate, polishing)) {
      const draft = unquote(body(unquote(part.trim().replace(/^(?:draft|option|version)\s*[1-3][.):]\s*/i, '')), polishing));
      const key = draft.toLowerCase().replace(/\s+/g, ' ');
      if (draft && (!unique || !drafts.some(value => value.toLowerCase().replace(/\s+/g, ' ') === key))) drafts.push(draft);
      if (drafts.length === limit) return drafts;
    }
  }
  return drafts;
}

// ---- 5.3 Duplicates ----

export function norm(text: string): string {
  return text.toLowerCase().replace(/’/g, "'").replace(/[^\p{L}\p{N}'\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export const fresh = (draft: string, shown: string[]): boolean => !shown.some(other => norm(other) === norm(draft));

// ---- 5.2 Keep the writer's formatting ----

const nonEmptyLines = (text: string) => text.split(/\r?\n/).filter(line => line.trim()).length;
const listMarkers = (text: string) => text.split(/\r?\n/).flatMap(line => {
  const marker = line.match(/^\s*(\d+[.)]|[-*•])\s+/)?.[1];
  return marker ? [marker] : [];
});

export function layoutKept(original: string, version: string): boolean {
  const had = listMarkers(original), has = listMarkers(version);
  return had.length === has.length && had.every((marker, i) => marker === has[i])
    && (!original.includes('\n') || nonEmptyLines(version) >= nonEmptyLines(original) - 1);
}

// ---- 5.4 The dash rule: the writer's text and their own switch win ----

/** ' — ', '—' and ' – ' become ', ' on any draft the table says must not carry a dash. */
export function undash(text: string): string {
  return text.replace(/ — |—| – /g, ', ');
}

/** The table: the switch on removes dashes everywhere; switch off keeps them only when the writer's own text uses one. */
export function dashDecision(noDashes: boolean, ownText: string): 'keep' | 'remove' {
  return !noDashes && ownText.includes('—') ? 'keep' : 'remove';
}

export const dashesFor = (rules: Rules, ownText: string): 'keep' | 'remove' => dashDecision(rules.noDashes, ownText);

// ---- 5.1 Replies ----

export const REPLY_SLOTS = [
  'Say yes or agree, and answer each point.',
  'Give a different answer: decline or suggest a change, kindly, still answering each point.',
  'Not sure yet: a short honest reply that asks the one thing needed to decide.',
];

export type ScreenText = { text: string; top: number; bottom: number; clickable: boolean };

export function latestMessage(nodes?: ScreenText[], fieldTop?: number): string {
  if (fieldTop == null) return '';
  const text = (nodes ?? []).filter(node => !node.clickable && node.bottom <= fieldTop && node.text.trim())
    .sort((a, b) => b.bottom - a.bottom)[0]?.text.trim() ?? '';
  return text.length > 1500 ? `${text.slice(0, 1000)}\n(middle shortened)\n${text.slice(-500)}` : text;
}

export type ReplyInput = { latest: string; conversation: string; guide?: string; dashes: 'keep' | 'remove'; avoid?: string[] };

// ponytail: conversation keeps only its last 3000 characters; revisit if long-thread context is needed.
const inputBlock = ({ latest, conversation }: { latest: string; conversation: string }) =>
  `${latest ? `Latest message:\n${latest}\n\n` : ''}Conversation:\n${conversation.slice(-3000)}`;

const dashLine = (dashes: 'keep' | 'remove') => dashes === 'keep' ? 'their dashes: keep' : 'their dashes: remove';

const avoidLine = (avoid?: string[]) => avoid?.length ? `Don't repeat these: ${avoid.map(a => a.replace(/\s+/g, ' ').trim()).filter(Boolean).join('; ')}.` : '';
export { avoidLine };

const slotList = (slots: string[]) => slots.map((slot, i) => `${i + 1}. ${slot}`).join('\n');

/** The C2 reply prompt (quality eval Appendix A): no blanks, every point answered, the dash rule, fixed slots. */
export function replyPrompt(input: ReplyInput & { slots?: string[] }): string {
  const slots = input.slots ?? REPLY_SLOTS;
  const single = slots.length === 1;
  return [
    'You write reply drafts for one person, from the text on their phone screen. The screen may include app labels, counts and buttons; ignore those.',
    'First work out what the last message asks or says, and what kind of place it is: a private chat, an email, a public post or a comment.',
    'Every draft must respond to everything the latest message asks or offers (for example both the day and who brings what).',
    single ? 'Write one draft they could send as is, filling this slot:' : 'Write 3 drafts they could send as is, each filling one of these slots:',
    slotList(slots),
    single ? 'If the latest message is news, thanks or a feeling, stay warm and kind.' : 'If the latest message is news, thanks or a feeling, all three stay warm and kind: 1 is short, 2 adds one concrete thing from the screen, 3 asks one friendly question.',
    'Never put words in their mouth:',
    '- Don\'t invent anything about them: past experience, what they tried or built, numbers, prices, plans, customers, team, dates, schedule clashes, or facts about their product beyond the screen and their note.',
    '- If an honest answer would need a fact only they know, ask a short question back or reply without it.',
    '- No "we" or "our" unless the screen or their note shows it.',
    'Sound like them typing on a phone: plain words, short sentences, the thread\'s language, and the casing and tone of their note. Match the length around it: a chat reply is usually one line, a public reply or comment one or two short sentences, an email a short greeting, one to three short sentences and a short sign-off without a name.',
    'Say one concrete thing tied to the screen instead of general praise.',
    'No flattery openers ("Great post", "Love this"), no closing question just to invite replies, no "not X but Y", no lists of three, no hashtags. Don\'t add long dashes (—).',
    dashLine(input.dashes),
    'Follow their own rules and note.',
    input.guide ? `Their rules and note: ${input.guide}` : '',
    avoidLine(input.avoid),
    'Output only JSON: {"drafts":["..."]}',
  ].filter(Boolean).join('\n') + `\n\n${inputBlock(input)}`;
}

// The phone model gets the same rules condensed (≤ 700 characters of instructions), one call,
// three replies, each labelled so cleanDrafts/parts() splits them.
const PHONE_REPLY_INSTRUCTIONS = [
  'You write reply drafts for one person from their phone screen.',
  'Every draft must respond to everything the latest message asks or offers.',
  'Write three replies, each starting Draft 1:, Draft 2: or Draft 3:, each a different answer:',
  slotList(REPLY_SLOTS),
  'If it is news, thanks or a feeling, stay warm: 1 short, 2 adds one concrete detail, 3 asks one friendly question.',
  'Never invent facts about them; ask instead. Match their language and tone; short and plain. No flattery, hashtags, emoji or long dashes.',
].join('\n');

/** The condensed phone prompt: instructions (≤ 700 characters) plus the input block. */
export function phoneReplyPrompt(input: Omit<ReplyInput, 'dashes' | 'avoid'>): string {
  return `${PHONE_REPLY_INSTRUCTIONS}\n\n${inputBlock(input)}`;
}

/** One extra call for one empty slot, with everything already shown as off-limits. */
export function phoneSlotPrompt(slot: string, input: Omit<ReplyInput, 'dashes' | 'avoid'>, avoid: string[]): string {
  return [
    'You write one reply for one person from their phone screen.',
    `The reply: ${slot}`,
    'Every draft must respond to everything the latest message asks or offers.',
    avoidLine(avoid),
    'Don\'t invent facts about them; ask a short question back instead. Match their language and tone; plain words, short sentences. No flattery openers, hashtags, emoji or long dashes.',
    `Output only the reply text.\n\n${inputBlock(input)}`,
  ].filter(Boolean).join('\n');
}

/** ChatGPT's one-slot retry: the C2 template narrowed to a single slot plus the avoid list. */
export function replySlotPrompt(slot: string, input: ReplyInput): string {
  return replyPrompt({ ...input, slots: [slot] });
}

export function acceptReplies(candidates: string[], exclude: string[], count = 3, dashes: 'keep' | 'remove' = 'remove'): (string | null)[] {
  const accepted: (string | null)[] = Array(count).fill(null);
  let next = 0;
  const accept = (text: string, slot: number) => {
    if (slot >= count || accepted[slot]) return;
    const draft = dashes === 'remove' ? undash(text) : text;
    if (draft && fresh(draft, [...exclude, ...accepted.filter((value): value is string => !!value)])) accepted[slot] = draft;
  };
  for (const candidate of candidates) {
    const source = body(unquote(candidate), false);
    const markers = [...source.matchAll(labelled)];
    if (count > 1 && markers.length && !source.slice(0, markers[0].index).trim()) {
      markers.forEach((marker, i) => {
        const text = source.slice(marker.index! + marker[0].length, markers[i + 1]?.index ?? source.length);
        const slot = Number(marker[1]) - 1;
        next = Math.max(next, slot + 1);
        accept(cleanDrafts([text], 1)[0] ?? '', slot);
      });
    } else {
      for (const text of cleanDrafts([candidate], count, false, false)) accept(text, next++);
    }
  }
  while (accepted.length && accepted.at(-1) == null) accepted.pop();
  return accepted;
}

// ---- 5.2 Acceptance for polish versions: layout kept, nothing equal to the writer's text, no duplicates ----

export type AcceptedVersion = { text: string; slot: number; label?: string };

/** Tracks which polish versions to show while a rewrite streams; queued layout failures get one fix each. */
export function versionAcceptor(original: string, dashes: 'keep' | 'remove', avoid: string[]) {
  const shown: string[] = [];
  const results: AcceptedVersion[] = [];
  const layoutFails: { slot: number; label?: string }[] = [];
  const clean = (text: string) => (dashes === 'remove' ? undash(text) : text).trim();
  const distinct = (text: string) => norm(text) !== norm(original) && fresh(text, [...shown, ...avoid]);
  const usable = (text: string) => distinct(text) && layoutKept(original, text);
  return {
    results,
    layoutFails,
    /** Cheap checks while the version lands; returns the text to show, or null when dropped or queued for a layout fix. */
    accept(text: string, slot: number, label?: string): string | null {
      const version = clean(text);
      if (!version) return null;
      if (!usable(version)) {
        if (distinct(version)) layoutFails.push({ slot, label }); // only the layout failed; one fix queued
        return null;
      }
      shown.push(version);
      results.push({ text: version, slot, label });
      return version;
    },
    /** The one layout retry for a failed slot; null means the version is dropped. */
    fix(text: string, slot: number, label?: string): string | null {
      const version = clean(text);
      if (!version || !usable(version)) return null;
      shown.push(version);
      results.push({ text: version, slot, label });
      return version;
    },
  };
}

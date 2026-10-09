// Draft-quality logic (look spec section 5). Pure TypeScript; the writers call it.
import { platformLine, slotsFor, CHAT_SLOTS, type Platform } from './platforms.ts';
import type { Rules } from './slop.ts';
import { addedNumbers, inventedTimes, matcher } from './slop.ts';
import { MAX_GUIDE_LENGTH, rulesOnly, selectExamples } from './samples.ts';

// ---- Cleanup of raw model output (moved from the phone writer; behaviour unchanged, spec 5.5) ----

const count = 3;
const numbered = /(?:^|\s)(?:(?:draft|option|version)\s*)?([1-3])[.):]\s+/gi;
export const replyLabels = /(?:^|\s)(?:draft|option|version)\s*([1-3])[.):]\s*/gi;

function unquote(text: string) {
  return text.replace(/^"([\s\S]*)"$/, '$1').replace(/^“([\s\S]*)”$/, '$1')
    .replace(/^'([\s\S]*)'$/, '$1').replace(/^‘([\s\S]*)’$/, '$1').trim();
}

const markerLine = (line: string) => line.match(/^\s*(draft|option|version)\s*([1-3])\s*[:.)]\s*(\S[\s\S]*)$/i);

function body(text: string, polishing: boolean) {
  const lines = (!polishing ? text.replace(/\*\*/g, '') : text).trim().split(/\r?\n/);
  const first = lines[0]?.trim() ?? '';
  if (/^(?:(?:okay|sure)[,!.]?\s*)?here(?:'s| is) (?:a|the|your) reply\s*:/i.test(first) ||
    !polishing && /^(?:(?:okay|sure)[,!.]?\s*)?(?:here (?:are|is)|these are|below are)\b[^:]*\b(?:versions?|options?|drafts?)\b\s*:/i.test(first) ||
    !polishing && /^(?:(?:okay|sure)[,!.]?\s*)?(?:here (?:are|is)|these are|below are)\b[^:]*\b(?:versions?|options?|drafts?)\b[^:]*[!:.]?\s*$/i.test(first)) {
    const colon = first.indexOf(':');
    lines[0] = colon < 0 ? '' : first.slice(colon + 1).trim();
  }
  if (!polishing) {
    // A "Draft 1: <label>" line restated as "Draft 1: <draft>" just below is a
    // header, not a draft: drop the stub and keep the longer restatement.
    for (let i = 0; i < lines.length; i++) {
      const head = markerLine(lines[i]);
      if (!head) continue;
      const next = lines.findIndex((line, j) => j > i && line.trim());
      const tail = next < 0 ? null : markerLine(lines[next]);
      if (tail && tail[2] === head[2] && tail[3].length > head[3].length) lines[i] = '';
    }
  }
  return lines.join('\n').trim();
}

function parts(text: string, polishing: boolean) {
  const input = unquote(text.trim());
  const value = body(input, polishing);
  if (polishing) return [value];
  const explicit = /\b(?:versions?|options?|drafts?)\b/i.test(input.split(/\r?\n/, 1)[0]) && value !== input;
  const pattern = explicit ? numbered : replyLabels;
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

export function preserveFragment(original: string, text: string): string {
  return /^[\p{L}\p{N}]+$/u.test(original.trim())
    ? text.replace(/[.。]\s*$/, '') : text;
}

/**
 * Selection-menu cleanup: the rewrite prompt says output only the rewritten text
 * with the original's line breaks, so non-empty lines past the original's line
 * count are model chatter (e.g. dash restatements under a single-sentence
 * Shorter, one inventing a "deadline" framing). Drop them; a real list keeps
 * every line because the counts match.
 */
export function cleanSelection(original: string, text: string): string {
  const expected = original.split(/\r?\n/).filter(line => line.trim()).length;
  let seen = 0;
  const kept: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) { seen += 1; if (seen > expected) continue; }
    kept.push(line);
  }
  return kept.join('\n').trim();
}

// ---- 5.3 Duplicates ----

export function norm(text: string): string {
  return text.toLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^(?:yep|yeah|yes|ya|yup|sure|ok|okay|sounds good)(?:\s+|$)/, '');
}

export const fresh = (draft: string, shown: string[]): boolean => !shown.some(other => norm(other) === norm(draft));

// ---- 5.2 Keep the writer's formatting ----

const nonEmptyLines = (text: string) => text.split(/\r?\n/).filter(line => line.trim()).length;
const paragraphBreaks = (text: string) => text.trim().match(/\r?\n(?:[ \t]*\r?\n)+/g)?.length ?? 0;
const listMarkers = (text: string) => text.split(/\r?\n/).flatMap(line => {
  const marker = line.match(/^\s*(\d+[.)]|[-*•])\s+/)?.[1];
  return marker ? [marker] : [];
});

export function layoutKept(original: string, version: string): boolean {
  const had = listMarkers(original), has = listMarkers(version);
  return had.length === has.length && had.every((marker, i) => marker === has[i])
    && paragraphBreaks(original) === paragraphBreaks(version)
    && (!original.includes('\n') || nonEmptyLines(version) >= nonEmptyLines(original) - 1);
}

const leadingMarker = /^\s*(?:\d+[.)]|[-*•])\s+/;
const rowLine = /^\s*row\s*(\d+)\s*[.:)-]\s*(.*)$/i;

/** A row answer that is only its list marker ('1.', '2)', '-') carries no content. */
const shellOnly = (text: string) => /^\s*(?:\d+[.)]|[-*•])?\s*$/.test(text);

/**
 * True when the version keeps every number and time of the original and invents none, in
 * both directions: numbers/times in the original but missing from the version are dropped,
 * and ones in the version but missing from the original are invented.
 */
export function numbersAndTimesKept(original: string, version: string): boolean {
  return !addedNumbers(original, version).length && !inventedTimes(original, version).length
    && !addedNumbers(version, original).length && !inventedTimes(version, original).length;
}

/**
 * Rebuilds a row-by-row rescue (see judge.lineRetryPrompt) onto the original lines: the
 * original's blank lines and list markers win, so the layout is kept by construction even when
 * the model flattened the list. Only "Row N:" lines for the expected rows (1..the original's
 * line count) count as rows, each exactly its marker line's text; every other line - sign-offs,
 * chatter, blanks, wrapped text - is dropped. A missing or empty row, a marker-only shell, or
 * padded repetition across every row means the answer was unusable and null drops the version.
 */
export function rebuildLines(original: string, answer: string): string | null {
  const lines = original.split(/\r?\n/);
  const rows = new Map<number, string>();
  for (const line of answer.split(/\r?\n/)) {
    const row = line.match(rowLine);
    if (!row) continue; // chatter, blanks and wrapped text never become row content
    const number = Number(row[1]);
    if (number >= 1 && number <= lines.length && row[2].trim() && !rows.has(number)) rows.set(number, row[2].trim());
  }
  const plain = (text: string) => text.replace(leadingMarker, '').replace(/\s+/g, ' ').trim();
  const kept = [...rows.values()].filter(text => !shellOnly(text)).map(plain).filter(Boolean);
  if (kept.length > 1 && new Set(kept.map(norm)).size === 1) return null; // padded repetition throughout
  const rebuilt = lines.map((line, index) => {
    if (!line.trim()) return line; // blank lines pass through; rows number every line
    const rewritten = rows.get(index + 1)?.trim() ?? '';
    if (!rewritten) return null; // a missing row fails the rescue
    const marker = line.match(/^\s*(?:\d+[.)]|[-*•])\s+/)?.[0] ?? '';
    // a marker-only shell carries no meaning: the original line's content wins
    const content = !shellOnly(rewritten) ? rewritten.replace(leadingMarker, '').trim() : line.slice(marker.length).trim();
    return marker + content.replace(leadingMarker, '');
  });
  if (rebuilt.some(line => line == null)) return null;
  return (rebuilt as string[]).join('\n');
}

// ---- 5.4 The dash rule: the writer's text and their own switch win ----

export const protectedTokens = /\S*(?:[/@#\d]|\.\p{L}{2,})\S*/gu;

/** Replace sentence dashes outside protected tokens; rewriting a token could break its address or identity. */
export function undash(text: string): string {
  return text.split(new RegExp(`(${protectedTokens.source})`, 'gu'))
    .map((part, index) => index % 2 ? part : part.replace(/ — |—| – /g, ', ')).join('');
}

/** Request undash when the switch is on or the writer's own text has no em dash; undash preserves protected tokens. */
export function dashDecision(noDashes: boolean, ownText: string): 'keep' | 'remove' {
  return !noDashes && ownText.includes('—') ? 'keep' : 'remove';
}

export const dashesFor = (rules: Rules, ownText: string): 'keep' | 'remove' => dashDecision(rules.noDashes, ownText);

// ---- 5.1 Replies ----

export const REPLY_SLOTS: [string, string, string] = CHAT_SLOTS;
export { slotsFor };

export type ScreenText = { text: string; left: number; top: number; bottom: number; clickable: boolean; viewId?: string | null; description?: string | null };

export function latestMessage(nodes?: ScreenText[], fieldTop?: number): string {
  if (fieldTop == null) return '';
  const candidates = (nodes ?? []).filter(node => !node.clickable && node.bottom <= fieldTop && node.text.trim())
    .sort((a, b) => b.bottom - a.bottom);
  const nearest = candidates[0];
  if (!nearest) return '';
  const lines = [nearest.text.trim()];
  let previous = nearest;
  for (const node of candidates.slice(1)) {
    const gap = previous.top - node.bottom;
    if (gap < 0 || gap > 24 || Math.abs(previous.left - node.left) > 16 || lines.join('\n').length >= 1500) break;
    lines.unshift(node.text.trim());
    previous = node;
  }
  const text = lines.join('\n');
  return text.length > 1500 ? `${text.slice(0, 1000)}\n(middle shortened)\n${text.slice(-500)}` : text;
}

/** `point`: the reply they already started (grow mode); the drafts start from it instead of replacing it. */
export type ReplyInput = { latest: string; conversation: string; point?: string; guide?: string; /** Identical selected samples for writer and fit; the phone prompts fit the shortest that hold. */ samples?: string[]; dashes: 'keep' | 'remove'; avoid?: string[]; platform?: Platform };

// ponytail: conversation keeps only its last 3000 characters; revisit if long-thread context is needed.
const inputBlock = ({ latest, conversation, point }: { latest: string; conversation: string; point?: string }) =>
  `${latest ? `Latest message:\n${latest}\n\n` : ''}Conversation:\n${conversation.slice(-3000)}${point ? `\n\nTheir reply so far:\n${point}` : ''}`;

const pointLine = (point?: string) => point ? 'Keep the main point of their reply so far (below); never send it back unchanged.' : '';

const dashLine = (dashes: 'keep' | 'remove') => dashes === 'keep' ? 'their dashes: keep' : 'their dashes: remove';

const avoidLine = (avoid?: string[]) => avoid?.length ? `Don't repeat these: ${avoid.map(a => a.replace(/\s+/g, ' ').trim()).filter(Boolean).join('; ')}.` : '';
export { avoidLine };

const slotList = (slots: string[]) => slots.map((slot, i) => `${i + 1}. ${slot}`).join('\n');

/** The C2 reply prompt (quality eval Appendix A): no blanks, every point answered, the dash rule, fixed slots. */
export function replyPrompt(input: ReplyInput & { slots?: string[] }): string {
  const slots = input.slots ?? slotsFor(input.platform);
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
    '- Use only times, dates and facts that appear on the screen or in their note. If the screen gives no time or date, never add one.',
    '- No "we" or "our" unless the screen or their note shows it.',
    platformLine(input.platform),
    pointLine(input.point),
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
const phoneReplyInstructions = (slots: [string, string, string]) => [
  'Write reply drafts from this screen.',
  'Every draft must respond to everything the latest message asks or offers.',
  'Draft 1:, Draft 2:, Draft 3:, each different:',
  slotList(slots),
  'If news, thanks or feelings, stay warm: 1 short, 2 adds a detail, 3 asks a question.',
  'Never invent facts, times or dates: use only the screen. A change reuses only screen times, else asks. Match their tone, short and plain. No flattery, hashtags, emoji or long dashes.',
].join('\n');

// The rules half of the selected guide (dash/ending rules, never-say phrases and the note) rides
// the phone prompt too, with the shortest samples that still hold the instruction budget after it,
// so a phrase the person banned never reaches a phone card. The rules win the room: samples drop
// before the rules do, and the rules only overrun the budget when they alone are longer than it.
const ruleBlock = (fixed: string, input: { guide?: string; samples?: string[] }): string => {
  const rules = rulesOnly(input.guide ?? '');
  if (!rules) {
    if (!input.samples?.length) return '';
    const line = selectExamples(input.samples, '', Math.max(0, MAX_GUIDE_LENGTH - fixed.length - 1)).line;
    return line ? `\n${line}` : '';
  }
  const line = selectExamples(input.samples ?? [], rules, Math.max(0, MAX_GUIDE_LENGTH - fixed.length - 1)).line;
  return `\n${line || rules}`;
};

/** The condensed phone prompt: instructions (≤ 700 characters) plus the input block. */
export function phoneReplyPrompt(input: Omit<ReplyInput, 'dashes' | 'avoid'>): string {
  const lines = [platformLine(input.platform), pointLine(input.point)].filter(Boolean).map(line => `\n${line}`).join('');
  const fixed = `${phoneReplyInstructions(slotsFor(input.platform))}${lines}`;
  return `${fixed}${ruleBlock(fixed, input)}\n\n${inputBlock(input)}`;
}

/** One extra call for one empty slot, with everything already shown as off-limits. */
export function phoneSlotPrompt(slot: string, input: Omit<ReplyInput, 'dashes' | 'avoid'>, avoid: string[]): string {
  const fixed = [
    'You write one reply for one person from their phone screen.',
    `The reply: ${slot}`,
    platformLine(input.platform),
    pointLine(input.point),
    'Every draft must respond to everything the latest message asks or offers.',
    avoidLine(avoid),
    'Don\'t invent facts about them; ask a short question back instead. Use only times, dates and facts on the screen: if it gives no time or date, never add one. If you suggest a different time, use only one from the screen, otherwise ask when suits them. Match their language and tone; plain words, short sentences. No flattery openers, hashtags, emoji or long dashes.',
  ].filter(Boolean).join('\n');
  const out = 'Output only the reply text.';
  return `${fixed}${ruleBlock(`${fixed}\n${out}`, input)}\n${out}\n\n${inputBlock(input)}`;
}

/** ChatGPT's one-slot retry: the C2 template narrowed to a single slot plus the avoid list. */
export function replySlotPrompt(slot: string, input: ReplyInput): string {
  return replyPrompt({ ...input, slots: [slot] });
}

export function stripControlLines(text: string, controls: string[]): string {
  const labels = new Set(controls.map(label => label.trim()).filter(Boolean));
  return text.split(/\r?\n/).filter(line => !labels.has(line.trim())).join('\n').trim();
}

/** An echo only re-capitalises or re-punctuates the user's line, so it is never a draft. */
export const echoKey = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

export function acceptReplies(candidates: string[], exclude: string[], count = 3, dashes: 'keep' | 'remove' = 'remove', controls: string[] = [], never: string[] = [], point = ''): (string | null)[] {
  const accepted: (string | null)[] = Array(count).fill(null);
  // A card that still uses a never-say phrase is dropped, so the caller's existing per-slot retry
  // asks once more; a second break stays empty (the bottom-level check remains the backstop).
  const banned = never.map(p => p.trim()).filter(Boolean);
  const breaks = (text: string) => banned.some(p => matcher(p).test(text));
  // A card that only echoes their line (Main765: 'shipping offline notes' came back as
  // 'Shipping offline notes') is dropped the same way, so the same retry re-asks once.
  const echo = echoKey(point);
  const echoes = (text: string) => echo.length > 0 && echoKey(text) === echo;
  let next = 0;
  const accept = (text: string, slot: number) => {
    if (slot >= count || accepted[slot]) return;
    const clean = stripControlLines(text, controls);
    const draft = dashes === 'remove' ? undash(clean) : clean;
    if (!draft || breaks(draft) || echoes(draft)) return;
    if (fresh(draft, [...exclude, ...accepted.filter((value): value is string => !!value)])) accepted[slot] = draft;
  };
  for (const candidate of candidates) {
    const source = body(unquote(candidate), false);
    const markers = [...source.matchAll(replyLabels)];
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
  // Set when a version came back as their own text; with nothing else shown, that is "looks good as it is".
  let unchanged = false;
  const flat = (value: string) => value.replace(/\r\n/g, '\n').split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim()).join('\n').trim();
  const same = (text: string) => { if (flat(text) === flat(original)) unchanged = true; };
  const clean = (text: string) => (dashes === 'remove' ? undash(text) : text).trim();
  const distinct = (text: string) => flat(text) !== flat(original) && fresh(text, [...shown, ...avoid]);
  const usable = (text: string) => distinct(text) && layoutKept(original, text) && numbersAndTimesKept(original, text);
  return {
    results,
    layoutFails,
    /** True when nothing was shown and at least one version was their text unchanged. */
    get unchanged() { return unchanged && !results.length; },
    /** Cheap checks while the version lands; returns the text to show, or null when dropped or queued for a layout fix. */
    accept(text: string, slot: number, label?: string): string | null {
      same(text);
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
      same(text);
      const version = clean(text);
      if (!version || !usable(version)) return null;
      shown.push(version);
      results.push({ text: version, slot, label });
      return version;
    },
  };
}

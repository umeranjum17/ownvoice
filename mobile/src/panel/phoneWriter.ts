import Native from '../../modules/ownvoice-native';
import { message } from '../core/nano';
import type { DraftRequest, Writer } from '../core/writers';

const count = 3;
const numbered = /(?:^|\s)(?:(?:draft|option|version)\s*)?([1-3])[.):]\s+/gi;
const labelled = /(?:^|\s)(?:draft|option|version)\s*[1-3][.):]\s*/gi;

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

export function cleanDrafts(candidates: string[], limit = count, polishing = false) {
  const drafts: string[] = [];
  for (const candidate of candidates) {
    for (const part of parts(candidate, polishing)) {
      const draft = unquote(body(unquote(part.trim().replace(/^(?:draft|option|version)\s*[1-3][.):]\s*/i, '')), polishing));
      const key = draft.toLowerCase().replace(/\s+/g, ' ');
      if (draft && !drafts.some(value => value.toLowerCase().replace(/\s+/g, ' ') === key)) drafts.push(draft);
      if (drafts.length === limit) return drafts;
    }
  }
  return drafts;
}

function prompt({ conversation, typed, guide }: DraftRequest) {
  const rules = guide ? ` Follow their rules: ${guide}` : '';
  return typed.trim()
    ? `Improve this message someone wrote on their phone. Return exactly one short natural version, in the same language and tone. Do not give alternatives.${rules} Output only the message text.\n\nTheir message:\n${typed}`
    : `You help someone reply in a chat.\nWrite exactly one short, natural reply to the latest message, in the conversation's language and tone. Use only the facts shown; don't invent details or give alternatives.${rules} Output only the reply text.\n\nConversation:\n${conversation.slice(-3000)}`;
}

async function fallback(promptText: string, drafts: string[], polishing: boolean) {
  let failure: unknown;
  for (let version = drafts.length; version < count; version++) {
    let text: string;
    try {
      text = await Native.ask(`phone-draft-${Date.now()}-${version}`, `${promptText}\n\nReturn a different version from the other replies: ${version + 1}. Return only one message, with no preamble, quotes, or numbering.`, { maxTokens: 120 });
    } catch (error) {
      failure ??= error;
      continue;
    }
    const [draft] = cleanDrafts([text], 1, polishing);
    if (draft && !drafts.some(value => value.toLowerCase().replace(/\s+/g, ' ') === draft.toLowerCase().replace(/\s+/g, ' '))) drafts.push(draft);
  }
  if (!drafts.length && failure) throw failure;
  return drafts;
}

export const phoneWriter = {
  async write(request: DraftRequest, onState: (state: 'downloading' | 'writing') => void = () => {}) {
    try {
      if (await Native.modelStatus() !== 'available') {
        onState('downloading');
        await Native.downloadModel();
      }
      onState('writing');
      const promptText = prompt(request);
      const polishing = !!request.typed.trim();
      const drafts = cleanDrafts(await Native.drafts(promptText, { candidates: count, maxTokens: 120 }), count, polishing);
      const result = drafts.length === count ? drafts : await fallback(promptText, drafts, polishing);
      if (!result.length) throw new Error('-107');
      return result;
    } catch (error) {
      const code = Number(String(error).match(/(?:^|\D)(-?\d{1,3})(?:\D|$)/)?.[1]);
      throw new Error(message(Number.isFinite(code) ? code : -107));
    }
  },
} satisfies Writer;

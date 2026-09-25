import Native from '../../modules/ownvoice-native';
import { message } from '../core/nano';
import type { DraftRequest, Writer } from '../core/writers';

const count = 3;
const numbered = /(?:^|\s)(?:(?:draft|option|version)\s*)?([1-3])[.):]\s+/gi;
const labelled = /(?:^|\s)(?:draft|option|version)\s*[1-3][.):]\s*/gi;

function body(text: string) {
  const lines = text.trim().split(/\r?\n/);
  const first = lines[0]?.trim() ?? '';
  if (/^(?:(?:okay|sure)[,!.]?\s*)?(?:here (?:are|is)|these are|below are)\b[^:]*\b(?:versions?|options?|drafts?)\b\s*:|^here(?:'s| is) (?:a|the|your) reply\s*:/i.test(first)) {
    const colon = first.indexOf(':');
    lines[0] = colon < 0 ? '' : first.slice(colon + 1).trim();
  }
  return lines.join('\n').trim();
}

function parts(text: string) {
  const value = body(text);
  const explicit = /\b(?:versions?|options?|drafts?)\b/i.test(text.split(/\r?\n/, 1)[0]) && value !== text.trim();
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
  return [value];
}

export function cleanDrafts(candidates: string[], limit = count) {
  const drafts: string[] = [];
  for (const candidate of candidates) {
    for (const part of parts(candidate)) {
      const standalone = (candidates.length > 1 || limit === 1) && [...part.matchAll(numbered)].length === 1;
      const draft = (standalone ? part.replace(/^\s*[1-3][.):]\s+/, '') : part).trim()
        .replace(/^\s*(?:draft|option|version)\s*[1-3][.):]\s*/i, '')
        .replace(/^"([\s\S]*)"$/, '$1').replace(/^“([\s\S]*)”$/, '$1')
        .replace(/^'([\s\S]*)'$/, '$1').replace(/^‘([\s\S]*)’$/, '$1').trim();
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

async function fallback(promptText: string, drafts: string[]) {
  for (let version = drafts.length; version < count; version++) {
    let text: string;
    try {
      text = await Native.ask(`phone-draft-${Date.now()}-${version}`, `${promptText}\n\nReturn a different version from the other replies: ${version + 1}. Return only one message, with no preamble, quotes, or numbering.`, { maxTokens: 120 });
    } catch (error) {
      if (!drafts.length) throw error;
      break;
    }
    const [draft] = cleanDrafts([text], 1);
    if (draft && !drafts.some(value => value.toLowerCase().replace(/\s+/g, ' ') === draft.toLowerCase().replace(/\s+/g, ' '))) drafts.push(draft);
  }
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
      const drafts = cleanDrafts(await Native.drafts(promptText, { candidates: count, maxTokens: 120 }));
      const result = drafts.length === count ? drafts : await fallback(promptText, drafts);
      if (!result.length) throw new Error('-107');
      return result;
    } catch (error) {
      const code = Number(String(error).match(/(?:^|\D)(-?\d{1,3})(?:\D|$)/)?.[1]);
      throw new Error(message(Number.isFinite(code) ? code : -107));
    }
  },
} satisfies Writer;

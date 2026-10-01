// OV-3: the one JSON surface over the pure core (protocol 2). Model-free:
// every verb reuses the existing slop/voice/drafts/platforms/threads
// functions; nothing here fetches, calls a model, or imports expo,
// react-native or @byokit. Plain JSON in, plain JSON out.
import { addedNumbers, hits, inventedTimes, NO_RULES, score, words as slopWords, type Rules } from './slop.ts';
import { MAX_MARKDOWN_LENGTH, normalizeSamples } from './samples.ts';
import { broken, guide, parse, type Found } from './voice.ts';
import { layoutKept, slotsFor } from './drafts.ts';
import { platformForApp, platformLine, polishLine, type Platform } from './platforms.ts';
import { splitThread, threadLimit } from './threads.ts';

/** Bump with packages/engine/package.json (protocol.test.mjs enforces it). */
export const VERSION = '0.2.0';
export const PROTOCOL = 2;

export const hello = () => ({ protocol: PROTOCOL, version: VERSION });

export type ErrorCode = 'bad-request' | 'unknown-verb' | 'internal';
export type ErrorEnvelope = { error: { code: string; message: string } };
export const err = (code: ErrorCode, message: string): ErrorEnvelope => ({ error: { code, message } });

// The six platforms the JSON surface knows, keyed by platform id. Built
// through platformForApp so the phone's package-name table stays the one
// copy (platformForApp itself stays for the phone).
const APPS: Record<string, string> = {
  x: 'com.twitter.android',
  linkedin: 'com.linkedin.android',
  reddit: 'com.reddit.frontpage',
  slack: 'com.Slack',
  whatsapp: 'com.whatsapp',
  gmail: 'com.google.android.gm',
};
export const PLATFORM_IDS = Object.keys(APPS);
const byId = (id: string): Platform | null => {
  const app = APPS[id];
  return app ? platformForApp(app) : null;
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Partial rules from JSON, defaulting missing fields from NO_RULES. */
function asRules(v: unknown): Rules | null {
  if (v === undefined) return { ...NO_RULES };
  if (!isRecord(v)) return null;
  const { never, noDashes, statementEndings, note, samples } = v;
  if (never !== undefined && (!Array.isArray(never) || !never.every(s => typeof s === 'string'))) return null;
  if (noDashes !== undefined && typeof noDashes !== 'boolean') return null;
  if (statementEndings !== undefined && typeof statementEndings !== 'boolean') return null;
  if (note !== undefined && typeof note !== 'string') return null;
  const normalized = normalizeSamples(samples);
  if (normalized === null) return null;
  return {
    samples: normalized,
    never: never !== undefined ? (never as string[]) : [],
    noDashes: noDashes !== undefined ? (noDashes as boolean) : false,
    statementEndings: statementEndings !== undefined ? (statementEndings as boolean) : false,
    note: note !== undefined ? (note as string) : '',
  };
}

function asPlatform(v: unknown): Platform | null {
  return typeof v === 'string' ? byId(v) : null;
}

export type BriefKind = 'reply' | 'polish' | 'post' | 'thread';

function briefLines(kind: BriefKind, platform: Platform, rules: Rules): string[] {
  const place = [platformLine(platform), polishLine(platform)].filter(Boolean);
  switch (kind) {
    case 'reply':
      // The dash rule needs the writer's own text, which brief doesn't take;
      // the caller appends it like replyPrompt does.
      return [...slotsFor(platform), ...place, guide(rules, false)].filter(Boolean);
    case 'polish':
      return [...place, guide(rules, false)].filter(Boolean);
    case 'post':
    case 'thread':
      return [...place, guide(rules, true)].filter(Boolean);
  }
}

export type CheckResult = {
  fits: boolean; length: number; limit: number | null;
  voice: string[]; stock: string[]; added: string[]; dropped: string[];
  layoutKept: boolean; words: string;
};

function checkOne(draft: string, platform: Platform, rules: Rules, original?: string): CheckResult {
  const found = hits(draft, rules, platform.kind === 'feed');
  const seen = new Set<string>();
  const stock: string[] = [];
  for (const h of found) {
    if (h.reason !== 'a phrase people say to anyone') continue;
    const phrase = draft.slice(h.start, h.end).trim();
    const key = phrase.toLowerCase();
    if (phrase && !seen.has(key)) { seen.add(key); stock.push(phrase); }
  }
  return {
    fits: platform.limit == null || draft.length <= platform.limit,
    length: draft.length,
    limit: platform.limit,
    voice: broken(found, draft, rules),
    stock,
    added: original !== undefined ? [...new Set([...addedNumbers(original, draft), ...inventedTimes(original, draft)])] : [],
    dropped: original !== undefined ? addedNumbers(draft, original) : [],
    layoutKept: original !== undefined ? layoutKept(original, draft) : true,
    words: slopWords(score(found.length, null, null)),
  };
}

/** One JSON request in, one JSON response out; bad input gets the error envelope. */
export function handle(request: unknown): Record<string, unknown> | unknown[] | ErrorEnvelope {
  if (!isRecord(request) || typeof request.verb !== 'string') return err('bad-request', 'request needs a verb');
  const req = request as Record<string, unknown>;
  switch (req.verb) {
    case 'voice.parse': {
      if (typeof req.markdown !== 'string' || req.markdown.length > MAX_MARKDOWN_LENGTH) return err('bad-request', 'voice.parse needs {markdown}');
      const found: Found = parse(req.markdown);
      return { rules: { never: found.never, noDashes: found.noDashes, statementEndings: found.statementEndings, note: '', samples: found.samples }, skipped: found.skipped };
    }
    case 'voice.guide': {
      const rules = asRules(req.rules);
      if (!rules) return err('bad-request', 'voice.guide rules must be {never?, noDashes?, statementEndings?, note?, samples?}');
      const post = req.post === undefined ? false : req.post;
      if (typeof post !== 'boolean') return err('bad-request', 'voice.guide post must be a boolean');
      return { line: guide(rules, post) };
    }
    case 'platforms': {
      return PLATFORM_IDS.map(id => {
        const p = byId(id)!;
        return { id: p.id, label: p.label, kind: p.kind, limit: p.limit, slots: p.slots, polish: p.polish };
      });
    }
    case 'brief': {
      if (req.kind !== 'reply' && req.kind !== 'polish' && req.kind !== 'post' && req.kind !== 'thread')
        return err('bad-request', 'brief needs kind reply|polish|post|thread');
      const platform = asPlatform(req.platform);
      if (!platform) return err('bad-request', `brief platform must be one of ${PLATFORM_IDS.join(', ')}`);
      const rules = asRules(req.rules);
      if (!rules) return err('bad-request', 'brief rules must be {never?, noDashes?, statementEndings?, note?, samples?}');
      return { lines: briefLines(req.kind, platform, rules) };
    }
    case 'check': {
      if (!Array.isArray(req.drafts) || !req.drafts.length || !req.drafts.every(d => typeof d === 'string'))
        return err('bad-request', 'check needs a non-empty drafts[] of strings');
      const platform = asPlatform(req.platform);
      if (!platform) return err('bad-request', `check platform must be one of ${PLATFORM_IDS.join(', ')}`);
      const rules = asRules(req.rules);
      if (!rules) return err('bad-request', 'check rules must be {never?, noDashes?, statementEndings?, note?, samples?}');
      if (req.original !== undefined && typeof req.original !== 'string')
        return err('bad-request', 'check original must be a string');
      return (req.drafts as string[]).map(d => checkOne(d, platform, rules, req.original as string | undefined));
    }
    case 'split': {
      if (typeof req.text !== 'string') return err('bad-request', 'split needs {text, platform}');
      const platform = asPlatform(req.platform);
      if (!platform) return err('bad-request', `split platform must be one of ${PLATFORM_IDS.join(', ')}`);
      const limit = threadLimit(platform);
      if (limit == null) return err('bad-request', 'split needs a feed platform (x, linkedin, reddit)');
      return { posts: splitThread(req.text, limit) };
    }
    default:
      return err('unknown-verb', `unknown verb ${(request as Record<string, unknown>).verb}`);
  }
}

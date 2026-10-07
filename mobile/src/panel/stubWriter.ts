import type { Choice, DraftRequest, Writer, WriterEvents } from '../core/writers';
import { words } from '../core/words';
// Demo fixture drafts live in their own module so normal bundles carry none of them: the
// constant-false branch drops the require (as app/agent.tsx drops the lab screen).
const demoStubs = process.env.EXPO_PUBLIC_DEMO_PLATFORM === '1' ? require('./demoStubs') as typeof import('./demoStubs') : null;

// Fixed drafts with delays, for Panel tests and the emulator screenshot build (spec section 6:
// "stub writer for fixed texts"). Never wired into the app's default writer; it never talks to a model.

export const STUB_REPLIES = [
  'Yes, still on! I can bring the stove if you get the tent.',
  'Saturday is tricky for me. Could we do Sunday instead? I can still bring the stove.',
  'Count me in for Saturday! Should I bring anything besides the stove?',
];

export const STUB_VERSIONS = [
  'Cleaned up',
  'Shorter',
  'Main point first',
] as const;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export type StubOptions = { delay?: number; download?: boolean; fail?: boolean; empty?: boolean; declined?: boolean; unchanged?: boolean; drafts?: string[] };

/** A Writer with fixed, deterministic output. Versions derive from the typed text so the
 *  number-check meaning line can fire (a version drops the list and its numbers). */
export const stubWriter = (options: StubOptions = {}): Writer => ({
  async write(request: DraftRequest, on: WriterEvents = {}): Promise<Choice> {
    // Grow-mode captures on the demo fixture get their own fixed drafts, keyed to the fixture post.
    const demo = demoStubs?.demoDrafts(request.conversation);
    if (demo && !request.typed.trim() && !options.drafts) {
      await wait(options.delay ?? 200);
      demo.forEach((text, slot) => on.landed?.(text, slot));
      return { drafts: demo };
    }
    if (options.fail) { await wait(options.delay ?? 200); throw new Error(words.unsupported); }
    if (options.download) {
      on.state?.('downloading');
      on.fraction?.(0.42);
      await wait(options.delay ?? 400);
    }
    on.state?.('writing');
    await wait(options.delay ?? 200);
    if (options.empty) return { drafts: [] };
    if (options.declined) return { drafts: [], declined: true };
    if (options.unchanged) return { drafts: [], unchanged: true };
    const typed = request.typed.trim();
    if (!typed && options.drafts) {
      options.drafts.forEach((text, slot) => on.landed?.(text, slot));
      return { drafts: [...options.drafts] };
    }
    if (!typed) {
      STUB_REPLIES.forEach((text, slot) => on.landed?.(text, slot));
      return { drafts: [...STUB_REPLIES] };
    }
    const lines = typed.split(/\r?\n/).filter(line => line.trim());
    const lead = typed.charAt(0).toUpperCase() + typed.slice(1);
    const versions = lines.length > 1 ? [
      lines[0],
      lines.slice(-1)[0],
      [...lines.slice(-1), ...lines.slice(0, -1)].join('\n'),
    ] : [
      lead.endsWith('.') ? lead : `${lead}.`,
      `${lead.split(',')[0]}.`,
      `Just to confirm, ${typed.charAt(0).toLowerCase()}${typed.slice(1)}.`,
    ];
    versions.forEach((text, slot) => on.landed?.(text, slot, STUB_VERSIONS[slot]));
    return { drafts: versions };
  },
});

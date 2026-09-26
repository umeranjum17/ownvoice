import type { Choice, DraftRequest, Writer, WriterEvents } from '../core/writers';
import { words } from '../core/words';

// Fixed drafts with delays, for Panel tests and the emulator screenshot build (spec section 6:
// "stub writer for fixed texts"). Never wired into the app's default writer; it never talks to a model.

export const STUB_REPLIES = [
  'Yes, still on! I can bring the stove if you get the tent.',
  'Saturday works. You bring the tent, I have the stove covered.',
  'Count me in for Saturday! Should I bring anything besides the stove?',
];

export const STUB_VERSIONS = [
  'Cleaned up',
  'Shorter',
  'Main point first',
] as const;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export type StubOptions = { delay?: number; download?: boolean; fail?: boolean; empty?: boolean };

/** A Writer with fixed, deterministic output. Versions derive from the typed text so the
 *  number-check meaning line can fire (a version drops the list and its numbers). */
export const stubWriter = (options: StubOptions = {}): Writer => ({
  async write(request: DraftRequest, on: WriterEvents = {}): Promise<Choice> {
    if (options.fail) { await wait(options.delay ?? 200); throw new Error(words.unsupported); }
    if (options.download) {
      on.state?.('downloading');
      on.fraction?.(0.42);
      await wait(options.delay ?? 400);
    }
    on.state?.('writing');
    await wait(options.delay ?? 200);
    if (options.empty) return { drafts: [] };
    const typed = request.typed.trim();
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

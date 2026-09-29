import type { Rules } from '../core/slop';
import { guide } from '../core/voice';

const BASE = "You help one person write. Draft, revise to the tone they ask for, and call `check_voice` on the final draft with the task's facts as `original`. Fix whatever it reports. When they asked for something to share, call `share_note` once with the finished text. You can't send email, post, message or change calendars; say so in one sentence and offer to share the note.";

/** The fixed loop instructions plus the person's own writing rules. */
export function instructions(rules: Rules): string {
  const g = guide(rules, false);
  return g ? `${BASE} ${g}` : BASE;
}

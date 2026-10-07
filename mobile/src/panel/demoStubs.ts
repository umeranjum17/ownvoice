// Demo-only reply drafts for the grow-mode captures (dev.ownvoice.demo fixture). This module is
// required only when EXPO_PUBLIC_DEMO_PLATFORM=1 (a constant-false branch otherwise, as
// app/agent.tsx drops the lab screen), so no normal bundle carries the fixture handle.
import type { DraftRequest } from '../core/writers';

/** Fixture author handle; also the flag-cache.sh sentinel proving demo builds carry the drafts. */
export const DEMO_MARK = 'demo_maker_example';

const X_DRAFTS = [
  'Week 12 is the one I would use. Does it pause when you switch apps, or keep counting?',
  'Same here. My timer keeps running while I make tea, so focused minutes would read lower and honest.',
  'Love this! So inspiring.',
];

const REDDIT_DRAFTS = [
  'Congrats on the launch! What keeps the timer honest when the screen is off?',
  'I track focused minutes in a notebook and it works fine.',
  'Same, my timer app is at https://umerdemo.example.com if you want a look.',
];

/** The fixture's three stub drafts when the screen shows a demo page, else null. */
export function demoDrafts(conversation: string): string[] | null {
  if (!conversation.includes(DEMO_MARK)) return null;
  return /reddit-style/i.test(conversation) ? [...REDDIT_DRAFTS] : [...X_DRAFTS];
}

/** True when this request is a demo capture (used only for proof logging). */
export function isDemoRequest(request: DraftRequest): boolean {
  return request.conversation.includes(DEMO_MARK);
}

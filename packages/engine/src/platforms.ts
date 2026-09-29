// Platform awareness (parity packages 1+2): which app the bubble floats over, so
// replies, polish and the length check respect that place's cap and style. Plain data
// only: no platform API, nothing leaves the phone, the person still sends.
export type PlatformKind = 'chat' | 'feed' | 'mail';
export type Platform = { id: string; label: string; kind: PlatformKind; limit: number | null; slots: [string, string, string]; polish: string };

/** Today's 3 reply slots (chat); WhatsApp and unknown apps keep these. */
export const CHAT_SLOTS: [string, string, string] = [
  'Say yes or agree, and answer each point.',
  'Give a different answer: decline or suggest a change, kindly, still answering each point.',
  'Not sure yet: a short honest reply that asks the one thing needed to decide.',
];

const X: Platform = { id: 'x', label: 'X', kind: 'feed', limit: 280,
  slots: [
    'Agree and add one concrete detail from the post.',
    'Push back kindly, with one reason from the post.',
    'Ask one sharp question about the post.',
  ],
  polish: 'Open with the most concrete detail already in it; the first line must stand alone.', };
// Free posts hold 280; Premium allows 25,000, so the check keeps the free bound
// everyone can send. https://wordcountr.app/blog/twitter-character-limit
const LINKEDIN: Platform = { id: 'linkedin', label: 'LinkedIn', kind: 'feed', limit: 3000,
  slots: [
    'Agree and add one concrete example from the screen.',
    'Offer a respectful counterpoint, with one reason.',
    'Ask one follow-up question.',
  ],
  polish: 'Open with the most concrete detail already in it; keep paragraphs short.', };
// LinkedIn Help: "The character limit for a post is 3,000 characters."
// https://www.linkedin.com/help/linkedin/answer/a528176
const REDDIT: Platform = { id: 'reddit', label: 'Reddit', kind: 'feed', limit: 10000,
  slots: [
    'Answer with specifics from the thread.',
    'Disagree with a reason from the thread.',
    'Ask for the one detail needed.',
  ],
  polish: 'A title stays on one line and stays short.', };
// Comments hold 10,000, bodies 40,000, titles 300; drafts here are replies and
// comments, so the check keeps the comment bound (the title writer is package 2).
// https://www.reddit.com/r/NewToReddit/comments/15qvg7c/post_limits/
const SLACK: Platform = { id: 'slack', label: 'Slack', kind: 'chat', limit: 40000,
  slots: [
    'Confirm and name the next step.',
    'Flag the blocker and what is needed.',
    'Ask what is still unclear.',
  ],
  polish: 'Casual and brief; keep the bullets; no greeting and no sign-off.', };
// Slack truncates the text field past 40,000. https://docs.slack.dev/changelog/2018-truncating-really-long-messages
const WHATSAPP: Platform = { id: 'whatsapp', label: 'WhatsApp', kind: 'chat', limit: 65536,
  slots: CHAT_SLOTS,
  polish: 'Casual; lowercase is fine; keep any emoji.', };
// WhatsApp messages hold 65,536.
const GMAIL: Platform = { id: 'gmail', label: 'Gmail', kind: 'mail', limit: null,
  slots: [
    'Accept clearly, with the key detail.',
    'Decline kindly, with a reason.',
    'Ask what is needed to decide.',
  ],
  polish: 'Keep the greeting and the sign-off.', };
// Mail has no cap worth checking; the length check skips it.

/** Unknown apps keep today's behaviour: the flat 280 post rule and the 3 chat slots. */
export const DEFAULT_PLATFORM: Platform = { id: 'default', label: '', kind: 'feed', limit: 280, slots: CHAT_SLOTS, polish: '' };

/** Package names match OwnvoiceService DEFAULT_ON. */
export function platformForApp(app?: string | null): Platform {
  switch (app) {
    case 'com.twitter.android': return X;
    case 'com.linkedin.android': return LINKEDIN;
    case 'com.reddit.frontpage': return REDDIT;
    case 'com.Slack': return SLACK;
    case 'com.whatsapp':
    case 'com.whatsapp.w4b': return WHATSAPP;
    case 'com.google.android.gm': return GMAIL;
    default: return DEFAULT_PLATFORM;
  }
}

/** The 3 reply slots for one platform; every triple stays plain words. */
export function slotsFor(platform?: Platform | null): [string, string, string] {
  return platform?.slots ?? CHAT_SLOTS;
}

/** Every slot line across platforms, for the eval's echoes-instructions check. */
export const ALL_SLOTS: string[] = [...new Set([
  ...X.slots, ...LINKEDIN.slots, ...REDDIT.slots, ...SLACK.slots, ...WHATSAPP.slots, ...GMAIL.slots,
])];

/** One extra polish rule for the place, or '' when it needs none. */
export function polishLine(platform?: Platform | null): string {
  return platform?.polish ?? '';
}

/** One context line for the reply and polish prompts; empty for unknown apps and
 *  mail, so those prompts read exactly as before. Kept short for the phone prompt's
 *  instruction budget. */
export function platformLine(platform?: Platform | null): string {
  if (!platform || platform.id === 'default' || platform.limit == null) return '';
  const one = platform.kind === 'feed' ? 'one post' : 'one message';
  return `On ${platform.label}: each draft fits ${one} (${platform.limit}).`;
}

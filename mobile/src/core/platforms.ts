// Platform awareness (parity package 1): which app the bubble floats over, so
// replies, polish and the length check respect that place's cap. Plain data only:
// no platform API, no new styles here (those are package 2).
export type PlatformKind = 'chat' | 'feed' | 'mail';
export type Platform = { id: string; label: string; kind: PlatformKind; limit: number | null };

const X: Platform = { id: 'x', label: 'X', kind: 'feed', limit: 280 };
// Free posts hold 280; Premium allows 25,000, so the check keeps the free bound
// everyone can send. https://wordcountr.app/blog/twitter-character-limit
const LINKEDIN: Platform = { id: 'linkedin', label: 'LinkedIn', kind: 'feed', limit: 3000 };
// LinkedIn Help: "The character limit for a post is 3,000 characters."
// https://www.linkedin.com/help/linkedin/answer/a528176
const REDDIT: Platform = { id: 'reddit', label: 'Reddit', kind: 'feed', limit: 10000 };
// Comments hold 10,000, bodies 40,000, titles 300; drafts here are replies and
// comments, so the check keeps the comment bound (the title writer is package 2).
// https://www.reddit.com/r/NewToReddit/comments/15qvg7c/post_limits/
const SLACK: Platform = { id: 'slack', label: 'Slack', kind: 'chat', limit: 40000 };
// Slack truncates the text field past 40,000. https://docs.slack.dev/changelog/2018-truncating-really-long-messages
const WHATSAPP: Platform = { id: 'whatsapp', label: 'WhatsApp', kind: 'chat', limit: 65536 };
// WhatsApp messages hold 65,536.
const GMAIL: Platform = { id: 'gmail', label: 'Gmail', kind: 'mail', limit: null };
// Mail has no cap worth checking; the length check skips it.

/** Unknown apps keep today's behaviour: the flat 280 post rule. */
export const DEFAULT_PLATFORM: Platform = { id: 'default', label: '', kind: 'feed', limit: 280 };

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

/** One context line for the reply and polish prompts; empty for unknown apps and
 *  mail, so those prompts read exactly as before. Kept short for the phone prompt's
 *  instruction budget. */
export function platformLine(platform?: Platform | null): string {
  if (!platform || platform.id === 'default' || platform.limit == null) return '';
  const one = platform.kind === 'feed' ? 'one post' : 'one message';
  return `On ${platform.label}: each draft fits ${one} (${platform.limit}).`;
}

// Prefill hand-off (parity package 6): open the person's own app with their
// polished text already in the box. Ownvoice never posts or sends: every path
// below lands on a compose screen (or the share sheet) and the person presses
// Post or Send themselves.
import type { Platform } from './platforms.ts';
import { words } from './words.ts';

export type PrefillDest = 'x' | 'whatsapp' | 'reddit' | 'share';
export type Prefill = { dest: PrefillDest; label: string };

/** Which hand-off one place gets: its own compose link, else the share sheet. */
export function prefillFor(platform?: Platform | null): Prefill {
  switch (platform?.id) {
    case 'x': return { dest: 'x', label: words.openInX };
    case 'whatsapp': return { dest: 'whatsapp', label: words.openInWhatsapp };
    case 'reddit': return { dest: 'reddit', label: words.openInReddit };
    default: return { dest: 'share', label: words.shareText };
  }
}

/** The compose URL for one destination, or null for the share sheet (the
 *  caller opens it with Linking, or Share.share when null). Pure so the eval
 *  runner (plain node) and Jest can both use it. */
export function prefillUrl(dest: PrefillDest, text: string): string | null {
  const body = encodeURIComponent(text);
  switch (dest) {
    // X Web Intent: the documented compose link; the app or the site opens it
    // with the text in the box, unsent. https://developer.x.com/en/docs/x-for-websites
    case 'x': return `https://twitter.com/intent/tweet?text=${body}`;
    // WhatsApp click-to-chat with no number: the person picks the chat and the
    // text lands in the box, unsent. https://faq.whatsapp.com/5913398998672934
    case 'whatsapp': return `https://wa.me/?text=${body}`;
    // Reddit's submit page reads the title and text off the URL, the same shape
    // its share buttons use; the person picks the place and presses Post.
    case 'reddit': return `https://www.reddit.com/submit?title=&text=${body}`;
    default: return null;
  }
}

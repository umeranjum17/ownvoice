// Host check (no model): a phone card that echoes the slot instructions never shows. Feeds the
// run-7 echo through the real acceptor and asserts no accepted card holds slot text or a numbered list.
// Usage: node --experimental-strip-types e2e/phone-echo-guard.mjs
import { acceptReplies } from '../../packages/engine/src/drafts.ts';
import { platformForApp } from '../../packages/engine/src/platforms.ts';

const slots = platformForApp('com.twitter.android').slots;
const point = 'honestly no worries, take your time';
const echo = [
  '1. Agree and add one concrete detail from the post.',
  '2. Push back kindly, with one reason from the post.',
  '3. Ask one sharp question about the post.',
  'Replying to Umer Demo',
  'I understand your apologies for being offline last week.',
].join('\n');
const lowerEcho = 'great point, thanks.\nagree and add one concrete detail from the post.';
const preamble = 'Sure, here’s a sharp question about the post: How did work get in the way of your notes this week?';
const clean = 'honestly, let\'s push the call to friday. my morning is full.';
const sureReply = 'Sure, see you then.';
const cards = acceptReplies([preamble, echo, lowerEcho], [], 3, 'remove', [], [], point, slots);
const drafts = acceptReplies([clean], [], 3, 'remove', [], [], point, slots);

const failures = [];
for (const card of cards.filter(Boolean)) {
  if (/(^|\n)\s*\d\.\s/.test(card)) failures.push(`numbered list shown: ${card.slice(0, 60)}`);
  if (slots.some(slot => card.toLowerCase().includes(slot.toLowerCase()))) failures.push(`slot text shown: ${card.slice(0, 60)}`);
  if (card.includes('How did work get in the way')) failures.push(`preamble shown: ${card.slice(0, 60)}`);
}
if (!drafts.some(Boolean)) failures.push('a clean draft was dropped');
if (!acceptReplies([sureReply], [], 3, 'remove', [], [], point, slots).some(Boolean)) failures.push('a plain Sure reply was dropped');
for (const f of failures) console.log(`FAIL: ${f}`);
console.log(failures.length ? `ECHO GUARD FAILED: ${failures.length}` : `ECHO GUARD OK: echo cards=${cards.filter(Boolean).length}, clean kept=${drafts.filter(Boolean).length}`);
process.exit(failures.length ? 1 : 0);

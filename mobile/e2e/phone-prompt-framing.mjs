// Host check (no model): renders the phone writer's prompt for the five captured posts through the
// real engine and asserts the reply framing and the note survive. Usage:
//   node --experimental-strip-types e2e/phone-prompt-framing.mjs [out-dir]
// Writes the rendered prompts to out-dir when given. Exit 1 when a framing line is missing.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { phoneReplyPrompt } from '../../packages/engine/src/drafts.ts';
import { selectedGuide } from '../../packages/engine/src/voice.ts';

const POSTS = [
  'Sorry I dropped the ball on the notes this week, work got away from me.',
  'Hey, did you ever send the revised plan? I need it before Thursday.',
  'Sorry for the late reply, I was offline most of last week.',
  'Can we push the call to Friday? My morning is full.',
  'I forgot to send the invoice again, sorry. It goes out today.',
];
const POINT = 'honestly no worries, take your time';
const guide = selectedGuide({ noDashes: false, statementEndings: false, never: ['no worries'], note: 'lowercase, blunt', samples: [] }, false).line;
const checks = [
  ['framing: the user replies to the sender', /Write the user's reply to the sender\./],
  ['never-say rule rides the prompt', /Never use: "no worries"\./],
  ['note rides the prompt', /How they write: lowercase, blunt/],
  ['style examples ride the prompt', /Made-up replies in their style/],
];

const out = process.argv[2] ? resolve(process.argv[2]) : null;
if (out) mkdirSync(out, { recursive: true });
let failed = 0;
for (const [i, post] of POSTS.entries()) {
  const prompt = phoneReplyPrompt({ latest: post, conversation: post, point: POINT, guide, samples: [], dashes: 'remove', platform: 'x' });
  if (out) writeFileSync(resolve(out, `prompt-${i}.txt`), prompt + '\n');
  for (const [name, re] of checks) {
    if (!re.test(prompt)) { failed++; console.log(`FAIL post ${i}: ${name}`); }
  }
  if (prompt.includes('Write reply drafts from this screen.')) { failed++; console.log(`FAIL post ${i}: old framing still present`); }
}
console.log(failed ? `PROMPT FRAMING FAILED: ${failed}` : `PROMPT FRAMING OK: ${POSTS.length} posts, ${checks.length} checks each`);
process.exit(failed ? 1 : 0);

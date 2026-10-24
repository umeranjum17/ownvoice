// The owner's 1.0.8 polish on the native X-style composer, through the stub phone writer's 'Looks nice' replay:
// the Shorter version that talks to him never shows, "Still working" shows while a card is still coming, and at
// the phone's card deadline the missing card collapses instead of staying a grey placeholder. Called from
// e2e/own-post.mjs with OWN_POST_TALK=1 after setup; needs an EXPO_PUBLIC_E2E_STUB=1 build. Never inserts or posts.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TALK = "I'm not sure what you're asking for";
const STILL = 'Still working… this phone takes a while.';
const KEPT = 'Looks really nice.';
// Phone deadline (CARD_MS.phone in src/panel/Panel.tsx) plus slack for a loaded emulator.
const DEADLINE_S = 300 + 60;

export async function proveOwnPostTalk({ adb, nodes, bubble, wait, out, fixturePkg, pkg, type, key, serial }) {
  const texts = () => nodes().map(n => n.text ?? '').filter(Boolean);
  const shot = name => writeFileSync(join(out, `${name}.png`), execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 24 * 1024 * 1024 }));
  const until = async (label, check, seconds) => {
    for (let n = 0; n < seconds; n++) { if (check(texts())) return; await wait(1000); }
    throw new Error(`Never saw ${label}: ${texts().join(' | ')}`);
  };
  // The phone writer, chosen through the app's own writer list (the stub build offers it on an emulator).
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source');
  await wait(5000);
  const phone = nodes().find(n => n.clickable && n.label?.startsWith('On this phone,'));
  assert.ok(phone, 'The phone writer choice must be offered');
  nodes(phone.label);
  await wait(1500);
  key(4);
  adb('shell', 'am', 'force-stop', fixturePkg);
  adb('shell', 'monkey', '-p', fixturePkg, '-c', 'android.intent.category.LAUNCHER', '1');
  await wait(2500);
  type('Looks nice');
  await wait(1500);
  key(4); // Drop the keyboard so the bubble tap cannot land on it.
  await wait(1500);
  bubble();
  await until('Polish your post', list => list.some(t => t.startsWith('Polish your post')), 30);
  await until(`"${KEPT}"`, list => list.includes(KEPT), 30);
  await until('the still-working line', list => list.includes(STILL), 40);
  const working = texts();
  assert.ok(!working.some(t => t.includes(TALK)), 'The talk-back version must never show');
  shot('talk-still-working');
  writeFileSync(join(out, 'talk-still-working.nodes.json'), JSON.stringify(nodes(), null, 1));
  const started = Date.now();
  await until('the deadline', list => !list.includes(STILL) && !list.includes('Writing…'), DEADLINE_S);
  const settled = texts();
  assert.ok(settled.includes(KEPT), 'The card that landed stays');
  assert.ok(!settled.some(t => t.includes(TALK)), 'The talk-back version must never show');
  assert.ok(settled.includes('Write new ones'), 'The run ends ready with the landed card');
  shot('talk-deadline-collapsed');
  writeFileSync(join(out, 'talk-deadline-collapsed.nodes.json'), JSON.stringify(nodes(), null, 1));
  const version = adb('shell', 'dumpsys', 'package', pkg).match(/versionName=(\S+)/)?.[1];
  writeFileSync(join(out, 'steps.json'), JSON.stringify({
    target: { version },
    start: 'Stub build installed on an owned emulator, setup finished, writer switched to On this phone in the app',
    steps: ['Open the blank X-style composer', 'Type "Looks nice"', 'Tap the bubble once', 'Read the panel while a card is still coming', 'Wait for the phone card deadline; do not insert or post'],
    result: { whileWriting: working, afterDeadline: settled, deadlineWaitS: Math.round((Date.now() - started) / 1000), talkShown: false, sent: false },
  }, null, 2));
  key(4);
  console.log(JSON.stringify({ kept: KEPT, talkShown: false, passed: true }));
}

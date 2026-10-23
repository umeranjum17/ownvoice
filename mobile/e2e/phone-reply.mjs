// Live phone-writer proof on an owned emulator. No browser, sign-in, stub or post/send tap.
// Install the candidate and get "On this phone" ready through setup first; enable X in app choices.
// ANDROID_SERIAL=emulator-NNNN OWNVOICE_AVD_NAME=<owned> node mobile/e2e/phone-reply.mjs <scratch> <evidence>
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accessibilityProbe, center, emulatorName } from './accessibility.mjs';
import { copiesPost, norm, replyInstruction } from '../../packages/engine/src/drafts.ts';
import { feedRead } from '../../packages/engine/src/feed.ts';

const post = 'Shipping a tiny app every week this year. Week 12: a focus timer that only counts focused minutes. What should week 13 be?';
const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
const shellCommand = args => args.map(quote).join(' ');
const fixtureIntent = ['am', 'start', '-n', 'com.twitter.android/.Composer', '--es', 'post', post, '--es', 'replyText', ''];
// Offline integration preflight: a real shell round-trip plus a retained native fixture read.
if (process.argv[2] === '--preflight') {
  const decode = 'process.stdout.write(JSON.stringify(process.argv.slice(1)))';
  const parsed = JSON.parse(execFileSync('sh', ['-c', `${quote(process.execPath)} -e ${quote(decode)} -- ${shellCommand(fixtureIntent)}`], { encoding: 'utf8' }));
  assert.deepEqual(parsed, fixtureIntent);
  const list = JSON.parse(readFileSync(process.argv[3], 'utf8'));
  const field = list.find(n => n.editable);
  assert.ok(field && ['', "What's happening?"].includes(field.text));
  const read = feedRead(list.map(n => ({ text: n.text, clickable: n.clickable, left: n.bounds[0], top: n.bounds[1], bottom: n.bounds[3] })), field.bounds[1]).post;
  assert.ok(read.includes(post), 'The app must read the complete intended parent');
  console.log(JSON.stringify({ parentPost: post, parentReadByApp: read, replyText: '', shellRoundTrip: parsed, passed: true }, null, 2));
  process.exit(0);
}

const serial = process.env.ANDROID_SERIAL;
assert.match(serial ?? '', /^emulator-\d+$/);
assert.ok(process.env.OWNVOICE_AVD_NAME);
assert.equal(emulatorName(serial), process.env.OWNVOICE_AVD_NAME);
const [scratchArg, evidenceArg] = process.argv.slice(2);
assert.ok(scratchArg && evidenceArg, 'Pass task-owned scratch and evidence directories');
const scratch = resolve(scratchArg), evidence = resolve(evidenceArg);
mkdirSync(scratch, { recursive: true }); mkdirSync(evidence, { recursive: true });
const repo = fileURLToPath(new URL('../../', import.meta.url));
// adb shell joins its arguments again remotely: preserve spaces and an empty replyText.
const adb = (...args) => execFileSync('adb', ['-s', serial, ...(args[0] === 'shell' ? ['shell', shellCommand(args.slice(1))] : args)], { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const nodes = accessibilityProbe(serial, scratch);
const tap = node => adb('shell', 'input', 'tap', ...center(node).map(n => String(Math.round(n))));
const until = async (label, read, seconds = 60) => {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) { const found = read(); if (found) return found; await wait(2000); }
  throw new Error(`Timed out waiting for ${label}`);
};

// The repo's native X-style fixture, built with installed SDK tools (no network).
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
assert.ok(sdk && process.env.JAVA_HOME);
const newest = dir => readdirSync(dir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
const tools = join(sdk, 'build-tools', newest(join(sdk, 'build-tools')));
const android = join(sdk, 'platforms', newest(join(sdk, 'platforms')), 'android.jar');
const run = (command, args) => execFileSync(command, args, { stdio: 'pipe' });
const classes = join(scratch, 'classes'); mkdirSync(classes, { recursive: true });
const source = join(scratch, 'Composer.java'), manifest = join(scratch, 'AndroidManifest.xml');
writeFileSync(source, readFileSync(join(repo, 'mobile/e2e/fixture/Composer.java')));
writeFileSync(manifest, readFileSync(join(repo, 'mobile/e2e/fixture/AndroidManifest.xml')));
run(join(process.env.JAVA_HOME, 'bin/javac'), ['-cp', android, '-d', classes, source]);
const jar = join(scratch, 'composer.jar'), apk = join(scratch, 'fixture.apk');
run(join(process.env.JAVA_HOME, 'bin/jar'), ['cf', jar, '-C', classes, '.']);
run(join(tools, 'd8'), ['--lib', android, '--output', scratch, jar]);
run(join(tools, 'aapt'), ['package', '-f', '-M', manifest, '-I', android, '-F', apk]);
run('zip', ['-j', apk, join(scratch, 'classes.dex')]);
run(join(tools, 'apksigner'), ['sign', '--ks', join(repo, 'mobile/android/app/debug.keystore'), '--ks-key-alias', 'androiddebugkey', '--ks-pass', 'pass:android', apk]);
adb('install', '-r', apk);
adb('shell', ...fixtureIntent);
const initial = await until('the complete post and empty fixture field', () => {
  const list = nodes(), field = list.find(n => n.editable && n.app === 'com.twitter.android');
  return list.some(n => n.text === post) && field && ['', "What's happening?"].includes(field.text) ? list : null;
});
writeFileSync(join(evidence, 'fixture-input.json'), JSON.stringify(initial, null, 1));
// One tap, one generation; never retry a failing writer silently.
tap(await until('the bubble', () => nodes().find(n => n.windowType === 4 && /^Ownvoice(?:,|$)/.test(n.label))));
await until('the completed reply cards', () => nodes().some(n => /Pick one to put in your message box/.test(n.text ?? '')), 600);

const labels = ['Agree', 'Push back, kindly', 'Ask a question'];
const cards = new Map(), ratings = new Set(), ratedCards = new Set(), hashes = new Set();
const [width, height] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
for (let step = 0; step < 6; step++) {
  const list = nodes();
  let current = null;
  for (let i = 0; i < list.length; i++) {
    const label = labels.find(label => label.toLowerCase() === list[i].text?.toLowerCase());
    if (label) {
      current = label;
      const body = list.slice(i + 1).find(n => n.text?.trim());
      if (body && !/^(Insert|Writing)/.test(body.text)) cards.set(label, body.text.trim());
    }
    if (/^Engagement on X:/.test(list[i].label ?? '') && /Stock wording:/.test(list[i].label)) {
      ratings.add(list[i].label); if (current) ratedCards.add(current);
    }
  }
  const png = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p']);
  const hash = createHash('sha256').update(png).digest('hex');
  if (!hashes.has(hash)) { writeFileSync(join(evidence, `reply-cards-${step + 1}.png`), png); hashes.add(hash); }
  writeFileSync(join(evidence, `reply-cards-${step + 1}.nodes.json`), JSON.stringify(list, null, 1));
  if (cards.size === 3 && ratedCards.size === 3) break;
  adb('shell', 'input', 'swipe', String(width / 2), String(height * .74), String(width / 2), String(height * .38), '350');
  await wait(1500);
}
assert.equal(cards.size, 3, `Expected all three reply slots: ${JSON.stringify([...cards])}`);
const replies = [...cards.values()];
assert.equal(new Set(replies.map(norm)).size, 3, 'Reply cards must differ');
for (const reply of replies) { assert.ok(!copiesPost(reply, post), 'Card copies the parent'); assert.ok(!replyInstruction(reply), 'Card describes how to reply'); }
// Clear rating labels can be identical across cards; every shown card must have both rows.
assert.equal(ratedCards.size, 3, 'Every reply card must have both engagement and stock rows');
writeFileSync(join(evidence, 'steps.json'), JSON.stringify({ target: { version: adb('shell', 'dumpsys', 'package', 'dev.ownvoice.next').match(/versionName=(\S+)/)?.[1] }, start: 'Candidate installed on an owned x86_64 emulator, free phone writer ready, X lab allowed', steps: ['Open the lab X post with an empty reply box', 'Tap the bubble once', 'Wait for the on-phone writer', 'Scroll the three reply cards and their rating rows; do not insert or send'], result: { post, cards: Object.fromEntries(cards), ratingLabels: [...ratings], sent: false } }, null, 2));
adb('shell', 'input', 'keyevent', '4');
console.log(JSON.stringify({ cards: Object.fromEntries(cards), ratingLabels: [...ratings], passed: true }));

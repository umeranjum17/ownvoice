// Real Claude writer proof, driven on an owned emulator (refuses phone serials).
//
// What it proves: (1) the bubble over a reply field drafts through the signed-in Claude account and
// Insert puts that draft in the field; (2) the Shorter selection rewrite runs through Claude. Each leg
// is backed by the on-screen text and by the real Claude answer on logcat. The build must be a release
// APK made with EXPO_PUBLIC_E2E_CLAUDE_LOG=1 (only then does askCloud log "Ownvoice claude answer: …";
// never set in a distributable build) and the app must already be signed in to and switched to Claude.
//
// Usage: ANDROID_SERIAL=emulator-NNNN OWNVOICE_AVD_NAME=<its avd> \
//   node e2e/claude-draft-proof.mjs <release-apk> [out-dir]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { accessibilityProbe, center, emulatorName } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL;
if (!/^emulator-\d+$/.test(serial ?? '')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const avd = (process.env.OWNVOICE_AVD_NAME ?? '').trim();
if (!avd) throw new Error('Set OWNVOICE_AVD_NAME to your own AVD name.');
if (emulatorName(serial) !== avd) throw new Error(`Serial ${serial} is not the owned AVD ${avd}.`);
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path (built with EXPO_PUBLIC_E2E_CLAUDE_LOG=1).');
const out = resolve(process.argv[3] ?? 'e2e/artifacts');
mkdirSync(out, { recursive: true });
const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const rewrite = `${pkg}/dev.ownvoice.bridge.RewriteActivity`;
const fixturePkg = 'com.twitter.android';
const post = 'Umer keeps notes offline to stay focused and never opens a social feed before noon.';

const adb = (...a) => execFileSync('adb', ['-s', serial, ...a], { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 });
const adbRaw = (...a) => execFileSync('adb', ['-s', serial, ...a], { maxBuffer: 24 * 1024 * 1024 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const nodes = accessibilityProbe(serial, out);
const snap = name => writeFileSync(resolve(out, `${name}.png`), adbRaw('exec-out', 'screencap', '-p'));
const tap = (x, y) => adb('shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y)));
const texts = () => nodes().map(n => `${n.text || ''}${n.label || ''}`).join(' | ');
const dumpLogcat = name => { writeFileSync(resolve(out, `${name}.logcat`), adb('shell', 'logcat', '-d')); };
const findBubble = async () => { for (let i = 0; i < 15; i++) { const b = nodes().find(n => n.windowType === 4 && /^Ownvoice(?:,|$)/.test(n.label)); if (b) return b; await wait(1500); } return null; };
const saveTree = name => writeFileSync(resolve(out, `${name}.txt`), nodes().map(n => n.text || n.label).filter(Boolean).join('\n'));
const claudeAnswers = () => (adb('shell', 'logcat', '-d').match(/^.*Ownvoice claude answer: .*$/gm) ?? []).map(l => l.replace(/^.*Ownvoice claude answer: /, ''));
const clearLog = () => adb('shell', 'logcat', '-c');
async function rebind() {
  const enabled = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
  const services = new Set(enabled === 'null' ? [] : enabled.split(':')); services.add(component);
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...services].join(':'));
  adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1'); await wait(1500);
  const others = [...services].filter(x => x !== component);
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', (others.length ? others : ['com.example.disabled/NoService']).join(':')); await wait(1500);
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...services].join(':'));
  adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1'); await wait(2500);
}
function buildFixture() {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), 'Android/Sdk');
  const javaHome = process.env.JAVA_HOME; if (!javaHome) throw new Error('Set JAVA_HOME.');
  const env = { ...process.env, PATH: `${javaHome}/bin:${process.env.PATH}` };
  const run = (cmd, args) => execFileSync(cmd, args, { env, stdio: 'pipe' });
  const build = resolve(out, '.fixture-X'); const classes = join(build, 'classes'); mkdirSync(classes, { recursive: true });
  const newest = (dir, re) => readdirSync(dir).filter(x => re.test(x)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
  const tools = join(sdk, 'build-tools', newest(join(sdk, 'build-tools'), /./));
  const platform = join(sdk, 'platforms', newest(join(sdk, 'platforms'), /^android-\d+$/), 'android.jar');
  const src = join(build, 'Composer.java');
  writeFileSync(src, readFileSync(new URL('./fixture/Composer.java', import.meta.url), 'utf8').replace(/^package .*;$/m, `package ${fixturePkg};`));
  run(join(javaHome, 'bin/javac'), ['-cp', platform, '-d', classes, src]);
  const jar = join(build, 'composer.jar'); run(join(javaHome, 'bin/jar'), ['cf', jar, '-C', classes, '.']);
  run(join(tools, 'd8'), ['--lib', platform, '--output', build, jar]);
  const appApk = join(build, 'fixture.apk'); const mf = join(build, 'AndroidManifest.xml');
  writeFileSync(mf, `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${fixturePkg}"><uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36" /><application android:label="X" android:theme="@android:style/Theme.Material.Light"><activity android:name="${fixturePkg}.Composer" android:exported="true" android:label="X"><intent-filter><action android:name="android.intent.action.MAIN" /><category android:name="android.intent.category.LAUNCHER" /></intent-filter></activity></application></manifest>`);
  run(join(tools, 'aapt'), ['package', '-f', '-M', mf, '-I', platform, '-F', appApk]);
  run('zip', ['-j', appApk, join(build, 'classes.dex')]);
  run(join(tools, 'apksigner'), ['sign', '--ks', new URL('../android/app/debug.keystore', import.meta.url).pathname, '--ks-key-alias', 'androiddebugkey', '--ks-pass', 'pass:android', appApk]);
  return appApk;
}

let failed = false;
const fail = why => { failed = true; console.error(`FAIL: ${why}`); };

adb('shell', 'cmd', 'uimode', 'night', 'no'); await wait(500);
execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
await rebind();
execFileSync('adb', ['-s', serial, 'install', '-r', buildFixture()], { stdio: 'inherit' });

// Claude must already be signed in (its own paste-back sign-in cannot be automated here); choose it.
const nodeText = n => `${n.text || ''}${n.label || ''}`;
async function ensureClaudeChosen() {
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source');
  await wait(4000);
  let card = null;
  for (let i = 0; i < 8 && !card; i++) { card = nodes().find(n => /With your Claude/.test(nodeText(n))); if (!card) await wait(1500); }
  if (!card) { fail('the writer list has no Claude card'); return false; }
  tap(...center(card)); await wait(2500);
  const t = texts();
  if (/If Claude can't answer/i.test(t)) { console.log('Claude: already signed in and chosen'); return true; }
  const yes = nodes().find(n => /^Switch to Claude$/i.test(nodeText(n)));
  if (yes) { tap(...center(yes)); await wait(2500); console.log('Claude: signed in, switched the writer to Claude'); return true; }
  fail(`Claude is signed out on this emulator (writer list showed the sign-in flow) - sign the app in first`);
  return false;
}
if (!await ensureClaudeChosen()) { console.error('cannot run the Claude proof without a signed-in Claude account'); process.exit(1); }

// --- 1. reply field -> real Claude draft -> Insert ---
adb('shell', 'am', 'force-stop', fixturePkg); await wait(600);
// Extras are quoted for the device shell, whose `adb shell` re-splits on spaces.
adb('shell', 'am', 'start', '-n', `${fixturePkg}/.Composer`, '--es', 'post', `'${post}'`, '--es', 'replyText', "''"); await wait(2500);
const b = await findBubble();
if (!b) fail('bubble not visible over the reply field');
else {
  await clearLog(); await wait(300);
  tap(...center(b));
  let answers = [];
  for (let i = 0; i < 90; i++) { await wait(1000); answers = claudeAnswers(); if (answers.length) break; }
  // Let the cards settle (the panel retries a missing slot with a second Claude ask) before inserting.
  for (let i = 0; i < 30; i++) { if (!/Writing…/.test(texts()) && nodes().filter(n => ['Insert', 'Use this'].includes(n.text || n.label)).length >= 2) break; await wait(1000); }
  await wait(1500); snap('claude-real-reply-draft'); saveTree('claude-real-reply-draft');
  if (!answers.length) fail('no "Ownvoice claude answer" line on logcat for the reply draft');
  const ins = nodes().find(n => n.clickable && ['Insert', 'Use this'].includes(n.text || n.label));
  if (ins) {
    tap(...center(ins)); await wait(4000); snap('claude-real-reply-inserted');
    const after = nodes();
    writeFileSync(resolve(out, 'claude-real-reply-inserted.txt'), after.map(n => n.text || n.label).filter(Boolean).join('\n'));
    // The inserted card must come from a real logged Claude answer; capture logcat after the insert so
    // a slot retry's answer is included too.
    answers = claudeAnswers();
    dumpLogcat('claude-real-reply-answer');
    writeFileSync(resolve(out, 'claude-real-reply-answer.txt'), answers.join('\n\n'));
    const flat = answers.join('\n');
    const field = after.find(n => /post text/i.test(n.label || n.text || ''))
      || after.find(n => (n.text || '').length > 18 && flat.includes((n.text || '').slice(0, 25)));
    const inserted = (field?.text || '').trim();
    console.log('inserted via', ins.text || ins.label, '| field now:', inserted.slice(0, 200));
    if (!inserted || !flat.includes(inserted.slice(0, 25))) fail('the inserted text was not found in a logged Claude answer');
  } else fail('reply card Insert/Use this control not found');
}

// --- 2. real Claude Shorter selection rewrite ---
adb('shell', 'am', 'force-stop', fixturePkg); await wait(800);
await clearLog(); await wait(300);
adb('shell', 'am', 'start', '-n', rewrite, '-a', 'android.intent.action.PROCESS_TEXT', '-t', 'text/plain',
  '--es', 'android.intent.extra.PROCESS_TEXT', '"We are still on for Saturday, see you then at the usual place."');
await wait(4500);
const chip = nodes().find(n => /^Shorter$/i.test(n.text || n.label));
if (chip) tap(...center(chip)); else fail('Shorter chip not found in the rewrite sheet');
let rw = [];
for (let i = 0; i < 90; i++) { await wait(1000); rw = claudeAnswers(); if (rw.length) break; }
await wait(2500); snap('claude-real-rewrite'); saveTree('claude-real-rewrite');
writeFileSync(resolve(out, 'claude-real-rewrite-answer.logcat'), adb('shell', 'logcat', '-d'));
if (rw.length) { console.log('Claude rewrite answer:', rw.join('\n')); writeFileSync(resolve(out, 'claude-real-rewrite-answer.txt'), rw.join('\n\n')); }
else fail('no "Ownvoice claude answer" line on logcat for the Shorter rewrite');

if (failed) process.exit(1);
console.log('CLAUDE PROOF DONE');

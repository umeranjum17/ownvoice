// Live grow-mode feed-reply proof on a signed-in emulator, with no network and no Chrome mapping.
// Installs the Composer fixture as com.twitter.android (X) and com.reddit.frontpage (Reddit); for each
// realistic post it opens the fixture with the post above a field holding the person's typed reply,
// taps the bubble, waits for the ranked reply cards, records the screen, and reads the card texts and
// their fit levels from the accessibility tree. Run under the device lock.
//
// Env: ANDROID_SERIAL=emulator-NNNN, OWNVOICE_AVD_NAME, JAVA_HOME; KEEP=1 leaves the last panel open;
// DARK=1 adds one dark capture per platform after the light run; NEVER_SAY="phrase;phrase" sets those
// phrases under Your voice (the real voice screen) before drafting, so the run proves the chosen
// hosted writer drops them from the suggested cards.
// Args: <cases.json> [out-dir] [limit] [platforms]
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accessibilityProbe, center, emulatorName } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL;
if (!/^emulator-\d+$/.test(serial ?? '')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const avd = process.env.OWNVOICE_AVD_NAME;
if (avd && emulatorName(serial) !== avd) throw new Error(`Refusing ${serial}: AVD is not ${avd}.`);
const cases = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = resolve(process.argv[3] ?? 'e2e/artifacts/grow-reply-live');
const limit = Number(process.argv[4] ?? 5);
const only = process.argv[5] ? process.argv[5].split(',') : ['x', 'reddit'];
mkdirSync(out, { recursive: true });
const pkg = 'dev.ownvoice.next';
const FIXTURES = {
  x: { pkg: 'com.twitter.android', component: 'com.twitter.android/.Composer', label: 'X' },
  reddit: { pkg: 'com.reddit.frontpage', component: 'com.reddit.frontpage/.Composer', label: 'Reddit' },
};
const nodes = accessibilityProbe(serial, out);
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
const adbRaw = (...args) => execFileSync('adb', ['-s', serial, ...args], { maxBuffer: 24 * 1024 * 1024 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const snap = name => writeFileSync(resolve(out, `${name}.png`), adbRaw('exec-out', 'screencap', '-p'));
const tap = (x, y) => adb('shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y)));
const until = async (find, label, tries = 60) => {
  for (let i = 0; i < tries; i++) { const found = await find(); if (found) return found; await wait(1000); }
  throw new Error(`Timed out waiting for ${label}.`);
};

const LEVELS = ['Likely to be skipped', 'Might get a reply', 'Good fit here', 'Strong fit here'];
const FIT_WORDS = new Set([...LEVELS, 'Not sure about this one', "Can't rate the fit right now"]);
const TAGS = new Set(['yours', 'agree', 'push back, kindly', 'ask a question', 'answer', 'disagree', 'ask for a detail']);

/** Read the panel's cards top-to-bottom: each tag label starts a card; the longest text under it is
 *  its reply; the fit level is the accessible label of its bar. Card labels render uppercased. */
const readPanel = () => {
  const panel = nodes().filter(n => n.app === pkg && (n.text || n.label).trim())
    .sort((a, b) => a.bounds[1] - b.bounds[1] || a.bounds[0] - b.bounds[0]);
  const title = panel.find(n => /Suggested replies|Reply to /.test(n.text || ''))?.text?.trim() ?? '';
  const cards = [];
  let current = null;
  for (const n of panel) {
    const text = (n.text || '').trim();
    const key = text.toLowerCase();
    const label = (n.label || '').trim();
    if (TAGS.has(key)) { current = { tag: key, texts: [], fit: null }; cards.push(current); continue; }
    if (!current) continue;
    if (FIT_WORDS.has(label) && !current.fit) { current.fit = label; continue; }
    if (text && !/^(use this|why\?|edit|copy|copied|share this text|pick one.*|write new ones|open in x with this text)$/i.test(text)) current.texts.push(text);
  }
  for (const c of cards) c.text = c.texts.slice().sort((a, b) => b.length - a.length)[0] ?? '';
  return { title, cards };
};

/** Build the Composer fixture under one package id, host-side (like e2e/own-post.mjs). */
function buildFixture(name, targetPkg) {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), 'Android/Sdk');
  const javaHome = process.env.JAVA_HOME;
  if (!javaHome) throw new Error('Set JAVA_HOME to the JDK used to build the app.');
  const env = { ...process.env, PATH: `${javaHome}/bin:${process.env.PATH}` };
  const run = (cmd, args) => execFileSync(cmd, args, { env, stdio: 'pipe' });
  const build = resolve(out, `.fixture-${name}`);
  const classes = join(build, 'classes');
  mkdirSync(classes, { recursive: true });
  const newest = (dir, re) => readdirSync(dir).filter(x => re.test(x)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
  const tools = join(sdk, 'build-tools', newest(join(sdk, 'build-tools'), /./));
  const platform = join(sdk, 'platforms', newest(join(sdk, 'platforms'), /^android-\d+$/), 'android.jar');
  const source = join(build, 'Composer.java');
  const template = readFileSync(fileURLToPath(new URL('./fixture/Composer.java', import.meta.url)), 'utf8');
  writeFileSync(source, template.replace(/^package .*;$/m, `package ${targetPkg};`));
  run(join(javaHome, 'bin/javac'), ['-cp', platform, '-d', classes, source]);
  const jar = join(build, 'composer.jar');
  run(join(javaHome, 'bin/jar'), ['cf', jar, '-C', classes, '.']);
  run(join(tools, 'd8'), ['--lib', platform, '--output', build, jar]);
  const apk = join(build, 'fixture.apk');
  const manifest = join(build, 'AndroidManifest.xml');
  writeFileSync(manifest, `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${targetPkg}">
  <uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36" />
  <application android:label="${name}" android:theme="@android:style/Theme.Material.Light">
    <activity android:name="${targetPkg}.Composer" android:exported="true" android:label="${name}">
      <intent-filter><action android:name="android.intent.action.MAIN" /><category android:name="android.intent.category.LAUNCHER" /></intent-filter>
    </activity>
  </application>
</manifest>`);
  run(join(tools, 'aapt'), ['package', '-f', '-M', manifest, '-I', platform, '-F', apk]);
  run('zip', ['-j', apk, join(build, 'classes.dex')]);
  run(join(tools, 'apksigner'), ['sign', '--ks', fileURLToPath(new URL('../android/app/debug.keystore', import.meta.url)), '--ks-key-alias', 'androiddebugkey', '--ks-pass', 'pass:android', apk]);
  return apk;
}

const bubbleNode = () => nodes().find(node => node.windowType === 4 && /^Ownvoice(?:,|$)/.test(node.label));
const fitLines = () => adb('logcat', '-d', '-s', 'ReactNativeJS:I').split('\n').filter(line => line.includes('ownvoice-fit '));

const recordStart = remote => {
  adb('shell', 'rm', '-f', remote);
  const child = spawn('adb', ['-s', serial, 'shell', 'screenrecord', '--bit-rate', '8M', remote], { stdio: 'ignore', detached: true });
  child.unref();
  return child;
};
const recordStop = async child => {
  try { adb('shell', 'pkill', '-INT', 'screenrecord'); } catch (error) { console.warn(`Recorder interrupt failed: ${error.message}`); }
  await wait(2500);
  try { child.kill('SIGTERM'); } catch (error) { console.warn(`Recorder client cleanup failed: ${error.message}`); }
  await wait(1000);
};

const results = resolve(out, 'results.jsonl');
writeFileSync(results, '');

const suggestionsIn = panel => panel.cards.filter(card => card.tag !== 'yours' && card.text);
/** The app's own cloud lines for this attempt: a no-answer/parse failure vs a network drop. */
const appLog = () => adb('logcat', '-d', '-s', 'ReactNativeJS:I').split('\n')
  .filter(line => /Ownvoice (openrouter|chatgpt|claude)|ownvoice-fit/.test(line)).slice(-30).join(' | ');

const one = async (platform, i, tag) => {
  const c = cases[platform][i];
  const fix = FIXTURES[platform];
  adb('logcat', '-c');
  // adb joins the shell args with spaces, so multi-word extras must be single-quoted for the device shell.
  const q = s => `'${String(s).replaceAll("'", "'\\''")}'`;
  let panel = null;
  let log = '';
  // A live cloud call can come back empty or unparsable; a fresh attempt usually lands, so retry the
  // whole open-and-wait up to three times before recording whatever the panel shows.
  for (let attempt = 0; attempt < 3; attempt++) {
    adb('shell', 'am', 'force-stop', fix.pkg);
    await wait(600);
    adb('shell', 'am', 'start', '-n', fix.component, '--es', 'post', q(c.post), '--es', 'replyText', q(c.reply), '--es', 'label', q(fix.label));
    const field = await until(() => nodes().find(node => node.editable && node.text === c.reply), `the ${platform} reply field`);
    tap(...center(field));
    await wait(800);
    const bubble = await until(bubbleNode, 'the bubble');
    tap(...center(bubble));
    await until(() => { const p = readPanel(); return p.title.startsWith('Suggested replies') ? p : null; }, 'the grow panel', 90);
    panel = readPanel();
    for (let i2 = 0; i2 < 90; i2++) {
      panel = readPanel();
      if (suggestionsIn(panel).length >= 2 && fitLines().length) break;
      // The cloud writer fell back (phone can't write here): stop waiting and try the whole open again.
      if (i2 > 3 && panel.cards.some(card => /ready to write|try again|something went wrong|wrote this on the phone/i.test(card.text ?? ''))) break;
      await wait(1000);
    }
    log = appLog();
    if (suggestionsIn(panel).length >= 2 || attempt === 2) break;
    adb('shell', 'input', 'keyevent', '4');
    await wait(1500);
  }
  panel = readPanel();
  snap(tag);
  const fits = fitLines().at(-1);
  appendFileSync(results, JSON.stringify({ platform, case: i, post: c.post, reply: c.reply, title: panel.title, cards: panel.cards, fit: fits ?? null, appLog: log, shot: `${tag}.png` }) + '\n');
  const suggestions = suggestionsIn(panel);
  console.log(`${tag}: ${suggestions.map(card => `${card.tag}[${card.fit ?? '?'}] ${card.text.slice(0, 80)}`).join(' || ')}${log ? ' :: ' + log.slice(0, 160) : ''}`);
  if (process.env.KEEP !== '1') { adb('shell', 'input', 'keyevent', '4'); await wait(800); }
  return panel;
};

// Install fixtures and the probe; enable the service (off/on rebind).
execFileSync('adb', ['-s', serial, 'install', '-r', buildFixture('X', FIXTURES.x.pkg)], { stdio: 'inherit' });
execFileSync('adb', ['-s', serial, 'install', '-r', buildFixture('Reddit', FIXTURES.reddit.pkg)], { stdio: 'inherit' });
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', 'com.example.disabled/NoService');
await wait(1000);
adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', component);
adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
await wait(2500);

// The real voice screen: type each banned phrase and press Add, like a person would. The chips
// grow the page, so the add row can scroll off screen; bring it back before each tap.
const setNeverSay = async () => {
  const phrases = (process.env.NEVER_SAY ?? '').split(';').map(x => x.trim()).filter(Boolean);
  if (!phrases.length) return;
  const [, H] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
  // A chip renders as a button labelled "Remove <phrase>" wrapping the phrase text, so match both.
  const hasPhrase = phrase => nodes().some(n => `${n.label ?? ''} ${n.text ?? ''}`.toLowerCase().includes(phrase.toLowerCase()));
  const fieldNow = () => nodes().find(n => n.editable && /never say/i.test(n.label ?? ''));
  const midY = n => (n.bounds[1] + n.bounds[3]) / 2;
  const onScreen = n => !!n && midY(n) > 40 && midY(n) < H - 40;
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://voice', pkg);
  await until(() => fieldNow(), 'the Never say field', 30);
  for (const phrase of phrases) {
    if (hasPhrase(phrase)) continue;
    let added = false;
    for (let attempt = 0; attempt < 5 && !added; attempt++) {
      for (let s = 0; s < 10 && !onScreen(fieldNow()); s++) { // scroll the add row back into view
        const below = (fieldNow()?.bounds[1] ?? H) > H / 2;
        adb('shell', 'input', 'swipe', '540', String(Math.round(below ? H * 0.6 : H * 0.3)), '540', String(Math.round(below ? H * 0.25 : H * 0.6)), '250');
        await wait(600);
      }
      const field = fieldNow();
      if (!field) throw new Error('Never say field disappeared.');
      tap(...center(field));
      await wait(500);
      // The soft keyboard can cover the add row after the first phrase; hide it before typing.
      if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) { adb('shell', 'input', 'keyevent', '4'); await wait(600); }
      if ((fieldNow()?.text ?? '').trim()) { // clear any leftover from a missed Add
        adb('shell', 'input', 'keyevent', '123');
        for (let k = 0; k < 60; k++) adb('shell', 'input', 'keyevent', '67');
        await wait(300);
      }
      adb('shell', 'input', 'text', phrase.replaceAll(' ', '%s'));
      await wait(700);
      if (!(fieldNow()?.text ?? '').toLowerCase().includes(phrase.toLowerCase())) { await wait(500); continue; }
      adb('shell', 'input', 'keyevent', '66'); // submit adds the phrase, like the plus
      await wait(900);
      added = hasPhrase(phrase);
      if (!added) {
        const add = nodes().find(n => (n.label ?? '').trim().toLowerCase() === 'add' && !n.editable);
        if (add) { tap(...center(add)); await wait(900); added = hasPhrase(phrase); }
      }
    }
    if (!added) {
      const dump = nodes().filter(n => n.app === pkg).map(n => `${n.label}|${n.text}`).join(' ~ ').slice(0, 700);
      throw new Error(`The phrase ${JSON.stringify(phrase)} did not stick. Screen: ${dump}`);
    }
  }
  snap('voice-never-say');
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
  await wait(2500);
  console.log(`set ${phrases.length} never-say phrase(s) on Your voice`);
};

// Gate: a live cloud writer must be chosen (ChatGPT or OpenRouter); a stub or an empty phone is not a proof.
adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
await wait(5000);
await setNeverSay();
const home = nodes().map(n => `${n.label} ${n.text}`).join(' ').toLowerCase();
if (!/chatgpt|openrouter/.test(home)) throw new Error(`No live cloud writer: Home shows neither ChatGPT nor OpenRouter (gate). Home text: ${home.slice(0, 300)}`);
console.log(`gate: live writer present on Home (${home.includes('openrouter') ? 'OpenRouter' : 'ChatGPT'})`);
adb('shell', 'input', 'keyevent', '4');
await wait(800);

try {
  for (const platform of only) {
    const rec = recordStart(`/data/local/tmp/grow-${platform}.mp4`);
    await wait(1200);
    const n = Math.min(limit, cases[platform].length);
    for (let i = 0; i < n; i++) await one(platform, i, `${platform}-${String(i).padStart(2, '0')}-light`);
    await recordStop(rec);
    execFileSync('adb', ['-s', serial, 'pull', `/data/local/tmp/grow-${platform}.mp4`, resolve(out, `grow-${platform}-light.mp4`)], { stdio: 'inherit' });
    if (process.env.DARK) {
      adb('shell', 'cmd', 'uimode', 'night', 'yes');
      adb('shell', 'am', 'force-stop', pkg);
      adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', 'com.example.disabled/NoService');
      await wait(800);
      adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', component);
      adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
      await wait(1500);
      await one(platform, 0, `${platform}-00-dark`);
      adb('shell', 'cmd', 'uimode', 'night', 'no');
    }
  }
} finally {
  adb('shell', 'rm', '-f', `/data/local/tmp/grow-x.mp4`)
}
console.log(`Grow-reply captures saved to ${out}.`);

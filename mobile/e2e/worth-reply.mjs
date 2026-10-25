// Worth a reply (AA-13, AA-14, AA-15 on tap): one tap on an X feed with no reply box rates every post on
// screen, marks the ones that clear the bar (Strong fit only today) and writes the reply for the best one.
// The levels come from a fixed-answer Jev stand-in through the real decide path (fitBackends -> jev() ->
// judgeFit), and the reply cards from the E2E writer stub, so nothing leaves the emulator and nothing is
// spent. The stand-in fails the run unless every rating request carries the platform's post rubric and a
// candidate per post, and the panel is captured at 360, 390 and 445 dp in light and dark.
//
// Owned emulator only, never the test phone; taps through the probe, never uiautomator dump.
//   ANDROID_SERIAL=emulator-XXXX OWNVOICE_AVD_NAME=<avd> JAVA_HOME=<jdk> node e2e/worth-reply.mjs <release-apk> [outdir]
// The release APK needs EXPO_PUBLIC_E2E_STUB=1 EXPO_PUBLIC_E2E_GPT=1
// EXPO_PUBLIC_E2E_AUTH_BASE=http://10.0.2.2:21455 EXPO_PUBLIC_E2E_JEV_BASE=http://10.0.2.2:18612, and
// e2e/first-run.mjs must have finished setup with ChatGPT. Shots, the stand-in's requests and the read
// levels land in [outdir].
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accessibilityProbe, center, emulatorName } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL;
if (!/^emulator-\d+$/.test(serial ?? '')) throw new Error('Set ANDROID_SERIAL to an owned emulator (owner phones are refused).');
const avd = process.env.OWNVOICE_AVD_NAME;
if (!avd || emulatorName(serial) !== avd) throw new Error(`Refusing ${serial}: AVD is not ${avd}.`);
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = resolve(process.argv[3] ?? 'e2e/artifacts/worth-reply');
mkdirSync(out, { recursive: true });
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evidence = (...args) => execFileSync('bash', [resolve(repoRoot, 'mobile/e2e/evidence.sh'), ...args],
  { env: { ...process.env, ANDROID_SERIAL: serial }, encoding: 'utf8', cwd: repoRoot });

const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const FIXTURE = { pkg: 'com.twitter.android', name: 'X' };
const LEVELS = ['Likely to be skipped', 'Might get a reply', 'Good fit here', 'Strong fit here'];
const FIT_WORDS = [...LEVELS, 'Not sure about this one'];
const MARK = 'Worth a reply';
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
const wait = ms => new Promise(r => setTimeout(r, ms));
// Fixture and probe builds stay out of [outdir], which holds only the proof.
const scratch = mkdtempSync(join(tmpdir(), 'worth-reply-'));
const nodes = accessibilityProbe(serial, scratch);
let frame = '390';
const shot = name => writeFileSync(resolve(out, `${name}-${frame}.png`), execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 24 * 1024 * 1024 }));
const tap = (...point) => adb('shell', 'input', 'tap', String(Math.round(point[0])), String(Math.round(point[1])));
const scroll = () => { const [w, h] = [...adb('shell', 'wm', 'size').matchAll(/(\d+)x(\d+)/g)].at(-1).slice(1).map(Number); adb('shell', 'input', 'swipe', String(w / 2), String(h * .8), String(w / 2), String(h * .3), '400'); };
const until = async (find, what, seconds = 60) => {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) { const found = await find(); if (found) return found; await wait(1000); }
  throw new Error(`Timed out waiting for ${what}.`);
};
const click = async (text, seconds = 30) => {
  await until(() => { if (nodes().some(n => n.text === text || n.label === text)) return true; scroll(); return false; }, text, seconds);
  nodes(text);
};
const worthLines = () => adb('logcat', '-d', '-s', 'ReactNativeJS:I').split('\n').filter(line => line.includes('ownvoice-worth '));

/** Fixed levels by post order on the fixture feed: the question makes the second post clear a Strong-fit
 *  bar, the first sits a level below it and the third is filler. decide needs every level keyed with
 *  probabilities summing to 1, so the picked level takes it all. */
const ORDER = [2, 3, 0];
const requests = resolve(out, 'standin-requests.jsonl');
writeFileSync(requests, '');
const standin = createServer((req, res) => {
  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', () => {
    if (req.method !== 'POST' || req.url !== '/v1/systemone') { res.writeHead(404).end(); return; }
    try {
      if (req.headers.authorization !== 'Bearer fixture-jev-key') throw new Error('The BYOKit fixture key did not reach Jev.');
      const body = JSON.parse(raw);
      const scores = Object.entries(body.questions ?? {}).filter(([, q]) => q.type === 'score');
      appendFileSync(requests, JSON.stringify({ platform: body.state?.platform, post: body.state?.post,
        candidates: body.state?.candidates, instructions: scores.map(([key, q]) => `${key}: ${String(q.instructions ?? q.question ?? '').slice(0, 60)}`) }) + '\n');
      const answers = Object.fromEntries(scores.map(([key]) => {
        const level = ORDER[Number(key.replace('fit_', '')) % ORDER.length];
        return [key, { probabilities: Object.fromEntries([0, 1, 2, 3].map(l => [String(l), l === level ? 1 : 0])), confidence: 1 }];
      }));
      res.writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ model: 'stand-in:worth-fixed', answers, usage: { input_tokens: 0, output_tokens: 0 } }));
    } catch (e) { console.error(e); res.writeHead(500).end(); }
  });
});
await new Promise(r => standin.listen(18612, '127.0.0.1', r));

/** The Composer fixture under the X package id, host-side (as e2e/own-post-fit.mjs builds it). */
function buildFixture() {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), 'Android/Sdk');
  const javaHome = process.env.JAVA_HOME;
  if (!javaHome) throw new Error('Set JAVA_HOME to the JDK used to build the app.');
  const env = { ...process.env, PATH: `${javaHome}/bin:${process.env.PATH}` };
  const run = (cmd, args) => execFileSync(cmd, args, { env, stdio: 'pipe' });
  const build = resolve(scratch, 'feed');
  const classes = join(build, 'classes');
  mkdirSync(classes, { recursive: true });
  const newest = (dir, re) => readdirSync(dir).filter(x => re.test(x)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
  const tools = join(sdk, 'build-tools', newest(join(sdk, 'build-tools'), /./));
  const platform = join(sdk, 'platforms', newest(join(sdk, 'platforms'), /^android-\d+$/), 'android.jar');
  const source = join(build, 'Composer.java');
  const template = readFileSync(fileURLToPath(new URL('./fixture/Composer.java', import.meta.url)), 'utf8');
  writeFileSync(source, template.replace(/^package .*;$/m, `package ${FIXTURE.pkg};`));
  run(join(javaHome, 'bin/javac'), ['-cp', platform, '-d', classes, source]);
  const jar = join(build, 'composer.jar');
  run(join(javaHome, 'bin/jar'), ['cf', jar, '-C', classes, '.']);
  run(join(tools, 'd8'), ['--lib', platform, '--output', build, jar]);
  const built = join(build, 'fixture.apk');
  const manifest = join(build, 'AndroidManifest.xml');
  writeFileSync(manifest, `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${FIXTURE.pkg}">
  <uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36" />
  <application android:label="${FIXTURE.name}" android:theme="@android:style/Theme.Material.Light">
    <activity android:name="${FIXTURE.pkg}.Composer" android:exported="true" android:label="${FIXTURE.name}">
      <intent-filter><action android:name="android.intent.action.MAIN" /><category android:name="android.intent.category.LAUNCHER" /></intent-filter>
    </activity>
  </application>
</manifest>`);
  run(join(tools, 'aapt'), ['package', '-f', '-M', manifest, '-I', platform, '-F', built]);
  run('zip', ['-j', built, join(build, 'classes.dex')]);
  run(join(tools, 'apksigner'), ['sign', '--ks', fileURLToPath(new URL('../android/app/debug.keystore', import.meta.url)), '--ks-key-alias', 'androiddebugkey', '--ks-pass', 'pass:android', built]);
  return built;
}

/** The documented off/on rebind (AGENTS.md); a fresh process can miss the first one, so the cycle
 *  repeats until the service is bound, and the run stops if it never binds. */
const rebind = async () => {
  const bound = () => /Bound services:\s*\{[^}]*Ownvoice/.test(adb('shell', 'dumpsys', 'accessibility'));
  for (let cycle = 0; cycle < 3; cycle++) {
    adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', 'com.example.disabled/NoService');
    await wait(1000);
    adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', component);
    adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
    for (let i = 0; i < 10 && !bound(); i++) await wait(2000);
    if (bound()) return;
  }
  throw new Error('The Ownvoice service never bound after three off/on cycles.');
};
const bubble = () => until(() => nodes().find(node => node.windowType === 4 && /^Ownvoice(?:,|$)/.test(node.label)), 'the bubble');
const panelNodes = () => nodes().filter(n => n.app === pkg && ((n.text ?? '') || (n.label ?? '')).trim());

/** The offline ChatGPT stand-in keeps its connection in memory, so every app restart ends it and the
 *  phone writer would take over. Reconnect through the app's own writer screen before each round. */
const connect = async () => {
  const connected = () => nodes().some(node => node.app === pkg && /ChatGPT is connected/.test(node.text ?? ''));
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source', pkg);
  await until(() => nodes().some(node => node.app === pkg && /How Ownvoice writes/.test(node.text ?? '')), 'the writer screen', 30);
  if (!connected()) {
    nodes('Continue with ChatGPT');
    await until(connected, 'the reconnected ChatGPT stand-in', 40);
  }  adb('shell', 'input', 'keyevent', '3');
  await wait(1500);
};

/** The real BYOKit Jev account and its persisted opt-in, with a synthetic key: never a real Jev request.
 *  Once connected and on, later rounds only have to find it already on. */
const jevOn = async () => {
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://ratings', pkg);
  const toggle = () => nodes().find(n => n.app === pkg && n.label === 'Use Jev for ratings' && n.checkable);
  await until(() => { const n = toggle(); if (!n) scroll(); return n; }, 'the Jev rating switch', 40);
  if (toggle().checked) return;
  if (!toggle().enabled) {
    const field = await until(() => nodes().find(n => n.app === pkg && n.password && n.editable), 'the Jev key field', 30);
    tap(...center(field));
    adb('shell', 'input', 'text', 'fixture-jev-key');
    adb('shell', 'input', 'keyevent', '4');
    await click('Agree and connect Jev');
    await until(() => { const n = toggle(); return n && n.enabled; }, 'the Jev account to connect', 60);
  }
  await click('Use Jev for ratings');
  await until(() => toggle()?.checked, 'Jev on', 30);
  await wait(1000);
};

/** One tap on the feed, at one width and theme: the rated posts, the marked one and its reply must all show. */
async function round(theme) {
  adb('logcat', '-c');
  adb('shell', 'am', 'force-stop', FIXTURE.pkg);
  await wait(600);
  const open = async () => {
    adb('shell', 'am', 'start', '-n', `${FIXTURE.pkg}/${FIXTURE.pkg}.Composer`, '--ez', 'feed', 'true');
    await until(() => nodes().some(node => (node.text ?? '').startsWith('Sam Rivera')), 'the feed posts', 30);
    await wait(800);
    tap(...center(await bubble()));
    await wait(2500);
  };
  // A bubble that never shows after a fresh install gets one more rebind before the round fails.
  try { await open(); } catch (error) {
    if (!/the bubble/.test(error.message)) throw error;
    console.log(`${theme}/${frame}: no bubble, rebinding once`);
    await rebind();
    adb('shell', 'am', 'force-stop', FIXTURE.pkg);
    await open();
  }
  const title = `Posts on screen · ${FIXTURE.name}`;
  await until(() => panelNodes().some(n => (n.text ?? '').startsWith(title)), `"${title}"`, 60);
  // The rating lands after the panel opens: wait for the marked post and a lower level beside it.
  // The marked card's label is the mark word, then whose post it is.
  const markedNow = () => panelNodes().filter(n => (n.text ?? '').toLowerCase().startsWith(MARK.toLowerCase())).length;
  await until(() => markedNow() && panelNodes().some(n => n.label === LEVELS[0]), 'the rated posts and the marked one', 90);
  await wait(1500);
  const shotName = `worth-${theme}`;
  shot(shotName);
  const shown = panelNodes();
  const levels = shown.map(n => (n.label ?? '').trim()).filter(l => FIT_WORDS.includes(l));
  const texts = shown.map(n => n.text).filter(Boolean);
  const marked = markedNow();
  const last = worthLines().at(-1) ?? null;
  appendFileSync(resolve(out, 'results.jsonl'), JSON.stringify({ theme, frame, title, levels, marked, worth: last }) + '\n');
  console.log(`${theme}/${frame}: levels=${JSON.stringify(levels)} marked=${marked}`);
  if (marked !== 1) throw new Error(`Expected exactly one marked post, saw ${marked} (${JSON.stringify(texts)}).`);
  const missing = [LEVELS[3], LEVELS[2], LEVELS[0]].filter(level => !levels.includes(level));
  if (missing.length) throw new Error(`The rated posts are missing ${missing.join(', ')}; saw ${JSON.stringify(levels)}.`);
  // The reply for the best one, and no Insert: a feed with no box has nowhere to put it, so Copy is the way out.
  // (The card text is the E2E writer stub's first fixed reply; generation itself is stubbed, the rating is not.)
  if (!shown.some(n => n.text === 'Yes, still on! I can bring the stove if you get the tent.')) throw new Error('The reply for the best post is not on screen.');
  if (shown.some(n => /^(Insert|Use this)$/.test(n.text ?? ''))) throw new Error('An Insert button shows on a feed with no message box.');
  // The tap rated every post on screen, best first, and the best one cleared the bar.
  const fits = last ? JSON.parse(last.slice(last.indexOf('['))) : [];
  if (!Array.isArray(fits) || fits.length !== 3) throw new Error(`Expected three rated posts, got ${last}`);
  if (fits[0]?.level !== 3) throw new Error(`The best post is not Strong fit: ${last}`);
  if (!fits.some(fit => fit.level != null && fit.level < 3)) throw new Error(`No post sits below the bar: ${last}`);
  adb('shell', 'input', 'keyevent', '4');
  await wait(1000);
}

try {
  try { adb('shell', 'pm', 'uninstall', FIXTURE.pkg); } catch { /* nothing installed yet */ }
  execFileSync('adb', ['-s', serial, 'install', '-r', buildFixture()], { stdio: 'inherit' });
  // X is on by default (src/core/defaultApps.json), so no switch is touched.
  if (!adb('shell', 'pm', 'path', pkg).includes('package:')) throw new Error('Install the app and run e2e/first-run.mjs first.');
  for (const [width, height, density] of [[390, 844, 480], [360, 800, 480], [445, 932, 480]]) {
    frame = String(width);
    adb('shell', 'wm', 'size', `${width * density / 160}x${height * density / 160}`);
    adb('shell', 'wm', 'density', String(density));
    adb('shell', 'settings', 'put', 'system', 'font_scale', '1');
    for (const theme of ['light', 'dark']) {
      evidence('theme', theme);
      // React Native reads the colour scheme at process start (AGENTS.md): restart, then rebind.
      adb('shell', 'am', 'force-stop', pkg);
      await rebind();
      await connect();
      await jevOn();
      await round(theme);
    }
  }
  // Two kinds of rating reached the stand-in, one tap each round: every post on screen under the platform's post
  // rubric with no parent invented, and the reply written for the one that cleared the bar, under the reply rubric
  // with that post as its parent.
  const seen = readFileSync(requests, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const asks = seen.filter(r => r.post === '');
  const replyAsks = seen.filter(r => r.post !== '');
  if (asks.length < 6) throw new Error(`Expected one post rating per width and theme; the stand-in saw ${asks.length}.`);
  if (!replyAsks.length) throw new Error('No reply was rated: the panel wrote nothing for the marked post.');
  for (const r of asks) {
    if (Object.keys(r.candidates ?? {}).length !== 3) throw new Error(`A rating did not carry every post on screen: ${JSON.stringify(r.candidates)}`);
    if (!r.instructions.every(line => line.includes(`A new ${r.platform} post`))) throw new Error(`A ${r.platform} rating did not use the post rubric: ${r.instructions.join(' | ')}`);
  }
  // The reply answers the post that cleared the bar, never another one on screen.
  for (const r of replyAsks) {
    if (r.post !== 'Anyone found a focus timer that stays silent when a meeting starts?') throw new Error(`A reply rating answered a different post: ${JSON.stringify(r.post)}.`);
    if (!r.instructions.every(line => line.includes(`An ${r.platform} reply`))) throw new Error(`A ${r.platform} rating did not use the reply rubric: ${r.instructions.join(' | ')}`);
  }
  writeFileSync(resolve(out, 'steps.json'), JSON.stringify({ result: 'PASS', steps: [
    'Open the X feed fixture (three posts, no reply box) and tap the bubble once',
    'Read the panel: every post rated, the one that clears the bar marked, the reply written for the best',
    'Repeat at 360, 390 and 445 dp in light and dark',
  ], result_detail: 'one marked post per capture (Strong fit), the other two below the bar, no Insert without a box', postRatings: asks.length, replyRatings: replyAsks.length,
  route: 'Jev fixed-answer HTTP fixture for the levels; reply cards from the E2E writer stub; no real account, network or spend' }, null, 2));
  console.log(`worth-reply: PASS (${asks.length} post ratings, ${replyAsks.length} reply ratings). Shots and log in ${out}.`);
} finally {
  standin.close();
  rmSync(scratch, { recursive: true, force: true });
  try { evidence('theme', 'light'); } catch { /* leave it */ }
  try { adb('shell', 'wm', 'size', 'reset'); adb('shell', 'wm', 'density', 'reset'); } catch { /* device gone */ }
}

// Own-post fit proof (AA-04): a new post typed in the X and Reddit composer fixtures opens
// "Polish your post", and the typed post and each version carry the fit bar, rated as a post.
// The fit levels come from a fixed-answer Jev stand-in through the real decide path (fitBackends ->
// jev() -> judgeFit); the stand-in fails the run unless every request carries the platform's post
// rubric and no parent post. OWNVOICE_BEFORE=1 against the base build captures the same screens and
// checks that no bar shows and nothing is rated, so before and after sit side by side.
//
// Owned emulator only, never the test phone; taps through the probe, never uiautomator dump.
//   ANDROID_SERIAL=emulator-XXXX OWNVOICE_AVD_NAME=<avd> JAVA_HOME=<jdk> node e2e/own-post-fit.mjs <release-apk> [outdir]
// The release APK needs EXPO_PUBLIC_E2E_STUB=1 EXPO_PUBLIC_E2E_GPT=1
// EXPO_PUBLIC_E2E_AUTH_BASE=http://10.0.2.2:21455 EXPO_PUBLIC_JEV_KEY=stand-in
// EXPO_PUBLIC_E2E_JEV_BASE=http://10.0.2.2:18612, and e2e/first-run.mjs run once first so setup is
// finished with ChatGPT. Shots, the stand-in's requests and the read levels land in [outdir].
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
const before = process.env.OWNVOICE_BEFORE === '1';
const label = before ? 'before' : 'after';
const out = resolve(process.argv[3] ?? 'e2e/artifacts/own-post-fit');
mkdirSync(out, { recursive: true });
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evidence = (...args) => execFileSync('bash', [resolve(repoRoot, 'mobile/e2e/evidence.sh'), ...args],
  { env: { ...process.env, ANDROID_SERIAL: serial }, encoding: 'utf8', cwd: repoRoot });

const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const FIXTURES = {
  // The panel keeps one fit per distinct text, so each typed post has a comma: the stub's Shorter
  // version cuts at it, and every card then carries its own level.
  x: { pkg: 'com.twitter.android', name: 'X', text: 'Shipped offline saving in Ownvoice today, after a month of flaky sync' },
  reddit: { pkg: 'com.reddit.frontpage', name: 'Reddit', text: 'How do you test offline saving on Android, without a flaky network' },
};
const LEVELS = ['Likely to be skipped', 'Might get a reply', 'Good fit here', 'Strong fit here'];
const FIT_WORDS = [...LEVELS, 'Not sure about this one'];
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
const wait = ms => new Promise(r => setTimeout(r, ms));
// Fixture and probe builds stay out of [outdir], which holds only the proof.
const scratch = mkdtempSync(join(tmpdir(), 'own-post-fit-'));
const nodes = accessibilityProbe(serial, scratch);
const shot = name => writeFileSync(resolve(out, `${name}-${label}.png`), execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 24 * 1024 * 1024 }));
const tap = (...point) => adb('shell', 'input', 'tap', String(Math.round(point[0])), String(Math.round(point[1])));
const until = async (find, what, tries = 40) => {
  for (let i = 0; i < tries; i++) { const found = await find(); if (found) return found; await wait(1000); }
  throw new Error(`Timed out waiting for ${what}.`);
};
const fitLines = () => adb('logcat', '-d', '-s', 'ReactNativeJS:I').split('\n').filter(line => line.includes('ownvoice-fit '));

/** Fixed levels by card order (Yours first), so each card's bar is told apart on screen. decide
 *  needs every level keyed with probabilities summing to 1, so the picked level takes it all. */
const ORDER = [1, 3, 2, 0];
const requests = resolve(out, 'standin-requests.jsonl');
writeFileSync(requests, '');
const standin = createServer((req, res) => {
  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', () => {
    if (req.method !== 'POST' || req.url !== '/v1/systemone') { res.writeHead(404).end(); return; }
    try {
      const body = JSON.parse(raw);
      const scores = Object.entries(body.questions ?? {}).filter(([, q]) => q.type === 'score');
      appendFileSync(requests, JSON.stringify({ platform: body.state?.platform, post: body.state?.post, candidates: body.state?.candidates,
        instructions: scores.map(([key, q]) => `${key}: ${String(q.instructions ?? q.question ?? '').slice(0, 60)}`) }) + '\n');
      const answers = Object.fromEntries(scores.map(([key]) => {
        const level = ORDER[Number(key.replace('fit_', '')) % ORDER.length];
        return [key, { probabilities: Object.fromEntries([0, 1, 2, 3].map(l => [String(l), l === level ? 1 : 0])), confidence: 1 }];
      }));
      res.writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ model: 'stand-in:own-post-fixed', answers, usage: { input_tokens: 0, output_tokens: 0 } }));
    } catch (e) { console.error(e); res.writeHead(500).end(); }
  });
});
await new Promise(r => standin.listen(18612, '127.0.0.1', r));

/** The Composer fixture under one package id, host-side (as e2e/grow-reply-live.mjs builds it). */
function buildFixture(name, targetPkg) {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), 'Android/Sdk');
  const javaHome = process.env.JAVA_HOME;
  if (!javaHome) throw new Error('Set JAVA_HOME to the JDK used to build the app.');
  const env = { ...process.env, PATH: `${javaHome}/bin:${process.env.PATH}` };
  const run = (cmd, args) => execFileSync(cmd, args, { env, stdio: 'pipe' });
  const build = resolve(scratch, name);
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
  const built = join(build, 'fixture.apk');
  const manifest = join(build, 'AndroidManifest.xml');
  writeFileSync(manifest, `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${targetPkg}">
  <uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36" />
  <application android:label="${name}" android:theme="@android:style/Theme.Material.Light">
    <activity android:name="${targetPkg}.Composer" android:exported="true" android:label="${name}">
      <intent-filter><action android:name="android.intent.action.MAIN" /><category android:name="android.intent.category.LAUNCHER" /></intent-filter>
    </activity>
  </application>
</manifest>`);
  run(join(tools, 'aapt'), ['package', '-f', '-M', manifest, '-I', platform, '-F', built]);
  run('zip', ['-j', built, join(build, 'classes.dex')]);
  run(join(tools, 'apksigner'), ['sign', '--ks', fileURLToPath(new URL('../android/app/debug.keystore', import.meta.url)), '--ks-key-alias', 'androiddebugkey', '--ks-pass', 'pass:android', built]);
  return built;
}

const rebind = async () => {
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', 'com.example.disabled/NoService');
  await wait(1000);
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', component);
  adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
  for (let i = 0; i < 15 && !/Bound services:\s*\{[^}]*Ownvoice/.test(adb('shell', 'dumpsys', 'accessibility')); i++) await wait(2000);
};
const bubble = () => until(() => nodes().find(node => node.windowType === 4 && /^Ownvoice(?:,|$)/.test(node.label)), 'the bubble');
const panelNodes = () => nodes().filter(n => n.app === pkg && ((n.text ?? '') || (n.label ?? '')).trim());
const levelsShown = list => list.map(n => (n.label ?? '').trim()).filter(l => FIT_WORDS.includes(l));

/** The offline ChatGPT stand-in keeps its connection in memory, so every app restart (an install,
 *  the theme flip) ends it and the phone writer takes over quietly. Reconnect through the app's own
 *  writer screen before each round, so the cards and the fit come from the ChatGPT route. */
const connect = async () => {
  const connected = () => nodes().some(node => node.app === pkg && /ChatGPT is connected/.test(node.text ?? ''));
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source', pkg);
  await until(() => nodes().some(node => node.app === pkg && /How Ownvoice writes/.test(node.text ?? '')), 'the writer screen', 30);
  if (!connected()) {
    nodes('Continue with ChatGPT');
    await until(connected, 'the reconnected ChatGPT stand-in', 40);
  }
  adb('shell', 'input', 'keyevent', '3');
  await wait(1500);
};

/** One own post on one platform in one theme: type it, open the panel, wait for the rated cards. */
async function one(id, theme) {
  const fix = FIXTURES[id];
  adb('logcat', '-c');
  adb('shell', 'am', 'force-stop', fix.pkg);
  await wait(600);
  const open = async () => {
    adb('shell', 'am', 'start', '-n', `${fix.pkg}/${fix.pkg}.Composer`, '--es', 'label', fix.name);
    const field = await until(() => nodes().find(node => node.className === 'android.widget.EditText' && node.editable), `the ${fix.name} composer`);
    tap(...center(field));
    await wait(600);
    adb('shell', 'input', 'text', fix.text.replaceAll(' ', '%s'));
    await wait(1200);
    adb('shell', 'input', 'keyevent', '4'); // Drop the keyboard so the bubble tap cannot land on it.
    await wait(1200);
    tap(...center(await bubble()));
    await wait(2500);
  };
  await open();
  const title = `Polish your post · ${fix.name}`;
  await until(() => panelNodes().some(n => (n.text ?? '').startsWith(title)), `"${title}"`, 60);
  await until(() => panelNodes().filter(n => /^Use this$/.test(n.text ?? '')).length >= 2, 'the versions', 60);
  if (before) await wait(8000);
  else await until(() => fitLines().length && levelsShown(panelNodes()).length >= 2, 'the fit bars', 90);
  await wait(1500);
  const top = panelNodes();
  shot(`${id}-post-${theme}`);
  // The last versions sit below the fold: scroll the sheet once and read and shoot again.
  const [w, h] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
  adb('shell', 'input', 'swipe', String(w / 2), String(Math.round(h * 0.8)), String(w / 2), String(Math.round(h * 0.35)), '500');
  await wait(1500);
  const below = panelNodes();
  shot(`${id}-post-scrolled-${theme}`);
  const seen = [...new Map([...top, ...below].filter(n => FIT_WORDS.includes((n.label ?? '').trim()))
    .map(n => [`${n.label}`, n.label])).values()];
  const texts = [...top, ...below].map(n => n.text).filter(Boolean);
  const result = { platform: id, theme, label, title, levels: seen, fit: fitLines().at(-1) ?? null, texts };
  appendFileSync(resolve(out, 'results.jsonl'), JSON.stringify(result) + '\n');
  console.log(`${id}/${theme}/${label}: levels=${JSON.stringify(seen)}`);
  if (before) {
    if (seen.length || result.fit) throw new Error(`The base build already rated the ${fix.name} post: ${JSON.stringify(seen)}.`);
  } else {
    // Yours plus the stub's versions: four cards, levels 1, 3, 2, 0 in card order, every level once.
    const missing = LEVELS.filter(level => !seen.includes(level));
    if (missing.length) throw new Error(`The ${fix.name} post panel is missing the levels ${missing.join(', ')}; saw ${JSON.stringify(seen)}.`);
  }
  adb('shell', 'input', 'keyevent', '4');
  await wait(1000);
}

try {
  for (const [id, fix] of Object.entries(FIXTURES)) {
    try { adb('shell', 'pm', 'uninstall', fix.pkg); } catch { /* nothing installed yet */ }
    execFileSync('adb', ['-s', serial, 'install', '-r', buildFixture(fix.name, fix.pkg)], { stdio: 'inherit' });
  }
  // Both fixture packages are on by default (src/core/defaultApps.json), so no switch is touched.
  if (!adb('shell', 'pm', 'path', pkg).includes('package:')) throw new Error('Install the app and run e2e/first-run.mjs first.');
  for (const theme of ['light', 'dark']) {
    evidence('theme', theme);
    // React Native reads the colour scheme at process start (AGENTS.md): restart, then rebind.
    adb('shell', 'am', 'force-stop', pkg);
    await rebind();
    await connect();
    for (const id of Object.keys(FIXTURES)) await one(id, theme);
  }
  // Every request the stand-in saw must be a post rating: the platform's post rubric, no parent.
  const seen = readFileSync(requests, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  if (before) {
    if (seen.length) throw new Error(`The base build asked for a post rating ${seen.length} times.`);
  } else {
    if (seen.length < 4) throw new Error(`Expected a post rating per platform and theme; the stand-in saw ${seen.length}.`);
    for (const r of seen) {
      if (r.post !== '') throw new Error(`A post rating carried a parent post: ${JSON.stringify(r.post)}.`);
      if (!r.instructions.every(line => line.includes(`A new ${r.platform} post`))) throw new Error(`A ${r.platform} rating did not use the post rubric: ${r.instructions.join(' | ')}`);
    }
  }
  console.log(`own-post-fit ${label}: PASS (${seen.length} stand-in requests). Shots and log in ${out}.`);
} finally {
  standin.close();
  rmSync(scratch, { recursive: true, force: true });
  try { evidence('theme', 'light'); } catch { /* leave it */ }
}

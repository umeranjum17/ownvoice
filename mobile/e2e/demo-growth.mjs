// Grow-mode demo captures D1 (X-style reply, ranked) and D2 (Reddit-style rules), light and dark.
// Builds the dev.ownvoice.demo WebView fixture, installs, records on the lane emulator with demo
// data (the name Umer), extracts check frames, and asserts `insert result ok=true` plus the
// expected level words. Fit levels come from a fixed-answer Jev stand-in through the real decide
// path (jev() backend + judgeFit); captions never claim reach. D3 waits on F5, D4 on F6b.
//
// Lane emulator only, never the test phone; taps through Probe, never uiautomator dump.
//   ANDROID_SERIAL=emulator-XXXX OWNVOICE_AVD_NAME=<avd> JAVA_HOME=<jdk> node e2e/demo-growth.mjs <release-apk> [outdir]
// The release APK needs EXPO_PUBLIC_E2E_STUB=1 EXPO_PUBLIC_E2E_GPT=1 EXPO_PUBLIC_DEMO_PLATFORM=1
// EXPO_PUBLIC_JEV_KEY=demo EXPO_PUBLIC_E2E_JEV_BASE=http://10.0.2.2:18612
// EXPO_PUBLIC_E2E_AUTH_BASE=http://10.0.2.2:21455, and e2e/demo-setup.mjs run once first
// so setup (ChatGPT source, mock sign-in) is finished.
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { accessibilityProbe, center } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL;
if (!/^emulator-\d+$/.test(serial ?? '')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const avd = process.env.OWNVOICE_AVD_NAME;
// ro.boot.qemu.avd_name reads the same identity without the emulator console token, which is
// empty from some lane HOMEs (lead restart pending); the serial plus this name still pins the lane AVD.
const avdName = execFileSync('adb', ['-s', serial, 'shell', 'getprop', 'ro.boot.qemu.avd_name'], { encoding: 'utf8' }).trim();
if (!avd || avdName !== avd) throw new Error(`Refusing ${serial}: AVD ${avdName} is not ${avd}.`);
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = resolve(process.argv[3] ?? '../../verify-artifacts/ov-grow-f7');
mkdirSync(out, { recursive: true });
const pkg = 'dev.ownvoice.next';
const fixture = 'dev.ownvoice.demo';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const nodes = accessibilityProbe(serial, out);
const tap = (...point) => adb('shell', 'input', 'tap', String(Math.round(point[0])), String(Math.round(point[1])));
const until = async (find, label, tries = 40) => {
  for (let i = 0; i < tries; i++) { const found = await find(); if (found) return found; await wait(1000); }
  throw new Error(`Timed out waiting for ${label}.`);
};
/** Fixed fit levels through Jev's own wire format: a link rates bottom, the sharp question top.
 *  decide needs every level keyed with probabilities summing to 1, so the picked level takes it all. */
const levelFor = text =>
  /https?:\/\//.test(text) ? 0
  : /pause when you switch apps|keeps the timer honest when the screen is off/.test(text) ? 3
  : /timers lie to me by lunch|make tea|notebook/.test(text) ? 2
  : /So inspiring/.test(text) ? 1 : 2;
const distFor = text => Object.fromEntries([0, 1, 2, 3].map(l => [String(l), l === levelFor(text) ? 1 : 0]));
const standin = createServer((req, res) => {
  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', () => {
    if (req.method !== 'POST' || req.url !== '/v1/systemone') { res.writeHead(404).end(); return; }
    try {
      const body = JSON.parse(raw);
      console.log(`stand-in: post=${JSON.stringify(body.state?.post).slice(0, 80)} candidates=${JSON.stringify(body.state?.candidates).slice(0, 200)}`);
      const answers = {};
      for (const [key, q] of Object.entries(body.questions ?? {})) {
        if (q.type !== 'score') continue;
        answers[key] = { probabilities: distFor(body.state?.candidates?.[key.replace('fit_', '')] ?? ''), confidence: 1 };
      }
      res.writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ model: 'stand-in:demo-fixed', answers, usage: { input_tokens: 0, output_tokens: 0 } }));
    } catch (e) { console.error(e); res.writeHead(500).end(); }
  });
});
await new Promise(r => standin.listen(18612, '127.0.0.1', r));

/** The WebView fixture, built host-side the way e2e/accessibility.mjs builds the probe. */
const buildFixture = () => {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), 'Android/Sdk');
  const javaHome = process.env.JAVA_HOME;
  if (!javaHome) throw new Error('Set JAVA_HOME to the JDK used to build the app.');
  const env = { ...process.env, PATH: `${javaHome}/bin:${process.env.PATH}` };
  const run = (cmd, args) => execFileSync(cmd, args, { env, stdio: 'pipe' });
  const build = resolve(out, '.demo-fixture');
  const classes = join(build, 'classes');
  mkdirSync(classes, { recursive: true });
  const latest = dir => readdirSync(dir).filter(x => /^android-\d+$/.test(x) || /^\d+\.\d+/.test(x))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
  const tools = join(sdk, 'build-tools', latest(join(sdk, 'build-tools')));
  const platform = join(sdk, 'platforms', latest(join(sdk, 'platforms')), 'android.jar');
  const dir = fileURLToPath(new URL('./fixture-demo/', import.meta.url));
  run(join(javaHome, 'bin/javac'), ['-cp', platform, '-d', classes, join(dir, 'Demo.java')]);
  const jar = join(build, 'demo.jar');
  run(join(javaHome, 'bin/jar'), ['cf', jar, '-C', classes, '.']);
  run(join(tools, 'd8'), ['--lib', platform, '--output', build, jar]);
  const built = join(build, 'demo-fixture.apk');
  run(join(tools, 'aapt'), ['package', '-f', '-M', join(dir, 'AndroidManifest.xml'), '-I', platform, '-F', built]);
  run('zip', ['-j', built, join(build, 'classes.dex')]);
  run(join(tools, 'apksigner'), ['sign', '--ks', fileURLToPath(new URL('../android/app/debug.keystore', import.meta.url)),
    '--ks-key-alias', 'androiddebugkey', '--ks-pass', 'pass:android', built]);
  return built;
};

execFileSync('adb', ['-s', serial, 'install', '-r', buildFixture()], { stdio: 'inherit' });
execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
adb('shell', 'settings', 'put', 'system', 'screen_off_timeout', '1800000');
adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
// Any install switches the service off: re-enable and confirm it bound, in the same journey.
adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', component);
adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
await wait(3000);
if (!/Bound services[\s\S]*Ownvoice/.test(adb('shell', 'dumpsys', 'accessibility'))) throw new Error('Ownvoice service did not bind after install.');

/** Switch the fixture on through Home > Where the bubble shows (run-as fails on release builds). */
const enableFixture = async () => {
  // The apps list loads once on mount, so remount it cold to see the just-installed fixture.
  // (The mock sign-in is re-established by setTheme afterwards.)
  adb('shell', 'am', 'force-stop', pkg);
  await wait(2000);
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://apps', pkg);
  await wait(4000);
  // The list scrolls: try search first, then swipe up until the row scrolls into view.
  const search = nodes().find(n => n.clickable && /find an app|search/i.test(`${n.label} ${n.text}`));
  if (search && !nodes().some(n => n.checkable && /ownvoice demo/i.test(n.label ?? ''))) {
    tap(...center(search));
    await wait(800);
    adb('shell', 'input', 'text', 'Demo');
    await wait(1200);
    adb('shell', 'input', 'keyevent', '4');
    await wait(600);
  }
  const row = await until(() => {
    const found = nodes().find(n => n.checkable && /ownvoice demo/i.test(n.label ?? ''));
    if (found) return found;
    adb('shell', 'input', 'swipe', '540', '1900', '540', '700', '400');
    return undefined;
  }, 'the demo app row', 12);
  if (!row.checked) tap(...center(row));
  await until(() => nodes().find(n => n.checkable && /ownvoice demo/i.test(n.label ?? '') && n.checked), 'the demo row on');
};
await enableFixture();

/** Force-stop-safe theme flip: RN reads the scheme at start, and the service rebinds on toggle. */
const setTheme = async dark => {
  adb('shell', 'cmd', 'uimode', 'night', dark ? 'yes' : 'no');
  if (!new RegExp(`mComputedNightMode=${dark}`).test(adb('shell', 'dumpsys', 'uimode')))
    throw new Error(`Could not switch to ${dark ? 'dark' : 'light'} mode.`);
  adb('shell', 'am', 'force-stop', pkg);
  const enabled = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
  const off = enabled.split(':').filter(x => x !== component).join(':') || 'com.example.disabled/NoService';
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', off);
  await wait(1500);
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', enabled.includes(component) ? enabled : `${off}:${component}`);
  await wait(2000);
  // The mock ChatGPT session lives in memory: sign in again after the force-stop. After a
  // force-stop it is unsigned, so tap the connect button and let the mock code approve itself.
  const tapNode = n => adb('shell', 'input', 'tap', String(Math.round((n.bounds[0] + n.bounds[2]) / 2)), String(Math.round((n.bounds[1] + n.bounds[3]) / 2)));
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source', pkg);
  await until(() => nodes().some(n => /sign out of chatgpt|continue with|chatgpt is connected|your code|kqpt/i.test(`${n.label} ${n.text}`)), 'the source screen', 20);
  const signout = nodes().find(n => n.clickable && /sign out of chatgpt/i.test(`${n.label} ${n.text}`));
  if (signout) {
    tapNode(signout);
    await until(() => !nodes().some(n => /sign out of chatgpt/i.test(`${n.label} ${n.text}`)), 'the sign-out', 20);
  }
  // The card itself is a no-op tap when ChatGPT is already the source: hit the button only.
  const connect = await until(() => nodes().find(n => n.clickable && /^continue with chatgpt$/i.test(`${n.label} ${n.text}`.trim())), 'the connect button', 20);
  tapNode(connect);
  await wait(15000); // the mock code approves itself about 9 s after it shows
  await until(() => nodes().some(n => /chatgpt is connected/i.test(`${n.label} ${n.text}`)), 'the reconnected session', 20);
  adb('shell', 'input', 'keyevent', '4');
  await wait(800);
};

/** screenrecord blocks its adb client, so it runs detached; killing the client finalizes the mp4. */
const recordStart = remote => {
  adb('shell', 'rm', '-f', remote);
  const child = spawn('adb', ['-s', serial, 'shell', 'screenrecord', '--bit-rate', '12M', remote], { stdio: 'ignore', detached: true });
  child.unref();
  return child;
};
const recordStop = async child => {
  try { adb('shell', 'pkill', '-INT', 'screenrecord'); } catch {} // clean device-side stop keeps the moov atom
  await wait(2500);
  try { child.kill('SIGTERM'); } catch {} // fallback: killing the client finalizes the mp4
  await wait(1000);
};
/** One demo take: screenrecord the bubble tap, panel, and (D1) insert; stop cleanly with SIGINT. */
const take = async (id, page, caption, expectWords, insert) => {
  adb('logcat', '-c');
  const remote = `/data/local/tmp/${id}.mp4`;
  const rec = recordStart(remote);
  await wait(1200);
  // A relaunch onto the running fixture may not take: force-stop so the page extra always applies.
  adb('shell', 'am', 'force-stop', fixture);
  await wait(1000);
  adb('shell', 'am', 'start', '-n', `${fixture}/dev.ownvoice.demo.Demo`, '--es', 'page', page);
  const field = await until(() => nodes().find(n => n.editable), 'the fixture field');
  tap(...center(field));
  await wait(800);
  const bubble = await until(() => nodes().find(n => n.windowType === 4 && /^Ownvoice(?:,|$)/.test(n.label ?? '')), 'the bubble');
  tap(...center(bubble));
  const line = await until(() => adb('logcat', '-d', '-s', 'ReactNativeJS:I').split('\n').filter(l => l.includes('ownvoice-fit ')).at(-1), 'the fit log line', 90);
  const fits = JSON.parse(line.slice(line.indexOf('ownvoice-fit ') + 'ownvoice-fit '.length));
  for (const words of expectWords) {
    if (!fits.some(f => f.words === words)) {
      console.log(`logcat tail: ${adb('logcat', '-d', '-s', 'ReactNativeJS:I').split('\n').filter(l => /fit|jev|decide|error/i.test(l)).slice(-6).join(' | ')}`);
      throw new Error(`${id}: no card said ${words}: ${JSON.stringify(fits.map(f => f.words))}`);
    }
  }
  await wait(2500); // let the bars fill on the recording
  if (insert) {
    // Back with no keyboard showing closes the panel: only dismiss a shown keyboard.
    if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) { adb('shell', 'input', 'keyevent', '4'); await wait(600); }
    adb('logcat', '-c');
    for (let i = 0; i < 4; i++) {
      const button = await until(() => {
        const picks = nodes().filter(n => n.clickable && /^(use this|insert)$/i.test(`${n.label} ${n.text}`.trim()));
        return picks[1] ?? picks[0]; // first is the Yours card; insert the top suggestion
      }, 'the top suggestion button');
      tap(...center(button));
      await wait(3000);
      if (/insert result ok=true/.test(adb('logcat', '-d', '-s', 'OwnvoiceNative:I'))) break;
      if (!nodes().some(n => /pick one to use instead|insert|use this/i.test(`${n.label} ${n.text}`))) break;
    }
    await wait(1500);
    const logged = adb('logcat', '-d', '-s', 'OwnvoiceNative:I');
    if (!/insert result ok=true/.test(logged)) throw new Error(`${id}: the insert did not land.`);
  }
  await wait(1200);
  await recordStop(rec);
  const local = resolve(out, `OWNVOICE-grow-${id}.mp4`);
  execFileSync('adb', ['-s', serial, 'pull', remote, local], { stdio: 'inherit' });
  adb('shell', 'rm', '-f', remote);
  execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', local], { stdio: 'inherit' });
  // The caption lives in its own padded band below the app frame, never over app content.
  const captioned = resolve(out, `OWNVOICE-grow-${id}-captioned.mp4`);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', local, '-vf',
    `pad=iw:ih+120:0:0:color=black,drawtext=text='${caption}':fontsize=44:fontcolor=white:x=(w-text_w)/2:y=h-85`,
    '-c:a', 'copy', captioned], { stdio: 'inherit' });
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', '9', '-i', captioned, '-frames:v', '1', resolve(out, `OWNVOICE-grow-${id}.png`)], { stdio: 'inherit' });
  console.log(`${id}: levels [${fits.map(f => f.words).join(' | ')}]${insert ? ', insert ok' : ''}`);
};

for (const dark of [false, true]) {
  await setTheme(dark);
  const mode = dark ? 'dark' : 'light';
  await take(`D1-${mode}`, 'x', 'X-style demo. You press Post yourself.', ['Strong fit here', 'Good fit here'], true);
  await take(`D2-${mode}`, 'reddit', 'Reddit-style demo. Links can mean fewer views.', ['Likely to be skipped', 'Strong fit here'], false);
}
standin.close();
console.log(`Demo captures saved to ${out}.`);

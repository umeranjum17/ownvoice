// Phone-writer voice-rules proof on the real test phone ONLY (serial a4b93ea2).
// Test-only driver: never import from app code, never touches product code.
// Emulators are refused outright (this task holds no emulator slot).
//
// Screen reading is screenshots + tesseract OCR (the release-device pattern from
// e2e/settings.mjs): the UiAutomation probe sees no windows on this phone, and dumping
// UiAutomation on a phone risks unbinding the app's own accessibility service.
// The bubble is an overlay window: its position comes from `dumpsys window` (read-only).
//
// Modes (one locked device call each; state persists on the phone between calls):
//   recon <out>   read-only look: packages, wifi, Home/source/voice/apps screens
//   setup <out>   walk onboarding toward Home (kept for fresh installs; unused when done)
//   finish <out>  tap through whatever setup remains (Continue on the Home hero,
//                 Done on the apps step) until Home names the writer or setup ends
//   choose <out>   open the source screen, choose On this phone, say yes to the one-time
//                 model download when asked (records download-start.txt), then leave it running
//   dlwait <out>  wait until the phone writer is ready (records elapsed time)
//   voice <out>   the ov-pm-17 protocol: 5 runs rule-off, 5 rule-on, 1 lowercase-blunt note
//   journey <out> scorecard: 10 reply taps in the X composer, then 10 polishes in a Chrome page
// Env: ANDROID_SERIAL must be a4b93ea2; OV_THEME=light|dark (default light).
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PHONE = 'a4b93ea2';
const serial = process.env.ANDROID_SERIAL;
if (serial !== PHONE) throw new Error(`Refusing ${serial ?? '(unset)'}: this driver runs only on the test phone ${PHONE}.`);
const theme = process.env.OV_THEME ?? 'light';
if (!['light', 'dark'].includes(theme)) throw new Error(`OV_THEME must be light or dark, got ${theme}.`);
const mode = process.argv[2] ?? 'recon';
const out = resolve(process.argv[3] ?? `e2e/artifacts/phone-voice-${theme}`);
mkdirSync(out, { recursive: true });

const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const wait = ms => new Promise(r => setTimeout(r, ms));
const adb = (...a) => execFileSync('adb', ['-s', serial, ...a], { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 });
const tap = (x, y) => adb('shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y)));
const [SW, SH] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);

// --- screenshots through a file on the device: `exec-out screencap` comes back cut
// --- short over a forwarded adb (same pattern as e2e/settings.mjs).
const shot = name => {
  const remote = `/sdcard/ov-shot-${process.pid}.png`;
  const local = resolve(out, `${name}.png`);
  adb('shell', 'screencap', '-p', remote);
  execFileSync('adb', ['-s', serial, 'pull', remote, local], { stdio: 'pipe' });
  return local;
};
// --- OCR: tesseract TSV gives every word with its box; words group into lines. ---
const ocr = (png, crop = null) => {
  let input = readFileSync(png);
  if (crop) {
    const [w, h, x, y] = crop;
    input = execFileSync('convert', ['png:-', '-crop', `${w}x${h}+${x}+${y}`, 'png:-'], { input, maxBuffer: 24 * 1024 * 1024 });
  }
  const tsv = execFileSync('tesseract', ['stdin', 'stdout', 'tsv'], { input, encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 });
  // TSV columns: level page block par line word left top width height conf text.
  const words = [];
  for (const line of tsv.split('\n').slice(1)) {
    const c = line.split('\t');
    if (c.length < 12 || !c[11].trim()) continue;
    words.push({ key: `${c[2]}.${c[3]}.${c[4]}`, text: c[11].trim(), x0: Number(c[6]), y0: Number(c[7]), x1: Number(c[6]) + Number(c[8]), y1: Number(c[7]) + Number(c[9]) });
  }
  const lines = new Map();
  for (const w of words) {
    if (!lines.has(w.key)) lines.set(w.key, []);
    lines.get(w.key).push(w);
  }
  return [...lines.values()].map(ws => {
    ws.sort((a, b) => a.x0 - b.x0);
    const x0 = Math.min(...ws.map(w => w.x0)), y0 = Math.min(...ws.map(w => w.y0));
    const x1 = Math.max(...ws.map(w => w.x1)), y1 = Math.max(...ws.map(w => w.y1));
    return { text: ws.map(w => w.text).join(' '), x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  });
};
const read = (name, crop = null) => {
  const png = shot(name);
  const lines = ocr(png, crop);
  writeFileSync(resolve(out, `${name}.ocr.txt`), lines.map(l => l.text).join('\n') + '\n');
  return { png, lines, text: lines.map(l => l.text).join('\n') };
};
const findLine = (lines, re, from = 0) => lines.findIndex((l, i) => i >= from && re.test(l.text));
const tapLine = (lines, re, occurrence = 0) => {
  let seen = -1;
  for (const l of lines) {
    if (!re.test(l.text)) continue;
    if (++seen < occurrence) continue;
    tap(l.cx, l.cy);
    return l;
  }
  return null;
};
// --- probe2: a second standalone accessibility probe under our own package.
// --- The shared dev.ownvoice.probe build on this phone returns no windows; a fresh
// --- build from this repo's probe source sees the full tree. Used only to tap the
// --- voice-screen chips by their content descriptions (exact bounds), never to read
// --- panels (screenshots + OCR stay the panel evidence).
const probe2Apk = () => {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), 'Android/Sdk');
  const javaHome = process.env.JAVA_HOME;
  if (!javaHome) throw new Error('Set JAVA_HOME to the JDK used to build the app.');
  const env = { ...process.env, PATH: `${javaHome}/bin:${process.env.PATH}` };
  const run = (cmd, args) => execFileSync(cmd, args, { env, stdio: 'pipe' });
  const here = dirname(fileURLToPath(import.meta.url));
  const build = resolve(out, '.probe2');
  const classes = join(build, 'classes');
  mkdirSync(classes, { recursive: true });
  const newest = a => a.sort((x, y) => x.localeCompare(y, undefined, { numeric: true })).at(-1);
  const tools = join(sdk, 'build-tools', newest(readdirSync(join(sdk, 'build-tools'))));
  const plats = readdirSync(join(sdk, 'platforms')).filter(x => /^android-\d+$/.test(x));
  const platform = join(sdk, 'platforms', newest(plats), 'android.jar');
  writeFileSync(join(build, 'AndroidManifest.xml'), '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="dev.ownvoice.probe2"><uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36"/><application android:label="Probe2"/><instrumentation android:name="dev.ownvoice.probe2.Probe2" android:targetPackage="dev.ownvoice.probe2"/></manifest>');
  const src = join(build, 'Probe2.java');
  writeFileSync(src, readFileSync(join(here, 'probe/Probe.java'), 'utf8')
    .replace('package dev.ownvoice.probe;', 'package dev.ownvoice.probe2;').replace('public class Probe ', 'public class Probe2 '));
  run(join(javaHome, 'bin/javac'), ['-cp', platform, '-d', classes, src]);
  run(join(javaHome, 'bin/jar'), ['cf', join(build, 'probe.jar'), '-C', classes, '.']);
  run(join(tools, 'd8'), ['--lib', platform, '--output', build, join(build, 'probe.jar')]);
  run(join(tools, 'aapt'), ['package', '-f', '-M', join(build, 'AndroidManifest.xml'), '-I', platform, '-F', join(build, 'probe.apk')]);
  run('zip', ['-j', join(build, 'probe.apk'), join(build, 'classes.dex')]);
  run(join(tools, 'apksigner'), ['sign', '--ks', fileURLToPath(new URL('../android/app/debug.keystore', import.meta.url)), '--ks-key-alias', 'androiddebugkey', '--ks-pass', 'pass:android', join(build, 'probe.apk')]);
  return join(build, 'probe.apk');
};
let probe2ready = false;
const nodesP = () => {
  if (!probe2ready) {
    const present = adb('shell', 'pm', 'list', 'packages', 'dev.ownvoice.probe2').includes('dev.ownvoice.probe2');
    if (!present) execFileSync('adb', ['-s', serial, 'install', '-r', probe2Apk()], { stdio: 'pipe' });
    probe2ready = true;
  }
  const output = execFileSync('adb', ['-s', serial, 'shell', 'am', 'instrument', '-w', 'dev.ownvoice.probe2/dev.ownvoice.probe2.Probe2'], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
  const json = output.match(/^INSTRUMENTATION_RESULT: nodes=(.+)$/m)?.[1];
  if (!json || !output.includes('INSTRUMENTATION_CODE: 0')) throw new Error(`probe2 failed: ${output.slice(0, 300)}`);
  return JSON.parse(json);
};
const waitText = async (name, re, tries = 30, pause = 2000) => {
  for (let i = 0; i < tries; i++) {
    const r = read(`${name}-${i}`);
    if (re.test(r.text)) return r;
    await wait(pause);
  }
  const r = read(`${name}-last`);
  throw new Error(`Timed out waiting for ${re} (see ${name}-*.png; last: ${r.text.slice(0, 300)})`);
};
// --- the bubble is an overlay window: read its frame from dumpsys (read-only). ---
// --- The bubble is small (~a fingerprint wide); the panel and activities are not. ---
const bubbleFrame = () => {
  const dump = adb('shell', 'dumpsys', 'window', 'windows');
  const lines = dump.split('\n');
  const frameOf = i => {
    // This Android's dumpsys prints `frame=[x0,y0][x1,y1]` on the Frames: line.
    const m = lines.slice(i, i + 40).join(' ').match(/frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!m) return null;
    const f = { x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], raw: lines[i].trim().slice(0, 160) };
    return (f.x1 - f.x0 > 0 && f.y1 - f.y0 > 0 && f.y0 >= 0) ? f : null;
  };
  // First: the bubble overlay window, titled with the bare package (no /MainActivity).
  for (let i = 0; i < lines.length; i++) {
    if (new RegExp(`Window #\\d+ \\S+ u0 ${pkg}\\}:`).test(lines[i])) {
      const f = frameOf(i);
      if (f) return f;
    }
  }
  // Fallback: any other small Ownvoice window that is not the main activity.
  const cands = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/Window #\d+.*ownvoice/i.test(lines[i]) || /MainActivity/.test(lines[i])) continue;
    const f = frameOf(i);
    if (f) cands.push(f);
  }
  cands.sort((a, b) => (a.x1 - a.x0) * (a.y1 - a.y0) - ((b.x1 - b.x0) * (b.y1 - b.y0)));
  return cands.find(f => (f.x1 - f.x0) < 400 && (f.y1 - f.y0) < 400) ?? cands[0] ?? null;
};
const logTail = () => adb('logcat', '-d', '-s', 'ReactNativeJS:I').split('\n').filter(l => /Ownvoice|ownvoice-fit/.test(l));
const refused = () => logTail().find(l => /no-answer/.test(l)) ?? null;
const rebind = async () => {
  adb('shell', 'am', 'force-stop', pkg);
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', 'com.example.disabled/NoService');
  await wait(900);
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', component);
  adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
  await wait(2500);
};

const VOICE_THREAD = {
  post: 'Sorry I dropped the ball on the notes this week, work got away from me.',
  point: 'honestly no worries, take your time',
};
const results = resolve(out, 'results.jsonl');
if (!process.env.OV_APPEND && (mode === 'voice' || mode === 'journey')) writeFileSync(results, '');
const record = row => { appendFileSync(results, JSON.stringify(row) + '\n'); console.log(JSON.stringify(row).slice(0, 300)); };

if (mode === 'recon') {
  const info = [];
  info.push(`screen: ${SW}x${SH}`);
  info.push(`model: ${adb('shell', 'getprop', 'ro.product.model').trim()}`);
  info.push(`ownvoice: ${adb('shell', 'dumpsys', 'package', pkg).split('\n').filter(l => /versionName|versionCode/.test(l)).map(l => l.trim()).join(' ')}`);
  info.push(`twitter.pkg: ${adb('shell', 'pm', 'list', 'packages', 'com.twitter.android').trim() || '(absent)'}`);
  info.push(`wifi: ${adb('shell', 'dumpsys', 'wifi').split('\n').find(l => /Wi-Fi is (en|dis)abled/.test(l))?.trim() ?? '(see dumpsys)'}`);
  info.push(`service: ${adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim()}`);
  for (const route of ['home', 'source', 'voice', 'apps']) {
    if (route === 'home') adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
    else adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `ownvoice://${route}`, pkg);
    await wait(3000);
    read(`recon-${route}`);
  }
  writeFileSync(resolve(out, 'recon-info.txt'), info.join('\n') + '\n');
  console.log(info.join('\n'));
  console.log(`RECON_DONE out=${out}`);
} else if (mode === 'setup') {
  // Walk onboarding from whatever step it is on (shared device: another walk may have
  // advanced it) to Home. Stops early when the one-time model download starts.
  adb('shell', 'cmd', 'uimode', 'night', theme === 'dark' ? 'yes' : 'no');
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
  await wait(5000);
  const tapFirst = (r, re) => { const l = r.lines.find(x => re.test(x.text)); if (l) tap(l.cx, l.cy); return !!l; };
  for (let i = 0; i < 24; i++) {
    const r = read(`setup-${i}`);
    console.log(`SETUP[${i}]: ${r.text.slice(0, 160)}`);
    if (/where the bubble shows|your voice|your growth|replies you inserted/i.test(r.text) && !/how.*writes|choose who writes|let ownvoice see|tap the bubble to polish|practice/i.test(r.text)) {
      // A Home-like screen (apps list, voice, growth): Done finishes setup when present.
      // Done sits at the bottom, above the gesture bar: look, scroll once, look again.
      if (tapFirst(r, /^(done|finish|got it)$/i)) { await wait(3000); continue; }
      adb('shell', 'input', 'swipe', String(SW / 2), String(SH * 0.7), String(SW / 2), String(SH * 0.3), '300');
      await wait(1500);
      const r2 = read(`setup-${i}-scrolled`);
      if (tapFirst(r2, /^(done|finish|got it)$/i)) { await wait(3000); continue; }
      console.log(`SETUP_DONE at step ${i} out=${out}`);
      break;
    }
    if (/write replies that/i.test(r.text)) { tapFirst(r, /continue/i); await wait(3000); continue; }
    if (/choose who writes|how ownvoice writes/i.test(r.text)) {
      if (!/on this phone/i.test(r.text)) throw new Error('choice screen names no phone writer');
      // Pick the phone row when its radio is empty, then Continue.
      tapFirst(r, /on this phone/i);
      await wait(2500);
      const r2 = read(`setup-${i}-picked`);
      if (/get this phone ready to write/i.test(r2.text)) {
        if (tapFirst(r2, /get it ready/i)) {
          writeFileSync(resolve(out, 'download-start.txt'), `start=${new Date().toISOString()}\n`);
          console.log('SETUP_STOP: download started during setup');
          break;
        }
      }
      if (tapFirst(r2, /^(continue|next|done)$/i) || tapFirst(r2, /continue|next/i)) { await wait(3500); continue; }
      console.log('SETUP_STOP: choice screen has no way forward; see shot');
      break;
    }
    if (/let ownvoice see|turn on|to read|permission/i.test(r.text)) {
      // The permission step's Turn on opens system settings; enable the service the way
      // the e2e drivers do, then come back. Leave the service OFF for now so the walk
      // routes PERMISSION -> APPS instead of PERMISSION -> TRY (practice needs a ready
      // writer); the service goes on after setup, before the voice runs.
      if (tapFirst(r, /^(continue|not now|skip|done)$/i) || tapFirst(r, /continue|not now|skip/i)) { await wait(3500); continue; }
      adb('shell', 'input', 'keyevent', '4');
      await wait(2500);
      continue;
    }
    if (/tap the bubble to polish|practice|try it|type.*polish/i.test(r.text)) {
      console.log('SETUP_STOP: practice step reached without a ready writer; see shot');
      break;
    }
    if (/get this phone ready to write|getting ownvoice ready/i.test(r.text)) {
      if (tapFirst(r, /get it ready|try again/i)) {
        writeFileSync(resolve(out, 'download-start.txt'), `start=${new Date().toISOString()}\n`);
        console.log('SETUP_STOP: download started');
        break;
      }
    }
    await wait(3000);
  }
  read('setup-last');
  console.log(`SETUP_END out=${out}`);
} else if (mode === 'finish') {
  const tapFirst = (rr, re) => { const l = rr.lines.find(x => re.test(x.text)); if (l) tap(l.cx, l.cy); return !!l; };
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
  await wait(4000);
  for (let i = 0; i < 16; i++) {
    const r = read(`finish-${i}`);
    console.log(`FINISH[${i}]: ${r.text.slice(0, 160)}`);
    if (/on this phone|writes right here|getting ownvoice ready|ready\. it writes/i.test(r.text)) { console.log('FINISH_DONE: Home names the phone writer'); break; }
    if (/write replies that/i.test(r.text) && tapFirst(r, /continue/i)) { await wait(3500); continue; }
    if (tapFirst(r, /^(done|finish|got it|continue|next|not now|skip)$/i) || tapFirst(r, /done|finish|continue|next/i)) { await wait(3500); continue; }
    adb('shell', 'input', 'swipe', String(SW / 2), String(SH * 0.7), String(SW / 2), String(SH * 0.3), '300');
    await wait(1500);
  }
  read('finish-last');
  console.log(`FINISH_END out=${out}`);
} else if (mode === 'choose') {
  const tapFirst = (rr, re) => { const l = rr.lines.find(x => re.test(x.text)); if (l) tap(l.cx, l.cy); return !!l; };
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source', pkg);
  await wait(4000);
  let r = read('choose-source');
  console.log(`CHOOSE_SOURCE: ${r.text.slice(0, 300)}`);
  if (!/on this phone/i.test(r.text)) throw new Error(`source screen names no phone writer: ${r.text.slice(0, 200)}`);
  if (/this phone can't write on its own|only some newer/i.test(r.text)) throw new Error('NOT PROVEN: this phone cannot write on its own (phone writer unsupported).');
  tapFirst(r, /on this phone/i);
  await wait(3000);
  r = read('choose-picked');
  if (/get this phone ready to write|it needs about 2 to 3/i.test(r.text)) {
    if (!tapFirst(r, /get it ready/i)) throw new Error('the Get it ready button was not found');
    writeFileSync(resolve(out, 'download-start.txt'), `start=${new Date().toISOString()}\n`);
    await wait(8000);
    r = read('choose-downloading');
    console.log(`CHOOSE_DOWNLOADING: ${r.text.slice(0, 300)}`);
    console.log('CHOOSE_DONE: download started, leaving it running');
  } else if (/ready\. it writes right here/i.test(r.text)) {
    writeFileSync(resolve(out, 'download-start.txt'), `start=already-ready ${new Date().toISOString()}\n`);
    console.log('CHOOSE_DONE: phone writer already ready, no download needed');
  } else {
    console.log(`CHOOSE_STOP: unexpected source state: ${r.text.slice(0, 300)}`);
  }
} else if (mode === 'dlwait') {
  // Poll the source screen until the phone writer is ready (bounded by the call).
  // netstats snapshots before/after let the RESULT step attribute the download bytes.
  try { writeFileSync(resolve(out, 'netstats-before.txt'), adb('shell', 'dumpsys', 'netstats', 'detail')); } catch (e) { console.log(`netstats before failed: ${String(e).slice(0, 120)}`); }
  const t0 = Date.now();
  let ready = false;
  // Poll gently (45 s cadence): each poll briefly brings the source screen forward.
  for (let i = 0; i < 38; i++) {
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source', pkg);
    await wait(4000);
    const r = read(`dlwait-${i}`);
    if (/ready\. it writes right here/i.test(r.text)) { ready = true; break; }
    if (/getting ready stopped/i.test(r.text)) throw new Error('NOT PROVEN: the model download stopped.');
    adb('shell', 'input', 'keyevent', '4');
    await wait(45000);
  }
  const secs = Math.round((Date.now() - t0) / 1000);
  try { writeFileSync(resolve(out, 'netstats-after.txt'), adb('shell', 'dumpsys', 'netstats', 'detail')); } catch (e) { console.log(`netstats after failed: ${String(e).slice(0, 120)}`); }
  writeFileSync(resolve(out, 'download-time.txt'), `pollSeconds=${secs} ready=${ready}\n`);
  console.log(`DLWAIT ready=${ready} pollSeconds=${secs}`);
  if (!ready) throw new Error('NOT PROVEN: phone writer not ready within the poll budget.');
} else if (mode === 'voice') {
  adb('shell', 'cmd', 'uimode', 'night', theme === 'dark' ? 'yes' : 'no');
  await rebind();
  const openThread = async () => {
    // Flip the foreground through Ownvoice first: the kit reshows the bubble on a
    // foreground change, not on refocusing the same field after a panel dismiss.
    adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
    await wait(1500);
    adb('shell', 'am', 'force-stop', 'com.twitter.android');
    await wait(700);
    const q = s => `'${String(s).replaceAll("'", "'\\''")}'`;
    adb('shell', 'am', 'start', '-n', 'com.twitter.android/.Composer', '--es', 'post', q(VOICE_THREAD.post), '--es', 'replyText', q(VOICE_THREAD.point), '--es', 'label', q('X'));
    const r = await waitText('thread', /take your time|what's happening/i, 30);
    // Focus the field and LEAVE it focused (keyboard included): the bubble hides when
    // the field blurs, and a Back press here closes the field instead of the keyboard.
    // Tap just past the end of the text: mid-text taps open the selection toolbar,
    // which hides the bubble.
    const fi = findLine(r.lines, /take your time/i);
    const end = fi >= 0 ? { x: Math.min(SW - 60, r.lines[fi].x1 + 50), y: r.lines[fi].cy } : null;
    if (end) tap(end.x, end.y);
    await wait(1500);
    // The service watches text changes (not focus): type a space and delete it so a
    // fresh change fires after the service is watching. The reply text is identical after.
    adb('shell', 'input', 'text', '%s');
    await wait(800);
    adb('shell', 'input', 'keyevent', '67');
    await wait(1500);
    return end;
  };
  // Tap the bubble through its overlay-window frame from dumpsys (read-only).
  // The bubble does not move between runs: cache the first frame, rescan on a miss.
  // When it hides (keyboard/selection timing), re-tap the field end to coax it back.
  const cachedFrame = () => { try { return JSON.parse(readFileSync(resolve(out, 'bubble-frame.json'), 'utf8')); } catch { return null; } };
  const tapBubble = async (tag, end) => {
    const cached = cachedFrame();
    if (cached) {
      tap((cached.x0 + cached.x1) / 2, (cached.y0 + cached.y1) / 2);
      await wait(2500);
      if (/suggested replies/i.test(read(`${tag}-tap-cached`).text)) return true;
    }
    for (let i = 0; i < 12; i++) {
      let f = bubbleFrame();
      if (!f && end && i % 3 === 2) { tap(end.x, end.y); await wait(2500); f = bubbleFrame(); }
      if (!f) { await wait(2000); continue; }
      writeFileSync(resolve(out, `${tag}-bubble-frame.txt`), JSON.stringify(f) + '\n');
      tap((f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2);
      await wait(2500);
      const r = read(`${tag}-tap-${i}`);
      if (/suggested replies/i.test(r.text)) { writeFileSync(resolve(out, 'bubble-frame.json'), JSON.stringify(f) + '\n'); return true; }
    }
    return false;
  };
  const SUGGESTION_TAGS = /^(agree|push back, kindly|ask a question|answer|disagree|ask for a detail)$/i;
  const generate = async (tag, end) => {
    if (!await tapBubble(tag, end)) { read(`${tag}-no-panel`); return { hits: -1, refusal: 'no-panel' }; }
    // The phone writer thinks locally: wait until suggestion cards land (not just YOURS).
    let r = null;
    for (let i = 0; i < 20; i++) {
      await wait(6000);
      r = read(`${tag}-wait-${i}`, [SW, Math.round(SH * 0.7), 0, Math.round(SH * 0.3)]);
      if (r.lines.some(l => SUGGESTION_TAGS.test(l.text.trim())) || refused()) break;
    }
    r = read(tag, [SW, Math.round(SH * 0.7), 0, Math.round(SH * 0.3)]);
    const ref = refused();
    // Only text under the first suggestion tag counts: the YOURS card echoes the
    // person's own reply (which invites the phrase) and must never count as a draft.
    const firstCard = r.lines.findIndex(l => SUGGESTION_TAGS.test(l.text.trim()));
    const below = firstCard >= 0 ? r.lines.slice(firstCard + 1).map(l => l.text).join('\n') : r.text;
    const hits = (below.match(/no worries/gi) ?? []).length;
    return { hits, refusal: ref, panelText: r.text.slice(0, 600), cardsMissing: firstCard < 0 };
  };
  const dismiss = async tag => {
    for (let i = 0; i < 3; i++) {
      const r = read(`${tag}-dismiss-${i}`);
      if (!/suggested replies/i.test(r.text)) break;
      adb('shell', 'input', 'keyevent', '4');
      await wait(1000);
    }
  };
  const runArm = async name => {
    // Fresh service per run: after a panel is dismissed with Back the service can keep
    // thinking the panel covers the bubble, and only a restart brings the bubble back.
    await rebind();
    const end = await openThread();
    const { hits, refusal, panelText, cardsMissing } = await generate(name, end);
    record({ arm: name, theme, phraseInDrafts: hits, cardsMissing: cardsMissing ?? null, refusal: refusal ?? null, panel: panelText ?? null, shot: `${name}.png` });
    await dismiss(name);
    if (refusal && refusal !== 'no-panel') throw new Error(`writer refused: ${refusal}`);
    if (hits < 0) throw new Error(`no panel opened for ${name} (see ${name}-no-panel.png)`);
  };
  const isRuleOn = text => !/nothing here yet/i.test(text);
  const setNever = async (on, snapName) => {
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://voice', pkg);
    await wait(5000);
    // The outlined idea chips sometimes slip past tesseract at full-screen scale:
    // re-read the Never-say card upscaled before tapping blind.
    const chipLines = png => {
      const up = '/tmp/ov-chip-up.png';
      execFileSync('convert', [png, '-crop', `${SW}x700+0+780`, '-resize', '200%', up], { stdio: 'pipe' });
      const tsv = execFileSync('tesseract', [up, 'stdout', 'tsv'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
      return tsv.split('\n').slice(1).map(l => l.split('\t')).filter(c => c.length >= 12 && c[11].trim())
        .map(c => ({ text: c[11].trim(), cx: Number(c[6]) / 2, cy: Number(c[7]) / 2 + 780 }));
    };
    let r = read(`${snapName}-before`);
    let lastPng = `${snapName}-before`;
    let misses = 0;
    const probeTapChip = removing => {
      // Exact chip bounds from the probe: the selected chip carries "Remove …",
      // the idea chip its bare phrase; both are clickable.
      let nodes = [];
      try { nodes = nodesP().filter(n => n.app === pkg && n.clickable && n.visible); } catch { return false; }
      // Removing taps the selected chip ("Remove …"); adding taps the idea chip, which
      // is the only clickable phrase node while the rule is off.
      const hit = nodes.find(n => removing ? /remove no worries/i.test(`${n.label} ${n.text}`) : /no worries/i.test(`${n.label} ${n.text}`));
      if (!hit) return false;
      writeFileSync(resolve(out, `${snapName}-probe-chip.json`), JSON.stringify({ label: hit.label, text: hit.text, bounds: hit.bounds }) + '\n');
      tap((hit.bounds[0] + hit.bounds[2]) / 2, (hit.bounds[1] + hit.bounds[3]) / 2);
      return true;
    };
    for (let i = 0; i < 6 && isRuleOn(r.text) !== on; i++) {
      const shot = `${snapName}-${i}`;
      const removing = isRuleOn(r.text) && !on;
      if (probeTapChip(removing)) { await wait(5000); r = read(shot); lastPng = shot; continue; }
      const li = findLine(r.lines, /no worries/i);
      if (li >= 0) {
        // OCR fallback: removing taps the chip's × at its right end; adding taps the idea chip's centre.
        const line = r.lines[li];
        if (removing) tap(line.x1 - 35, line.cy); else tap(line.cx, line.cy);
      }
      else {
        const hit = chipLines(resolve(out, `${lastPng}.png`)).find(u => /no worries/i.test(u.text));
        if (hit) { tap(hit.cx, hit.cy); }
        else if (removing && ++misses >= 2) {
          // The solid-blue selected chip slips past tesseract in both themes: its × sits
          // at the right end of the left-aligned chip under the Never-say description.
          // Taps settle slowly while the on-device writer is loaded: wait long, then verify.
          tap(425 + (misses % 2) * 10 - 5, 990);
          await wait(8000);
          r = read(shot); lastPng = shot;
          continue;
        }
        else { await wait(2000); r = read(`${snapName}-retry-${i}`); lastPng = `${snapName}-retry-${i}`; continue; }
      }
      await wait(5000);
      r = read(shot); lastPng = shot;
    }
    const set = isRuleOn(r.text);
    if (set !== on) throw new Error(`rule ${on ? 'on' : 'off'} did not stick (see ${snapName}-*.png)`);
    console.log(`rule ${on ? 'on' : 'off'} confirmed`);
  };
  const setNote = async (text, snapName) => {
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://voice', pkg);
    await wait(3000);
    let r = read(`${snapName}-before`);
    const li = findLine(r.lines, /for example|lowercase|how i write/i);
    if (li < 0) throw new Error(`no How-I-write field: ${r.text.slice(0, 200)}`);
    // The field is the example box below the How-I-write heading: tap its largest box.
    tap(r.lines[li].cx, r.lines[li].cy + 120);
    await wait(1200);
    adb('shell', 'input', 'keyevent', '123');
    for (let i = 0; i < 150; i++) adb('shell', 'input', 'keyevent', '67');
    await wait(400);
    if (text) adb('shell', 'input', 'text', text.replaceAll(' ', '%s'));
    await wait(1500);
    // Dismiss the keyboard (commits the composing word), scroll the How-I-write
    // section back into view, then verify.
    adb('shell', 'input', 'keyevent', '4');
    await wait(1500);
    adb('shell', 'input', 'swipe', String(SW / 2), String(SH * 0.7), String(SW / 2), String(SH * 0.3), '300');
    await wait(1200);
    r = read(snapName);
    if (!new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(r.text)) {
      adb('shell', 'input', 'swipe', String(SW / 2), String(SH * 0.7), String(SW / 2), String(SH * 0.3), '300');
      await wait(1200);
      r = read(`${snapName}-scrolled`);
    }
    adb('shell', 'input', 'keyevent', '4');
    await wait(800);
    if (!new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(r.text)) throw new Error(`note did not stick: ${r.text.slice(0, 200)}`);
    console.log('note confirmed');
  };
  // Gate: Home names the phone writer.
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
  await wait(5000);
  // Gate: Home names the phone writer. Home opens on a hero illustration; the writer
  // readiness card sits below, so scroll through up to 3 screens looking for it.
  let homeText = '';
  for (let i = 0; i < 3; i++) {
    const home = read(`home-${i}`);
    homeText += '\n' + home.text;
    if (/on this phone|writes right here|getting ownvoice ready|ready\. it writes/i.test(homeText)) break;
    adb('shell', 'input', 'swipe', String(SW / 2), String(SH * 0.7), String(SW / 2), String(SH * 0.3), '300');
    await wait(1500);
  }
  writeFileSync(resolve(out, 'writer.txt'), 'phone\n');
  console.log(`gate home: ${homeText.slice(0, 300)}`);
  if (!/on this phone|writes right here|getting ownvoice ready|ready\. it writes/i.test(homeText)) throw new Error(`No phone writer on Home: ${homeText.slice(0, 300)}`);
  console.log('gate: phone writer present on Home');
  // OV_ARMS selects phases (default all, in order); OV_APPEND=1 keeps prior results.
  // setNever is a no-op when the rule is already in the wanted state, so resuming
  // never toggles a correct state. OV_ARM_TAG suffixes repeat arm names (note re-runs).
  const arms = (process.env.OV_ARMS ?? 'off,on,note').split(',');
  const armTag = process.env.OV_ARM_TAG ?? '';
  // Best-effort prompt capture: whatever the release build already logs about the
  // local writer prompt (usually nothing — release strips it; then the host-side
  // execution of the same engine code with the same stored values stands as proof).
  try {
    const probe = adb('shell', 'logcat', '-d', '-v', 'time').split('\n')
      .filter(l => /how they write|phoneReply|LocalModel|llama|byokit\/infer|askLocal/i.test(l)).slice(-40);
    writeFileSync(resolve(out, 'logcat-prompt-probe.txt'), probe.join('\n') + '\n');
  } catch (e) { writeFileSync(resolve(out, 'logcat-prompt-probe.txt'), `probe failed: ${String(e).slice(0, 200)}\n`); }
  const requireRule = async (wanted, snapName) => {
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://voice', pkg);
    await wait(5000);
    const r = read(snapName);
    if (isRuleOn(r.text) !== wanted) throw new Error(`note arms need the rule ${wanted ? 'on' : 'off'} (see ${snapName}.png)`);
    console.log(`precheck: rule ${wanted ? 'on' : 'off'} confirmed (no change)`);
    adb('shell', 'input', 'keyevent', '4');
    await wait(800);
  };
  if (arms.includes('off')) {
    await setNever(false, 'voice-rule-off');
    for (let i = 0; i < 5; i++) await runArm(`off-${i}`);
  }
  if (arms.includes('on')) {
    await setNever(true, 'voice-rule-on');
    for (let i = 0; i < 5; i++) await runArm(`on-${i}`);
  }
  if (arms.includes('note')) {
    if (!arms.includes('on') && !arms.includes('off')) await requireRule(true, 'voice-note-precheck');
    if (process.env.OV_SETNOTE !== '0') await setNote('lowercase, blunt', 'voice-note-set');
    else console.log('note retype skipped (OV_SETNOTE=0): stored note reused');
    await runArm(`note-lowercase-blunt${armTag}`);
  }
  console.log(`VOICE_DONE theme=${theme} out=${out}`);
} else if (mode === 'journey') {
  // Scorecard journey: 10 reply taps in the X composer fixture, then 10 polishes typed into a
  // host-served page in Chrome. Each run times the bubble tap to the first card ("first") and to
  // the panel showing all three cards ("all"). Timings are bounded by the screenshot cadence
  // (about 2-3 s per read), so they are upper bounds, not stopwatch values.
  const { spawn } = await import('node:child_process');
  const cases = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'phone-writer-cases.json'), 'utf8'));
  const CARD_TAG = /^(agree|push back, kindly|ask a question|answer|disagree|ask for a detail)$/i;
  const STRAY = /Skip\.|good practice|Couldn't polish|undefined|null|\[|\]|```|[{}]/i;
  // OCR often garbles the header ("Folishyourpost") or the crop cuts it off; the panel's own "Writing..." and "Listen" lines also mean it is open.
  const PANEL = /Suggested replies|Polish your|^Writing\.\.\./im;
  const READY = /Pick one to/i;
  const FAILED = /Couldn't polish|went wrong|no-answer|offline|limit reached/i;
  // The panel header sits at about 24% of the height on this phone; a crop that starts at 30% cuts it off.
  const crop = [SW, Math.round(SH * 0.85), 0, Math.round(SH * 0.15)];
  // Typed text: spaces as %s, other shell metacharacters escaped; one Enter per newline.
  const typeLines = text => text.split('\n').forEach((line, k) => {
    if (k) adb('shell', 'input', 'keyevent', '66');
    if (line) adb('shell', 'input', 'text', line.replace(/ /g, '%s').replace(/[^A-Za-z0-9%s.,!?:\-\/]/g, c => `\\${c}`));
  });
  const openBubble = async tag => {
    for (let i = 0; i < 8; i++) {
      const f = bubbleFrame();
      if (!f) { await wait(1500); continue; }
      const t0 = Date.now();
      tap((f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2);
      await wait(600);
      if (PANEL.test(read(`${tag}-open-${i}`, crop).text)) return t0;
    }
    throw new Error(`${tag}: the bubble never opened the panel`);
  };
  // The panel's own lines: everything above the user's YOURS card and, when the Why? line shows, below it.
  // The typed text sits in the YOURS card, so a refusal or card match never reads the user's words.
  const panelOnly = lines => {
    const yours = lines.findIndex(l => /^YOURS\b/.test(l.text.trim()));
    if (yours < 0) return lines;
    const why = lines.findIndex((l, i) => i > yours && /^Why\?/.test(l.text.trim()));
    return why < 0 ? lines.slice(0, yours) : lines.filter((_, i) => i < yours || i > why);
  };
  // Polish cards carry an all-caps tag (SHORTER, ...); reply cards carry the CARD_TAG words.
  const isCardTag = text => CARD_TAG.test(text) || /^[A-Z][A-Z ]{2,20}$/.test(text);
  // A card's text can repeat the user's own words ("was offline"), so a failure word counts only with no card shown.
  // Cards sit below the YOURS card; with no YOURS line on screen there are none.
  const cardCount = lines => {
    const yours = lines.findIndex(l => /^YOURS\b/.test(l.text.trim()));
    return yours < 0 ? 0 : lines.slice(yours + 1).filter(l => isCardTag(l.text.trim())).length;
  };
  // Both kinds show three cards (reply slots, polish versions); a static screen alone is not done.
  const CARDS = 3;
  const settle = async (tag, t0) => {
    let tFirst = null, tAll = null, r = null;
    for (let k = 0; k < 30; k++) {
      r = read(`${tag}-${k}`, crop);
      const now = Date.now() - t0;
      const own = panelOnly(r.lines).map(l => l.text).join('\n');
      const cards = cardCount(r.lines);
      if (tFirst === null && (cards > 0 || READY.test(own) || (!cards && FAILED.test(own)))) tFirst = now;
      if (cards >= CARDS) { tAll = now; break; }
      if (!cards && FAILED.test(own)) break;
    }
    return { tFirst, tAll, r };
  };
  const runPanel = async (tag, kind) => {
    const t0 = await openBubble(tag);
    const { tFirst, tAll, r } = await settle(tag, t0);
    const own = panelOnly(r.lines);
    const cards = cardCount(r.lines);
    const refusal = cards ? null : FAILED.exec(own.map(l => l.text).join('\n'))?.[0] ?? null;
    const strays = r.lines.map(l => l.text).filter(t => STRAY.test(t));
    record({ kind, tag, theme, t_first_ms: tFirst, t_all_ms: tAll, cards, refusal, strays, shot: r.png });
    for (let b = 0; b < 3 && PANEL.test(read(`${tag}-dismiss-${b}`).text); b++) {
      adb('shell', 'input', 'keyevent', '4');
      await wait(1000);
    }
  };
  const replyRun = async (c, i) => {
    await rebind();
    adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
    await wait(1500);
    adb('shell', 'am', 'force-stop', 'com.twitter.android');
    await wait(700);
    const q = s => `'${String(s).replaceAll("'", "'\\''")}'`;
    adb('shell', 'am', 'start', '-n', 'com.twitter.android/.Composer', '--es', 'post', q(c.post), '--es', 'replyText', q(c.point), '--es', 'label', q('X'));
    await wait(4000);
    const r0 = read(`reply-${i}-thread`);
    // The last word: OCR splits a line in two and garbles punctuation, so a longer key misses.
    const key = c.point.split(' ').pop();
    const fi = findLine(r0.lines, new RegExp(`(?<!\\w)${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`, 'i'));
    if (fi < 0) throw new Error(`reply ${i}: reply text not on screen (see reply-${i}-thread.png)`);
    // Focus the field at the end of its text and leave the keyboard up (the bubble hides on blur).
    tap(Math.min(SW - 60, r0.lines[fi].x1 + 50), r0.lines[fi].cy);
    await wait(1500);
    adb('shell', 'input', 'text', '%s');
    await wait(800);
    adb('shell', 'input', 'keyevent', '67');
    await wait(1500);
    await runPanel(`reply-${i}`, 'reply');
  };
  const polishRun = async (text, i) => {
    await rebind();
    adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
    await wait(1500);
    // Chrome rejects a data: URL from an intent, so the page comes from the host over adb reverse.
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `http://127.0.0.1:${polishPort}/`, '-p', 'com.android.chrome');
    await wait(4000);
    // Clear Chrome's first-run screens if they come up before the page.
    for (let k = 0; k < 3; k++) {
      const f = read(`polish-${i}-chrome-${k}`).lines.find(l => /accept & continue|without an account|no thanks|got it/i.test(l.text));
      if (!f) break;
      tap(f.cx, f.cy);
      await wait(1500);
    }
    tap(SW / 2, SH * 0.35);
    await wait(1200);
    typeLines(text);
    await wait(800);
    await runPanel(`polish-${i}`, 'polish');
  };
  // One full flow on the screen recorder (the first reply flow, 170 s cap).
  // Its stderr and exit code go to screenrecord.log: a recorder that dies at once leaves no file to pull.
  // A per-run path: a file left by an earlier run under another user blocks the recorder's open.
  const recLog = resolve(out, 'screenrecord.log');
  const flowPath = `/sdcard/ov-journey-${Date.now()}.mp4`;
  const rec = process.env.OV_RECORD === '1'
    ? spawn('adb', ['-s', serial, 'shell', 'screenrecord', '--time-limit', '170', flowPath],{ detached: true, stdio: ['ignore', 'ignore', openSync(recLog, 'w')] })
    : null;
  rec?.on('exit', code => appendFileSync(recLog, `exit code=${code}\n`));
  rec?.unref();
  // The polish page: a host server on loopback, reached through adb reverse.
  const { createServer } = await import('node:http');
  const polishHtml = '<!doctype html><meta name="viewport" content="width=device-width"><body style="font:22px sans-serif;margin:16px"><textarea autofocus style="width:100%;height:60vh;font:22px sans-serif"></textarea></body>';
  const polishServer = createServer((_req, res) => res.end(polishHtml));
  await new Promise(done => polishServer.listen(0, '127.0.0.1', done));
  const polishPort = polishServer.address().port;
  try {
    adb('reverse', `tcp:${polishPort}`, `tcp:${polishPort}`);
    if (!process.env.OV_POLISH_ONLY) {
      for (let i = 0; i < cases.replies.length; i++) {
        try { await replyRun(cases.replies[i], i); } catch (e) { record({ kind: 'reply', i, error: String(e.message).slice(0, 200) }); }
      }
    }
    for (let i = 0; i < Math.min(cases.polishes.length, Number(process.env.OV_POLISH_COUNT ?? cases.polishes.length)); i++) {
      try { await polishRun(cases.polishes[i], i); } catch (e) { record({ kind: 'polish', i, error: String(e.message).slice(0, 200) }); }
    }
  } finally {
    try { adb('reverse', '--remove', `tcp:${polishPort}`); } catch { /* best-effort */ }
    polishServer.close();
  }
  if (rec) {
    // Stop the recorder so it writes the file's end (SIGINT), then pull.
    try { adb('shell', 'pkill', '-INT', 'screenrecord'); } catch { /* already finished at its time limit */ }
    await wait(2000);
    try {
      execFileSync('adb', ['-s', serial, 'pull', flowPath, resolve(out, 'flow.mp4')], { stdio: 'pipe' });
    } catch (e) { console.log(`flow.mp4 not pulled: ${String(e.message).slice(0, 120)}`); }
    adb('shell', 'rm', '-f', flowPath);
  }
  console.log(`JOURNEY_DONE theme=${theme} out=${out}`);
} else {
  throw new Error(`unknown mode ${mode}: recon, setup, dlwait, voice or journey`);
}

// P2: first-run writer choice, Home after skipping, and a restored practice step with no writer.
// Owned rooted emulator only. Uses the stub build; no key, vendor, download or network request.
// The practice leg installs an explicit legacy SQLite fixture (TRY, no source), not a normal new-user path.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { accessibilityProbe, center, emulatorName } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL;
const avd = process.env.OWNVOICE_AVD_NAME;
assert(avd && /^emulator-\d+$/.test(serial ?? '') && emulatorName(serial) === avd, 'An owned emulator is required.');
const [apk, folder] = process.argv.slice(2);
assert(apk && folder, 'Pass <stub-apk> <output-folder>.');
const out = resolve(folder);
mkdirSync(out, { recursive: true });
const before = process.env.OWNVOICE_BEFORE === '1';
const pkg = 'dev.ownvoice.next';
const service = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
const wait = ms => new Promise(r => setTimeout(r, ms));
const nodes = accessibilityProbe(serial, out);
const steps = [];
const sizes = [[360, 720, 1280, 320], [390, 780, 1280, 320], [445, 890, 1280, 320], [1280, 1280, 800, 160]];
let geometry;
const textOf = n => `${n.label} ${n.text}`.toLowerCase();
const find = text => nodes().find(n => textOf(n).includes(text.toLowerCase()));
const seen = async (text, timeout = 45000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const n = find(text); if (n) return n; await wait(800); }
  throw new Error(`Missing ${text}: ${nodes().map(n => n.text || n.label).filter(Boolean).join(' | ').slice(0, 500)}`);
};
const tap = async text => { const n = await seen(text); adb('shell', 'input', 'tap', ...center(n).map(x => String(Math.round(x)))); await wait(800); };
const start = () => adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
const toggleService = async on => {
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', 'com.example.disabled/NoService');
  if (on) { await wait(1000); adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', service); adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1'); await wait(2500); }
};
const snap = async (name, result) => {
  await wait(1500); // A populated accessibility tree can precede the first painted frame.
  const png = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
  writeFileSync(resolve(out, `${name}.png`), png);
  steps.push({ screenshot: `${name}.png`, geometry, result, at: new Date().toISOString() });
  writeFileSync(resolve(out, 'steps.json'), JSON.stringify({
    target: { version: adb('shell', 'dumpsys', 'package', pkg).match(/versionName=([^\s]+)/)?.[1], surface: 'Android release APK, stub writer', widthsDp: sizes.map(([dp]) => dp) },
    start: 'Cleared app for each theme/font; synthetic legacy TRY/no-source store for the practice leg.',
    steps, result: steps.at(-1).result,
  }, null, 2));
};
const footer = () => nodes().find(n => n.className === 'android.widget.Button' && /^(continue|sign in|get it ready)$/i.test((n.label || n.text).trim()));
const radios = () => nodes().filter(n => n.checkable && n.app === pkg);
// Synthetic app-owned restore fixture: no credentials or existing owner state is read/copied.
const restorePractice = async () => {
  await toggleService(false);
  adb('shell', 'am', 'force-stop', pkg);
  const path = adb('shell', 'su', '0', 'find', `/data/user/0/${pkg}`, '-name', 'ExpoSQLiteStorage').trim();
  assert(/^\/data\/user\/0\/dev\.ownvoice\.next\/[^\n]+\/ExpoSQLiteStorage$/.test(path), 'Expected the app SQLite store.');
  const fixture = resolve(out, 'practice-fixture.sqlite');
  execFileSync('python3', ['-c', 'import sqlite3,sys,json; c=sqlite3.connect(sys.argv[1]); c.execute("CREATE TABLE IF NOT EXISTS storage (key TEXT PRIMARY KEY NOT NULL, value TEXT)"); c.execute("DELETE FROM storage"); c.execute("INSERT INTO storage VALUES (?, ?)", ("setup", json.dumps({"step":"TRY","inserted":False}))); c.commit(); c.close()', fixture]);
  const uid = adb('shell', 'su', '0', 'stat', '-c', '%u', path).trim();
  adb('push', fixture, '/data/local/tmp/ov-p2-practice.sqlite');
  adb('shell', 'su', '0', 'sh', '-c', `"cp /data/local/tmp/ov-p2-practice.sqlite ${path}; rm -f ${path}-wal ${path}-shm; chown ${uid}:${uid} ${path}; chmod 600 ${path}; restorecon ${path}"`);
  await toggleService(true);
  start();
  await seen('tap the bubble to polish it');
};

const priorMode = adb('shell', 'cmd', 'uimode', 'night').trim().replace('Night mode: ', '');
const priorFont = adb('shell', 'settings', 'get', 'system', 'font_scale').trim();
let recorder;
try {
  execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
  adb('shell', 'svc', 'wifi', 'disable'); // Avoid the shared netsimd packet stream; no network is needed.
  adb('shell', 'settings', 'put', 'secure', 'stylus_handwriting_enabled', '0');
  adb('shell', 'settings', 'put', 'secure', 'ui_night_mode_custom_type', '-1');
  for (const [dp, width, height, density] of sizes) for (const mode of ['light', 'dark']) for (const font of ['1.0', '1.3']) {
    geometry = { dp, width, height, density, mode, font };
    const tag = `${before ? 'before' : 'after'}-${dp}dp-${mode}${font === '1.3' ? '-large' : ''}`;
    console.log(`CELL ${tag}`);
    await toggleService(false);
    adb('shell', 'am', 'force-stop', pkg);
    adb('shell', 'wm', 'size', `${width}x${height}`);
    adb('shell', 'wm', 'density', String(density));
    adb('shell', 'cmd', 'uimode', 'night', mode === 'dark' ? 'yes' : 'no');
    adb('shell', 'settings', 'put', 'system', 'font_scale', font);
    adb('shell', 'pm', 'clear', pkg);
    start();
    await seen('sound like you');
    await tap('Continue');
    await seen('how should ownvoice write');
    await wait(2000); // Allow the phone capability answer to settle; disabled buttons are not clickable nodes.
    const action = footer();
    assert(action, 'The main choice action is visible.');
    assert.equal(action.enabled, before, 'Continue is disabled until an explicit tap, unlike the baseline.');
    assert.equal(radios().filter(n => n.checked).length, before ? 1 : 0, 'No writer is preselected.');
    await snap(`${tag}-choose`, before ? 'Baseline: a writer is preselected and the main action is enabled without a tap.' : 'No writer selected; Continue disabled.');
    if (!before && dp === 360 && mode === 'light' && font === '1.0') {
      const log = openSync(resolve(out, 'screenrecord.log'), 'w');
      recorder = spawn('adb', ['-s', serial, 'shell', 'screenrecord', '--time-limit', '15', '/sdcard/ov-p2-choice.mp4'], { stdio: ['ignore', log, log] });
      closeSync(log);
      await wait(1500);
    }
    for (let i = 0; i < 3 && !find('with your chatgpt'); i++) {
      adb('shell', 'input', 'swipe', String(width / 2), String(height * .75), String(width / 2), String(height * .3), '300'); await wait(800);
    }
    await tap('with your chatgpt');
    assert.equal(footer()?.enabled, true, 'An explicit writer tap enables Continue.');
    assert.equal(radios().filter(n => n.checked).length, 1);
    await snap(`${tag}-chosen`, 'The person tapped their account; Continue is enabled. No sign-in or generation was requested.');
    if (recorder) {
      if (recorder.exitCode === null) await new Promise((res, rej) => { recorder.once('exit', code => code === 0 ? res() : rej(new Error(`screenrecord exit ${code}`))); });
      assert.equal(recorder.exitCode, 0, 'screenrecord completed successfully; inspect its log on failure.');
      adb('pull', '/sdcard/ov-p2-choice.mp4', resolve(out, 'choice-interaction.mp4')); recorder = null;
    }
    adb('shell', 'input', 'keyevent', '4'); // Leave setup without choosing a writer.
    await seen(before ? 'ownvoice is off' : 'choose how ownvoice writes');
    await snap(`${tag}-home`, before ? 'Baseline Home silently chooses the phone after leaving setup.' : 'Home asks the person to choose how Ownvoice writes after leaving setup.');
    await restorePractice();
    await tap('Message');
    adb('shell', 'input', 'text', 'yes,%sI%scan%sbring%sthe%stent');
    if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) adb('shell', 'input', 'keyevent', '4');
    await wait(1500);
    const bubble = nodes().find(n => n.windowType === 4 && /^Ownvoice(?:,|$)/.test(n.label));
    assert(bubble, 'The restored practice chat has its bubble.');
    adb('shell', 'input', 'tap', ...center(bubble).map(x => String(Math.round(x))));
    await seen(before ? 'pick one to use instead' : 'choose how ownvoice writes first');
    await snap(`${tag}-practice`, before ? 'Legacy TRY/no-source fixture: baseline silently writes on the phone stub.' : 'Legacy TRY/no-source fixture: practice asks who writes, and produces no draft.');
    adb('shell', 'input', 'keyevent', '4');
  }
  console.log(`PASS: ${steps.length} captures; no preselection, explicit tap enables Continue, Home and restored practice ask. Before=${before}`);
} catch (error) {
  writeFileSync(resolve(out, 'failure.txt'), String(error.stack ?? error));
  try { await snap('failed-state', `FAILED: ${error.message}`); } catch { /* Preserve the original failure if the device exited. */ }
  throw error;
} finally {
  if (recorder && recorder.exitCode === null) { recorder.kill('SIGTERM'); await new Promise(res => recorder.once('exit', res)); }
  await toggleService(false);
  adb('shell', 'am', 'force-stop', pkg);
  adb('shell', 'settings', 'put', 'system', 'font_scale', priorFont === 'null' ? '1.0' : priorFont);
  adb('shell', 'cmd', 'uimode', 'night', priorMode || 'no');
}

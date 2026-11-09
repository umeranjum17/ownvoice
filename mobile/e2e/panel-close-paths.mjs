// Owned-emulator regression: panel handoffs and insertion with the offline stub writer.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { accessibilityProbe, center, emulatorName } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL;
const avd = process.env.OWNVOICE_AVD_NAME;
const scratch = process.env.PANEL_SCRATCH;
const out = process.env.DONE_DONE_EVIDENCE_ROOT;
const apk = process.argv[2];
assert(apk && scratch && out && avd && /^emulator-\d+$/.test(serial ?? '') && emulatorName(serial) === avd, 'Pass a stub APK and set PANEL_SCRATCH, DONE_DONE_EVIDENCE_ROOT, ANDROID_SERIAL and OWNVOICE_AVD_NAME for an owned emulator.');
mkdirSync(scratch, { recursive: true });
mkdirSync(out, { recursive: true });
const pkg = 'dev.ownvoice.next';
const service = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const fixturePkg = 'com.twitter.android';
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', timeout: 25000, maxBuffer: 12 * 1024 * 1024 });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const nodes = accessibilityProbe(serial, scratch);
const textOf = n => `${n.label} ${n.text}`.toLowerCase();
const seen = async (query, timeout = 45000) => {
  const match = typeof query === 'function' ? query : n => textOf(n).includes(query.toLowerCase());
  const end = Date.now() + timeout;
  while (Date.now() < end) { const n = nodes().find(match); if (n) return n; await wait(800); }
  throw new Error(`Missing ${query}: ${nodes().map(n => n.text || n.label).filter(Boolean).join(' | ').slice(0, 800)}`);
};
const snap = name => writeFileSync(resolve(out, `${name}.png`), execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 }));
const bound = () => /Bound services:\s*[\[{][^}\]]*Ownvoice/.test(adb('shell', 'dumpsys', 'accessibility'));
const toggle = async () => {
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', 'com.example.disabled/NoService');
  await wait(1000);
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', service);
  adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
  for (let i = 0; i < 50 && !bound(); i++) await wait(300);
  assert(bound(), 'Ownvoice service did not bind');
};

// Reuse the app's own X-style fixture; it has no network or send action.
function buildFixture() {
  const java = process.env.JAVA_HOME;
  assert(java, 'JAVA_HOME is required');
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), 'Android/Sdk');
  const newest = (dir, re) => readdirSync(dir).filter(x => re.test(x)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
  const tools = join(sdk, 'build-tools', newest(join(sdk, 'build-tools'), /./));
  const platform = join(sdk, 'platforms', newest(join(sdk, 'platforms'), /^android-\d+$/), 'android.jar');
  const build = resolve(scratch, 'panel-fixture');
  const classes = join(build, 'classes');
  mkdirSync(classes, { recursive: true });
  const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'pipe' });
  const source = fileURLToPath(new URL('./fixture/Composer.java', import.meta.url));
  const manifest = fileURLToPath(new URL('./fixture/AndroidManifest.xml', import.meta.url));
  run(join(java, 'bin/javac'), ['-cp', platform, '-d', classes, source]);
  run(join(java, 'bin/jar'), ['cf', join(build, 'fixture.jar'), '-C', classes, '.']);
  run(join(tools, 'd8'), ['--lib', platform, '--output', build, join(build, 'fixture.jar')]);
  const built = join(build, 'fixture.apk');
  run(join(tools, 'aapt'), ['package', '-f', '-M', manifest, '-I', platform, '-F', built]);
  run('zip', ['-j', built, join(build, 'classes.dex')]);
  run(join(tools, 'apksigner'), ['sign', '--ks', fileURLToPath(new URL('../android/app/debug.keystore', import.meta.url)), '--ks-key-alias', 'androiddebugkey', '--ks-pass', 'pass:android', built]);
  return built;
}

// An isolated app-owned store selects either no writer or the stub phone writer; no account is used.
async function setFixture(phone) {
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', 'com.example.disabled/NoService');
  adb('shell', 'am', 'force-stop', pkg);
  const path = adb('shell', 'su', '0', 'find', `/data/user/0/${pkg}`, '-name', 'ExpoSQLiteStorage').trim();
  assert(/^\/data\/user\/0\/dev\.ownvoice\.next\/[^\n]+\/ExpoSQLiteStorage$/.test(path), 'Expected the Ownvoice SQLite store');
  const db = resolve(scratch, phone ? 'panel-phone.sqlite' : 'panel-no-writer.sqlite');
  execFileSync('python3', ['-c', 'import sqlite3,sys,json; c=sqlite3.connect(sys.argv[1]); c.execute("CREATE TABLE IF NOT EXISTS storage (key TEXT PRIMARY KEY NOT NULL, value TEXT)"); c.execute("DELETE FROM storage"); c.executemany("INSERT INTO storage VALUES (?, ?)", [("setup",json.dumps({"step":"TRY","inserted":False})),("writer-source",json.dumps("phone"))] if sys.argv[2]=="phone" else [("setup-done",json.dumps(True))]); c.commit(); c.close()', db, phone ? 'phone' : 'none']);
  const uid = adb('shell', 'su', '0', 'stat', '-c', '%u', path).trim();
  adb('push', db, '/data/local/tmp/ov-panel-close.sqlite');
  adb('shell', 'su', '0', 'sh', '-c', `"cp /data/local/tmp/ov-panel-close.sqlite ${path}; rm -f ${path}-wal ${path}-shm; chown ${uid}:${uid} ${path}; chmod 600 ${path}; restorecon ${path}"`);
  await toggle();
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
  await seen(phone ? 'tap the bubble to polish it' : 'Choose how Ownvoice writes');
}
const launchFixture = async () => {
  adb('shell', 'am', 'start', '-n', `${fixturePkg}/.Composer`, '--es', 'post', "'Umer keeps notes offline to stay focused.'", '--es', 'replyText', "'I keep my notes offline too.'");
  await seen(n => n.app === fixturePkg && n.editable && n.focused);
};
const dismissIme = async () => {
  // Focus may show the keyboard after the first dump, so require it to stay hidden before tapping.
  let hidden = 0;
  for (let i = 0; i < 12 && hidden < 4; i++) {
    await wait(500);
    if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) {
      adb('shell', 'input', 'keyevent', '4');
      hidden = 0;
    } else hidden++;
  }
  assert.equal(hidden, 4, 'Keyboard did not remain hidden before the bubble tap');
};
const bubble = async () => {
  await dismissIme();
  const n = await seen(n => n.windowType === 4 && /^Ownvoice(?:,|$)/.test(n.label));
  adb('shell', 'input', 'tap', ...center(n).map(x => String(Math.round(x))));
};
const processId = () => adb('shell', 'pidof', pkg).trim();
const unchangedProcess = pid => assert(pid && processId() === pid, 'Ownvoice process did not remain alive');

adb('shell', 'svc', 'wifi', 'disable');
adb('shell', 'wm', 'size', '720x1280');
adb('shell', 'wm', 'density', '320');
adb('install', '-r', apk);
adb('install', '-r', buildFixture());
adb('shell', 'pm', 'clear', pkg);
adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
await seen('sound like you');
adb('logcat', '-b', 'crash', '-c');

await setFixture(true);
const phonePid = processId();
for (let i = 1; i <= 10; i++) {
  await launchFixture(); await bubble(); await seen('Suggested replies', 30000); await wait(1800);
  let choice;
  for (let j = 0; j < 8 && !choice; j++) {
    choice = nodes().find(n => textOf(n).includes('choose another writer'));
    if (!choice) { adb('shell', 'input', 'swipe', '360', '1000', '360', '400', '400'); await wait(1200); }
  }
  assert(choice, `Choose another writer was not visible in source cycle ${i}`);
  nodes('Choose another writer');
  await seen('How Ownvoice writes', 30000); await seen('On this phone', 30000);
  unchangedProcess(phonePid);
  if (i === 10) { await wait(1500); snap('source-picker'); }
  console.log(`source picker cycle ${i}: content visible, process ${phonePid} alive`);
}
await launchFixture();
const before = (await seen(n => n.app === fixturePkg && n.editable)).text;
await bubble(); await seen('Suggested replies', 30000); await wait(1800);
adb('shell', 'input', 'swipe', '360', '1000', '360', '400', '400'); await wait(1000);
nodes('Use this');
const inserted = await seen(n => n.app === fixturePkg && n.editable && n.text !== before && n.text.length > 0, 30000);
unchangedProcess(phonePid);
await wait(1500); snap('inserted-draft');
console.log(`draft reached field: ${JSON.stringify(inserted.text)}; process ${phonePid} alive`);

await setFixture(false);
const noWriterPid = processId();
for (let i = 1; i <= 10; i++) {
  await launchFixture(); await bubble(); await seen('Choose how Ownvoice writes first', 30000); await wait(1200);
  nodes('Open Ownvoice'); await seen('Choose how Ownvoice writes', 30000); await seen('Continue', 30000);
  nodes('Continue'); await seen('How Ownvoice writes', 30000); await seen('On this phone', 30000);
  unchangedProcess(noWriterPid);
  if (i === 10) { await wait(1500); snap('writer-list'); }
  console.log(`writer list cycle ${i}: content visible, process ${noWriterPid} alive`);
}
const crashes = adb('logcat', '-d', '-b', 'crash');
writeFileSync(resolve(out, 'crash.log'), crashes);
assert(!crashes.includes('FATAL EXCEPTION'), 'A fatal exception was recorded during the journey');
writeFileSync(resolve(out, 'steps.json'), JSON.stringify({ target: { version: adb('shell', 'dumpsys', 'package', pkg).match(/versionName=([^\s]+)/)?.[1], surface: 'Android stub release APK, owned emulator' }, start: 'X-style lab composer and synthetic writer choices', steps: ['Open the source picker from the panel ten times', 'Put a draft in the lab text field', 'Open Ownvoice from the panel and reach the writer list ten times'], result: 'Both lists appeared ten times without process death and a draft reached the field; nothing was sent.' }, null, 2));
console.log('PASS: ten source-picker openings, draft insertion, ten writer-list openings; no fatal exception');

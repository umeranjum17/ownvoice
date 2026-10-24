// Real Android observer qualification. No writer, key, model, browser or network request.
// OWNVOICE_BEFORE=1 takes an archived baseline accessibility.mjs as the third argument.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [apk, folder, baseline] = process.argv.slice(2);
assert(apk && folder, 'Pass <stub-apk> <output-folder> [baseline-implementation].');
const before = process.env.OWNVOICE_BEFORE === '1';
assert(!before || baseline, 'The before control needs the archived baseline implementation.');
const implementation = before ? pathToFileURL(resolve(baseline)) : new URL('./accessibility.mjs', import.meta.url);
const { accessibilityProbe, center, emulatorName } = await import(implementation.href);
const serial = process.env.ANDROID_SERIAL;
assert(/^emulator-\d+$/.test(serial ?? '') && process.env.OWNVOICE_AVD_NAME === emulatorName(serial), 'Use the owned emulator.');
const out = resolve(folder);
mkdirSync(out, { recursive: true });
const pkg = 'dev.ownvoice.next';
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', timeout: 25_000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = [];
const save = () => writeFileSync(resolve(out, 'observations.json'), JSON.stringify(log, null, 2));
const snapshot = name => writeFileSync(resolve(out, `${name}.png`), execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 }));

adb('install', '-r', apk);
adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', 'com.example.disabled/NoService');
adb('shell', 'svc', 'wifi', 'disable');
adb('shell', 'wm', 'size', '720x1280');
adb('shell', 'wm', 'density', '320');
adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0');
adb('shell', 'settings', 'put', 'secure', 'ui_night_mode_custom_type', '-1');
adb('shell', 'cmd', 'uimode', 'night', 'no');
adb('shell', 'pm', 'clear', pkg);
adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
const get = accessibilityProbe(serial, out);
const until = async text => {
  for (let i = 0; i < 40; i++) {
    const all = get();
    const found = all.find(n => `${n.label} ${n.text}`.toLowerCase().includes(text.toLowerCase()));
    if (found) return { all, found };
    await wait(500);
  }
  throw new Error(`The real app did not show ${text}.`);
};
await until('sound like you');
const { found: button } = await until('Continue');
adb('shell', 'input', 'tap', ...center(button).map(n => String(Math.round(n))));
await until('how should ownvoice write');
await wait(1500);
snapshot(`${before ? 'before' : 'after'}-stable-choice`);
try {
  for (let i = 0; i < 40; i++) {
    const all = get();
    log.push({ call: i + 1, count: all.length, ownvoice: all.filter(n => n.app === pkg).length });
    save();
    if (!before) assert(all.some(n => n.app === pkg), 'A stable populated app must not disappear from an accepted snapshot.');
    await wait(100);
  }
  if (before) assert(log.some(row => row.count === 0), 'Baseline did not reproduce the empty snapshot in this bounded control.');
  else {
    const scoped = accessibilityProbe(serial, resolve(out, 'scoped'), { expectedPackage: pkg });
    for (let i = 0; i < 10; i++) assert(scoped().some(n => n.app === pkg));
    const missing = accessibilityProbe(serial, resolve(out, 'absent'), { expectedPackage: 'dev.ownvoice.absent' });
    const start = Date.now();
    assert.throws(() => missing(), /No readable app window within 10000 ms for dev\.ownvoice\.absent/);
    const elapsed = Date.now() - start;
    assert(elapsed >= 9500 && elapsed < 25_000, `Expected a bounded native deadline, got ${elapsed}ms.`);
    writeFileSync(resolve(out, 'deadline.json'), JSON.stringify({ expectedPackage: 'dev.ownvoice.absent', elapsedMs: elapsed, result: 'Explicit native readiness failure, not an empty successful observation.' }));
  }
  writeFileSync(resolve(out, 'steps.json'), JSON.stringify({
    target: { surface: 'Ownvoice on Android through the real self-instrumenting probe', implementationSha256: createHash('sha256').update(readFileSync(implementation)).digest('hex') },
    start: 'Fresh stub APK, Welcome, then an input tap on Continue to reach the populated writer choice. Wi-Fi off.',
    steps: ['Open Ownvoice', 'Tap Continue', 'Keep the real choice screen unchanged', 'Read 40 native snapshots', ...(before ? [] : ['Read 10 package-scoped snapshots', 'Ask for a deliberately absent package and verify the bounded explicit error'])],
    result: before ? `Baseline returned ${log.filter(row => !row.count).length} empty observations on a populated screen.` : 'Every accepted snapshot remained populated, including package-scoped reads; the absent package failed explicitly at the native deadline.',
  }, null, 2));
  console.log(`PASS before=${before} counts=${log.map(row => row.count).join(',')}`);
} finally {
  save();
  adb('shell', 'am', 'force-stop', pkg);
}

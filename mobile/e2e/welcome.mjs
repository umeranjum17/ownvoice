import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// The first-run welcome's promise, as a fresh install shows it, in light and dark at the default and
// the largest font. Any release APK works (no stub flags). OWNVOICE_BEFORE=1 skips the new-wording
// check for the base build. Shell input and screencap only, never UiAutomator.
const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const avd = (process.env.OWNVOICE_AVD_NAME ?? '').trim();
if (!avd) throw new Error('Set OWNVOICE_AVD_NAME to your own AVD name.');
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = resolve(process.argv[3] ?? 'e2e/artifacts');
mkdirSync(out, { recursive: true });
const before = process.env.OWNVOICE_BEFORE === '1';
const pkg = 'dev.ownvoice.next';
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
if (adb('shell', 'getprop', 'ro.boot.qemu.avd_name').trim() !== avd) throw new Error(`Serial ${serial} is not the owned AVD ${avd}.`);
const wait = ms => new Promise(r => setTimeout(r, ms));

const screenText = () => {
  const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
  const tsv = execFileSync('tesseract', ['stdin', 'stdout', 'tsv'], { input: image, encoding: 'utf8' });
  return tsv.split('\n').slice(1).map(row => row.split('\t')[11]).filter(Boolean).join(' ').toLowerCase();
};
const waitForLine = async (want, tries = 30) => {
  for (let i = 0; i < tries; i++) { const text = screenText(); if (text.includes(want)) return text; await wait(1000); }
  throw new Error(`Could not see "${want}" on screen.\n${screenText()}`);
};
const snap = (name, dark) => {
  if (!adb('shell', 'dumpsys', 'uimode').includes(`mComputedNightMode=${dark}`)) throw new Error(`Wrong colour mode for ${name}.`);
  const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
  execFileSync('magick', ['png:-', resolve(out, `${name}.png`)], { input: image });
};

// The promise in words a user reads: replies on the feed apps, polish everywhere else, never "any chat".
const promise = text => {
  if (before) return;
  if (text.includes('any chat')) throw new Error(`The welcome still promises replies in any chat.\n${text}`);
  for (const want of ['on x, reddit and', 'under a post', 'polish']) if (!text.includes(want)) throw new Error(`Missing "${want}" on screen.\n${text}`);
};

const priorMode = adb('shell', 'cmd', 'uimode', 'night').trim().match(/^Night mode: (\w+)$/)?.[1];
const priorScale = adb('shell', 'settings', 'get', 'system', 'font_scale').trim();
const priorSchedule = adb('shell', 'settings', 'get', 'secure', 'ui_night_mode_custom_type').trim();
execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
try {
  adb('shell', 'settings', 'put', 'secure', 'ui_night_mode_custom_type', '-1');
  for (const mode of ['light', 'dark']) for (const scale of ['1.0', '1.3']) {
    adb('shell', 'cmd', 'uimode', 'night', mode === 'dark' ? 'yes' : 'no');
    adb('shell', 'settings', 'put', 'system', 'font_scale', scale);
    // RN reads the colour scheme at process start, so each cell starts from a cleared install.
    adb('shell', 'pm', 'clear', pkg);
    await wait(1500);
    adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
    await waitForLine('sound like you');
    await wait(1500); // the welcome's three beats land
    const tag = `${before ? 'before' : 'after'}-${mode}${scale === '1.3' ? '-large' : ''}`;
    promise(screenText());
    snap(`${tag}-welcome`, mode === 'dark');
  }
  console.log(`Welcome proof saved to ${out}.`);
} finally {
  adb('shell', 'settings', 'put', 'system', 'font_scale', priorScale === 'null' ? '1.0' : priorScale);
  if (priorSchedule !== 'null') adb('shell', 'settings', 'put', 'secure', 'ui_night_mode_custom_type', priorSchedule);
  if (priorMode) adb('shell', 'cmd', 'uimode', 'night', priorMode);
}

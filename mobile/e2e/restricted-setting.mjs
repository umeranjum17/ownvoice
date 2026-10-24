import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Android 13+'s block on apps installed outside Google Play, walked on the permission step: the card
// with the steps (the greyed switch first, since App info offers the fix only after one try), the
// greyed switch and Android's own message, the card again without that first step, Open App info and
// its three-dot menu, the card's "that worked" line once allowed, then Turn on and setup moving on.
// adb installs are trusted, so each pass installs the APK the way a person does: from Downloads, through
// Android's own installer (a local-file install, which is what Android blocks). Android 15+ keeps the
// block's state from the app, so there the card keeps every step until the switch is on.
// Needs a release APK built with EXPO_PUBLIC_E2E_DOWNLOAD=1 (the phone choice's pretend download, so
// setup reaches the permission step without a real one). Light at the default font, then dark at the
// largest. Shell input and screencap only, never UiAutomator (which would unbind the service).
const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const avd = (process.env.OWNVOICE_AVD_NAME ?? '').trim();
if (!avd) throw new Error('Set OWNVOICE_AVD_NAME to your own AVD name.');
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = resolve(process.argv[3] ?? 'e2e/artifacts');
mkdirSync(out, { recursive: true });
const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
if (adb('shell', 'getprop', 'ro.boot.qemu.avd_name').trim() !== avd) throw new Error(`Serial ${serial} is not the owned AVD ${avd}.`);
const logLine = line => { const s = `${new Date().toISOString().slice(11, 19)} ${line}`; console.log(s); appendFileSync(resolve(out, 'restricted-setting.log'), s + '\n'); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const [width, height] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
const tap = (x, y) => adb('shell', 'input', 'tap', String(x), String(y));
const screen = () => execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
const op = () => adb('shell', 'appops', 'get', pkg, 'ACCESS_RESTRICTED_SETTINGS').trim();
const focus = () => adb('shell', 'dumpsys', 'window').match(/mCurrentFocus=Window\{[^}]+\s+([^\s}]+)/)?.[1] ?? '';

// OCR lines with their boxes; the whole screen, then 150 px bands for pills full-screen OCR misses.
const lines = image => {
  const found = [];
  const read = (input, top, psm) => {
    const tsv = execFileSync('tesseract', ['stdin', 'stdout', ...(psm ? ['--psm', psm] : []), 'tsv'], { input, encoding: 'utf8' });
    const byLine = new Map();
    for (const row of tsv.split('\n').slice(1)) {
      const c = row.split('\t');
      if (c.length < 12 || !c[11].trim()) continue;
      const key = c.slice(0, 5).join(':');
      const line = byLine.get(key) ?? { words: [], left: Infinity, top: Infinity, right: 0, bottom: 0 };
      line.words.push(c[11]);
      line.left = Math.min(line.left, +c[6]); line.top = Math.min(line.top, +c[7] + top);
      line.right = Math.max(line.right, +c[6] + +c[8]); line.bottom = Math.max(line.bottom, +c[7] + +c[9] + top);
      byLine.set(key, line);
    }
    for (const line of byLine.values()) found.push({ ...line, text: line.words.join(' ').toLowerCase() });
  };
  read(image, 0);
  return { found, bands: () => { for (let top = height - 150; top >= 0; top -= 75) read(execFileSync('magick', ['png:', '-crop', `${width}x150+0+${top}`, '+repage', 'png:-'], { input: image }), top, '7'); } };
};
const screenText = () => lines(screen()).found.map(l => l.text).join(' ');
const waitForLine = async (want, tries = 30) => {
  let text = '';
  for (let i = 0; i < tries; i++) { text = screenText(); if (text.includes(want)) return text; await wait(1000); }
  throw new Error(`Could not see "${want}" on screen.\n${text}`);
};
// Taps the lowest visible line holding [want] (buttons sit below the words that name them).
const tapText = async (want, { tries = 10, below = 0, exact = false } = {}) => {
  for (let i = 0; i < tries; i++) {
    const read = lines(screen());
    let hits = read.found.filter(l => l.text.includes(want) && l.top >= below);
    if (!hits.length) { read.bands(); hits = read.found.filter(l => l.text.includes(want) && l.top >= below); }
    if (hits.filter(l => !exact || l.text.trim() === want).length) {
      const line = hits.filter(l => !exact || l.text.trim() === want).sort((a, b) => b.top - a.top)[0];
      tap(Math.round((line.left + line.right) / 2), Math.round((line.top + line.bottom) / 2));
      return;
    }
    await wait(1000);
  }
  throw new Error(`Could not find "${want}" to tap.\n${screenText()}`);
};
const waitFocus = async (part, tries = 10) => {
  for (let i = 0; i < tries; i++) { if (focus().includes(part)) return; await wait(1000); }
  throw new Error(`Expected ${part} in front, got ${focus()}.`);
};
const steps = [];
const snap = (name, dark, note) => {
  if (!adb('shell', 'dumpsys', 'uimode').includes(`mComputedNightMode=${dark}`)) throw new Error(`Wrong colour mode for ${name}.`);
  execFileSync('magick', ['png:-', resolve(out, `${name}.png`)], { input: screen() });
  steps.push({ capture: `${name}.png`, shows: note });
  logLine(`saved ${name}.png: ${note}`);
};
const backToOwnvoice = async () => {
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
  await waitFocus(pkg);
};
const services = () => { const v = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim(); return v === 'null' ? '' : v; };
const setServices = list => list ? adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', list) : adb('shell', 'settings', 'delete', 'secure', 'enabled_accessibility_services');

const priorMode = adb('shell', 'cmd', 'uimode', 'night').trim().match(/^Night mode: (\w+)$/)?.[1];
const priorScale = adb('shell', 'settings', 'get', 'system', 'font_scale').trim();
const priorSchedule = adb('shell', 'settings', 'get', 'secure', 'ui_night_mode_custom_type').trim();
const priorServices = services();
const sdk = Number(adb('shell', 'getprop', 'ro.build.version.sdk').trim());
const hidden = sdk >= 35; // the app may not read the block's state; it knows only that it came from a file
// The person's install: the APK in Downloads, opened from Files, Android's installer, Install.
const fileInstall = async () => {
  if (adb('shell', 'pm', 'list', 'packages', pkg).includes(pkg)) adb('uninstall', pkg);
  execFileSync('adb', ['-s', serial, 'push', apk, '/sdcard/Download/Ownvoice.apk'], { stdio: 'ignore' });
  adb('shell', 'appops', 'set', 'com.android.providers.downloads', 'REQUEST_INSTALL_PACKAGES', 'allow');
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW_DOWNLOADS');
  await waitForLine('ownvoice.apk');
  await tapText('ownvoice.apk');
  await waitForLine('install this app');
  await tapText('install', { exact: true, below: Math.round(height * 0.4) });
  for (let i = 0; !adb('shell', 'pm', 'list', 'packages', pkg).includes(pkg); i++) { if (i === 60) throw new Error('The file install did not finish.'); await wait(1000); }
  const source = adb('shell', 'dumpsys', 'package', pkg).match(/packageSource=(\d)/)?.[1];
  if (source !== '3' && source !== '4') throw new Error(`Not installed as a file (packageSource=${source}).`);
  logLine(`installed from a file: packageSource=${source}, op ${op()}`);
  adb('shell', 'rm', '/sdcard/Download/Ownvoice.apk');
  adb('shell', 'am', 'force-stop', 'com.google.android.documentsui');
  adb('shell', 'input', 'keyevent', '3');
};
try {
  adb('shell', 'settings', 'put', 'secure', 'ui_night_mode_custom_type', '-1');
  for (const [mode, scale] of [['light', '1.0'], ['dark', '1.3']]) {
    const dark = mode === 'dark';
    const tag = name => `${mode}${scale === '1.3' ? '-large' : ''}-${name}`;
    adb('shell', 'cmd', 'uimode', 'night', dark ? 'yes' : 'no');
    adb('shell', 'settings', 'put', 'system', 'font_scale', scale);
    setServices(priorServices.split(':').filter(s => s && s !== component).join(':'));
    // A fresh install per pass: the block comes back, and RN reads the colour scheme at process start.
    await fileInstall();
    for (let i = 0; ; i++) {
      await wait(2000);
      adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
      try { await waitForLine('sound like you', 15); break; } catch (error) { if (i === 2) throw error; }
    }
    await wait(1500);
    await tapText('continue');
    await waitForLine('how should ownvoice write');
    await tapText('get it ready');

    // 1. Blocked, not tried yet: the card leads the permission step with the greyed switch first.
    let text = await waitForLine('android blocks this');
    for (const want of ['installed outside google play', 'do this once', 'tap the greyed', 'open app info', 'three dots', 'allow restricted settings', 'come back and turn ownvoice on']) if (!text.includes(want)) throw new Error(`${mode}: blocked card lacks "${want}".\n${text}`);
    if (text.includes('switch greyed out')) throw new Error(`${mode}: the generic greyed-switch help shows next to the card.`);
    await wait(800);
    snap(tag('01-blocked-card'), dark, 'Permission step on a blocked app: the card above Turn on, its first step the greyed switch');

    // 2. Turn on, then Ownvoice's greyed row: Android's own restricted message, OK.
    await tapText('turn on');
    await waitFocus('settings');
    await tapText('ownvoice', { below: Math.round(height * 0.1) });
    text = await waitForLine('restricted');
    await wait(500);
    if (!dark) snap(tag('02-android-restricted'), dark, 'Android\'s own message after tapping the greyed Ownvoice switch');
    await tapText('ok', { exact: true });
    await wait(1000);
    logLine(`${mode}: op after the try: ${op()}`);
    if (!/ignore/i.test(op())) throw new Error(`${mode}: Android did not record the try (${op()}).`);

    // 3. Back in Ownvoice: re-checked. Where Android tells the app, the try step is gone (four steps);
    //    on Android 15+ it can't know, so all five stay.
    await backToOwnvoice();
    text = await waitForLine('android blocks this');
    if (text.includes('tap the greyed') !== hidden) throw new Error(`${mode}: wrong steps after the try (Android ${sdk}).\n${text}`);
    await wait(800);
    snap(tag('03-back-card'), dark, hidden ? 'Back in Ownvoice after the try: the card and Open App info still there (Android 15+ hides the try from apps)' : 'Back in Ownvoice after the try: four steps and Open App info');

    // 4. Open App info lands on this app's App info; its three-dot menu offers the fix.
    await tapText('open app info', { below: Math.round(height * 0.2) });
    await waitFocus('settings');
    await waitForLine('app info');
    await wait(800);
    snap(tag('04-app-info'), dark, 'Open App info opened Ownvoice\'s own App info screen');
    tap(width - Math.round(60 * width / 1080), Math.round(height * 0.075));
    await waitForLine('allow restricted settings');
    await wait(500);
    snap(tag('05-three-dots'), dark, 'App info\'s three-dot menu offers Allow restricted settings');
    await tapText('allow restricted settings');
    await wait(1500);
    logLine(`${mode}: op after allowing: ${op()}`);
    if (!/allow/i.test(op())) throw new Error(`${mode}: allowing did not reach Android (${op()}).`);

    // 5. Back in Ownvoice: where Android tells the app, the card gives way to one line; on 15+ it stays.
    await backToOwnvoice();
    if (!hidden) {
      text = await waitForLine('that worked');
      if (text.includes('android blocks this')) throw new Error(`${mode}: the card still shows after allowing.`);
      await wait(500);
      snap(tag('06-lifted'), dark, 'Back after allowing: the card gives way to "That worked. Now tap Turn on."');
    } else await waitForLine('android blocks this');
    // 6. Turn on: the switch is no longer greyed; Use Ownvoice, then Android's Allow.
    await tapText('turn on');
    await waitFocus('settings');
    await tapText('ownvoice', { below: Math.round(height * 0.1) });
    await waitForLine('use ownvoice');
    if (screenText().includes('restricted')) throw new Error(`${mode}: Android still says restricted after allowing.`);
    await tapText('use ownvoice');
    await waitForLine('full control');
    await tapText('allow', { exact: true });
    await waitForLine('tap the bubble to polish it');
    await wait(800);
    snap(tag('07-setup-moves-on'), dark, 'Ownvoice switched on: setup moved on to the practice chat');
  }
  writeFileSync(resolve(out, 'steps.json'), JSON.stringify(steps, null, 2) + '\n');
  logLine(`Restricted-setting proof saved to ${out}.`);
} finally {
  adb('shell', 'settings', 'put', 'system', 'font_scale', priorScale === 'null' ? '1.0' : priorScale);
  if (priorSchedule !== 'null') adb('shell', 'settings', 'put', 'secure', 'ui_night_mode_custom_type', priorSchedule);
  if (priorMode) adb('shell', 'cmd', 'uimode', 'night', priorMode);
  setServices(priorServices);
}

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
      const line = byLine.get(key) ?? { words: [], boxes: [], left: Infinity, top: Infinity, right: 0, bottom: 0 };
      line.words.push(c[11]);
      line.boxes.push({ text: c[11].toLowerCase().replace(/[^a-z]/g, ''), left: +c[6], top: +c[7] + top, right: +c[6] + +c[8], bottom: +c[7] + +c[9] + top });
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
// Taps the lowest visible line holding [want] (buttons sit below the words that name them); [exact]
// taps the lowest word that is exactly [want], for dialog buttons OCR reads on one line ("cancel install").
const tapText = async (want, { tries = 10, below = 0, exact = false } = {}) => {
  for (let i = 0; i < tries; i++) {
    const read = lines(screen());
    const find = () => exact
      ? read.found.flatMap(l => l.boxes).filter(b => b.text === want && b.top >= below)
      : read.found.filter(l => l.text.includes(want) && l.top >= below);
    let hits = find();
    if (!hits.length) { read.bands(); hits = find(); }
    if (hits.length) {
      const hit = hits.sort((a, b) => b.top - a.top)[0];
      tap(Math.round((hit.left + hit.right) / 2), Math.round((hit.top + hit.bottom) / 2));
      return;
    }
    await wait(1000);
  }
  throw new Error(`Could not find "${want}" to tap.\n${screenText()}`);
};
const waitFocus = async (part, tries = 10) => {
  for (let i = 0; i < tries; i++) { if (focus().match(part)) return; await wait(1000); }
  throw new Error(`Expected ${part} in front, got ${focus()}.`);
};
// Ownvoice's row in Accessibility: Settings may open scrolled past it, and greyed it is too faint for
// OCR, so scroll to the top and tap the row under its "Downloaded apps" heading.
const tapOwnvoiceRow = async () => {
  adb('shell', 'input', 'swipe', String(width / 2), String(height * 0.3), String(width / 2), String(height * 0.85), '300');
  await wait(1000);
  const heading = lines(screen()).found.find(l => l.text.includes('downloaded apps'));
  if (!heading) throw new Error(`No Downloaded apps heading in Settings.\n${screenText()}`);
  tap(Math.round(width / 2), heading.bottom + Math.round(130 * height / 2400));
};
const captures = [];
const snap = (name, dark, note) => {
  if (!adb('shell', 'dumpsys', 'uimode').includes(`mComputedNightMode=${dark}`)) throw new Error(`Wrong colour mode for ${name}.`);
  execFileSync('magick', ['png:-', resolve(out, `${name}.png`)], { input: screen() });
  captures.push({ capture: `${name}.png`, shows: note });
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
  // At the largest font Files cuts the name to "Ownvoice.a…".
  await waitForLine('ownvoice.a');
  await tapText('ownvoice.a');
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

    // 2. Turn on, then Ownvoice's greyed row: Android's own message. Android 16 may show it as Settings
    //    opens on the highlighted row, before any tap.
    const message = hidden ? 'denied access' : 'for your security';
    await tapText('turn on');
    await waitFocus(/settings|permissioncontroller/);
    await wait(2500);
    if (!screenText().includes(message)) await tapOwnvoiceRow();
    text = await waitForLine(message);
    await wait(500);
    if (!dark) snap(tag('02-android-restricted'), dark, 'Android\'s own message on the greyed Ownvoice row');
    // Close (15+) or OK; the thin Close label can escape OCR, and Back closes the message the same way.
    await tapText(hidden ? 'close' : 'ok', { exact: true, tries: 3 }).catch(() => adb('shell', 'input', 'keyevent', '4'));
    await wait(1000);
    if (screenText().includes(message)) throw new Error(`${mode}: Android's message did not close.`);
    logLine(`${mode}: op after the try: ${op()}`);
    if (!hidden && !/ignore/i.test(op())) throw new Error(`${mode}: Android did not record the try (${op()}).`);

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
    // 6. Turn on: the switch is no longer greyed; Use Ownvoice, then Android's Allow. The re-check may
    //    still be redrawing the step, so a tap that lands mid-layout is tried again.
    for (let i = 0; ; i++) {
      await wait(1000);
      await tapText('turn on');
      try { await waitFocus('settings', 6); break; } catch (error) { if (i === 2) throw error; }
    }
    await wait(1500);
    await tapOwnvoiceRow();
    await waitForLine('ownvoice shortcut');
    // At the largest font the service page can open scrolled past its switch.
    adb('shell', 'input', 'swipe', String(width / 2), String(height * 0.3), String(width / 2), String(height * 0.85), '300');
    await wait(1000);
    if (screenText().includes('restricted')) throw new Error(`${mode}: Android still says restricted after allowing.`);
    // The switch row's label sits on a filled pill that full-screen OCR can miss; tapText reads it in bands.
    await tapText('use ownvoice');
    await waitForLine('full control');
    // Allow is the thin first of three stacked buttons (Allow, Deny, Uninstall); OCR reads Deny reliably.
    const deny = lines(screen()).found.flatMap(l => l.boxes).find(b => b.text === 'deny');
    if (!deny) throw new Error(`${mode}: no Deny under Android's full-control question.`);
    tap(Math.round((deny.left + deny.right) / 2), Math.round((deny.top + deny.bottom) / 2 - 150 * height / 2400));
    await waitForLine('tap the bubble to polish it');
    await wait(800);
    snap(tag('07-setup-moves-on'), dark, 'Ownvoice switched on: setup moved on to the practice chat');
  }
  // done-done's step record: what was driven, from where, the user's steps, and what they see at the end.
  const version = adb('shell', 'dumpsys', 'package', pkg).match(/versionName=(\S+)/)?.[1] ?? 'unknown';
  writeFileSync(resolve(out, 'steps.json'), JSON.stringify({
    target: { version, android: sdk, device: avd },
    start: 'Ownvoice installed from a file in Downloads through Android\'s own installer, so Android greys its accessibility switch; setup on the permission step',
    steps: [
      'Read the card above Turn on: Android blocks this for apps installed outside Google Play, with five steps and Open App info',
      'Tap Turn on, then the greyed Ownvoice row; Android says App was denied access; close it',
      'Come back to Ownvoice: the card is still there',
      'Tap Open App info: Ownvoice\'s App info opens',
      'Tap the three dots at the top right, then Allow restricted settings',
      'Come back to Ownvoice and tap Turn on, then Use Ownvoice and Allow',
    ],
    result: 'Ownvoice is switched on and setup has moved on to the practice chat (light at the default font, dark at the largest)',
    captures,
  }, null, 2) + '\n');
  logLine(`Restricted-setting proof saved to ${out}.`);
} finally {
  adb('shell', 'settings', 'put', 'system', 'font_scale', priorScale === 'null' ? '1.0' : priorScale);
  if (priorSchedule !== 'null') adb('shell', 'settings', 'put', 'secure', 'ui_night_mode_custom_type', priorSchedule);
  if (priorMode) adb('shell', 'cmd', 'uimode', 'night', priorMode);
  setServices(priorServices);
}

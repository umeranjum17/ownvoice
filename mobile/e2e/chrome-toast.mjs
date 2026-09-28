// In-journey Chrome Replace feedback evidence: a real Chrome contenteditable supplies the
// selection, the Ownvoice sheet rewrites it, Replace hands it back, and the toast is captured
// over the Chrome page (burst frames to beat the clipboard overlay). Emulator-only; light+dark.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (phones are refused).');
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = resolve(process.argv[3] ?? 'e2e/artifacts');
mkdirSync(out, { recursive: true });
const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;

const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
const wait = ms => new Promise(r => setTimeout(r, ms));
const [width, height] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
const tap = (x, y) => adb('shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y)));
const type = text => adb('shell', 'input', 'text', text.replaceAll(' ', '%s'));
const SENTENCE = 'Please confirm the delivery for Tuesday morning.';

const bands = image => [0, ...Array.from({ length: Math.ceil(height / 75) }, (_, i) => i * 75)];
const ocrBand = (input, top) => execFileSync('tesseract', ['stdin', 'stdout', ...(top ? ['--psm', '7'] : []), 'tsv'], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
const screenWords = () => {
  const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 16 * 1024 * 1024 });
  const words = [];
  const collect = (negate) => {
    for (const top of bands(image)) {
      const band = top ? execFileSync('magick', ['png:', '-crop', `${width}x150+0+${top}`, '+repage', ...(negate ? ['-negate'] : []), 'png:-'], { input: image, maxBuffer: 32 * 1024 * 1024 }) : negate ? execFileSync('magick', ['png:', '-negate', 'png:-'], { input: image, maxBuffer: 32 * 1024 * 1024 }) : image;
      for (const row of ocrBand(band, top, negate).split('\n').slice(1)) {
        const c = row.split('\t');
        if (c.length < 12 || !c[11].trim()) continue;
        words.push({ text: c[11].trim(), left: Number(c[6]), top: Number(c[7]) + top, right: Number(c[6]) + Number(c[8]), bottom: Number(c[7]) + Number(c[9]) + top });
      }
    }
  };
  collect(false);
  collect(true); // the negated pass reads white-on-dark toolbars
  return words;
};
const screenText = () => screenWords().map(w => w.text).join(' ').toLowerCase();
const tapWord = async (label, tries = 8) => {
  const lower = label.toLowerCase();
  for (let attempt = 0; attempt < tries; attempt++) {
    const word = screenWords().find(w => w.text.toLowerCase().includes(lower));
    if (word) { tap((word.left + word.right) / 2, (word.top + word.bottom) / 2); await wait(900); return word; }
    await wait(700);
  }
  throw new Error(`Could not find visible ${label}.`);
};
const shot = name => {
  adb('shell', 'screencap', '-p', `/sdcard/${name}.png`);
  execFileSync('adb', ['-s', serial, 'pull', `/sdcard/${name}.png`, resolve(out, `${name}.png`)], { stdio: 'inherit' });
  console.log(`shot ${name}`);
};
const waitFor = async (needle, tries = 12) => {
  for (let attempt = 0; attempt < tries; attempt++) {
    const text = screenText();
    if (text.includes(needle)) return true;
    if (attempt < 3) console.log(`${needle} try ${attempt}: ${text.slice(0, 140)}`);
    await wait(800);
  }
  return false;
};
const bubblelessRebind = async () => {
  const enabled = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
  const services = new Set(enabled === 'null' ? [] : enabled.split(':'));
  services.add(component);
  const without = [...services].filter(x => x !== component);
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', without.length ? without.join(':') : 'com.example.disabled/NoService');
  await wait(1200);
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...services].join(':'));
  await wait(1200);
  adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
};
const focus = () => adb('shell', 'dumpsys', 'window').match(/mCurrentFocus=Window\{[^}]+\s+([^\s}]+)/)?.[1] ?? '';

const run = async mode => {
  const tag = suffix => `${mode}-${suffix}`;
  execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
  adb('shell', 'pm', 'clear', pkg);
  adb('shell', 'cmd', 'uimode', 'night', mode === 'dark' ? 'yes' : 'no');
  execFileSync('bash', ['-c', `adb -s ${serial} shell "su 0 sh -c 'mkdir -p /data/data/dev.ownvoice.next/shared_prefs && cat > /data/data/dev.ownvoice.next/shared_prefs/ownvoice-native.xml'" <<'XML'
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <boolean name="tipShown" value="true" />
    <boolean name="paused" value="false" />
    <set name="off" />
    <set name="on">
        <string>com.android.chrome</string>
        <string>dev.ownvoice.next</string>
    </set>
</map>
XML`], { stdio: 'ignore' });
  execFileSync('bash', ['-c', `adb -s ${serial} shell "su 0 sh -c 'cat > /data/data/dev.ownvoice.next/shared_prefs/privacy.xml'" <<'XML'
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <boolean name="setUp" value="true" />
    <boolean name="bubbleTip" value="true" />
    <boolean name="paused" value="false" />
</map>
XML`], { stdio: 'ignore' });
  await bubblelessRebind();

  const { createServer } = await import('node:http');
  const page = createServer((_, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end('<meta name="viewport" content="width=device-width, initial-scale=1"><label>Message <div contenteditable="true" aria-label="Message">Please confirm the delivery for Tuesday morning.</div></label>');
  });
  await new Promise(resolve => page.listen(0, '0.0.0.0', resolve));
  const openPage = () => adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `http://10.0.2.2:${page.address().port}/`, 'com.android.chrome');
  openPage();
  if (await waitFor('use without an account', 4)) { await tapWord('Use without'); openPage(); }
  if (screenText().includes('chrome notifications')) { tap(width * 0.52, height * 0.73); await wait(800); openPage(); }
  else if (screenText().includes('no thanks')) { await tapWord('No'); openPage(); }
  for (let i = 0; i < 10 && !focus().includes('chrome'); i++) { openPage(); await wait(1500); }
  if (!(await waitFor('message', 25))) throw new Error(`Chrome page did not load (${mode})`);

  // Fill the editable field with the sentence, then select it all.
  const field = screenWords().find(w => w.text.toLowerCase() === 'message');
  if (!field) throw new Error(`contenteditable label not found (${mode})`);
  const hasToolbar = () => screenWords().some(w => w.text.toLowerCase().includes('aloud')); // toolbar: Cut Copy Select all Read aloud + overflow dot
  // Long-press selects a word and raises the toolbar; Select all widens it (a keyboard Ctrl+A
  // selects too but raises no toolbar, so it is not used here).
  let ok = false;
  for (let attempt = 0; attempt < 3 && !ok; attempt++) {
    const mid = screenWords().find(w => w.text.toLowerCase().includes('tuesday'));
    if (!mid) throw new Error(`the sentence disappeared (${mode})`);
    adb('shell', 'input', 'swipe', String(Math.round(mid.left)), String(Math.round(mid.top)), String(Math.round(mid.left)), String(Math.round(mid.top)), '1200');
    await wait(1300);
    shot(tag(`lp-attempt-${attempt}`));
    ok = hasToolbar();
    console.log(`${mode} attempt ${attempt}: long-press at ${Math.round(mid.left)},${Math.round(mid.top)} toolbar=${ok}`);
  }
  if (!ok) throw new Error(`selection toolbar did not appear (${mode})`);
  await tapWord('Select'); // widen to the whole note; the toolbar stays up
  const aloud = screenWords().find(w => w.text.toLowerCase().includes('aloud'));
  if (!aloud) throw new Error(`the toolbar vanished before the overflow tap (${mode})`);
  tap(Math.min(width - 60, aloud.right + 90 * width / 1080), (aloud.top + aloud.bottom) / 2); // the overflow dot sits right of Read aloud
  await wait(400);
  {
    const cap = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 16 * 1024 * 1024 });
    const topBand = execFileSync('magick', ['png:', '-crop', `${width}x600+0+150`, '+repage', 'png:-'], { input: cap });
    const tsv = execFileSync('tesseract', ['stdin', 'stdout', '--psm', '6', 'tsv'], { input: topBand, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    console.log(`${mode} top-band words: ${tsv.split('\n').slice(1).map(r => r.split('\t')[11]).filter(Boolean).join(' ').slice(0, 200)}`);
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    // The overflow bubble reads cleanly as one top-band block (psm 6); band strips garble it.
    const cap = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 16 * 1024 * 1024 });
    const topBand = execFileSync('magick', ['png:', '-crop', `${width}x600+0+150`, '+repage', 'png:-'], { input: cap });
    const tsv = execFileSync('tesseract', ['stdin', 'stdout', '--psm', '6', 'tsv'], { input: topBand, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const word = tsv.split('\n').slice(1).map(r => r.split('\t')).find(c => c.length >= 12 && c[11].trim().toLowerCase().includes('ownvoice'));
    if (word) {
      const cx = Number(word[6]) + Number(word[8]) / 2, cy = Number(word[7]) + 150 + Number(word[9]) / 2;
      for (const [dx, dy] of [[0, 0], [-45, 0], [45, 0], [0, -28], [0, 28]]) {
        tap(cx + dx, cy + dy);
        for (let i = 0; i < 5 && !focus().includes('RewriteActivity'); i++) await wait(600);
        if (focus().includes('RewriteActivity')) break;
      }
      if (focus().includes('RewriteActivity')) break;
    } else {
      // the menu dismissed itself: raise the selection toolbar again and reopen the overflow
      const aloud = screenWords().find(w => w.text.toLowerCase().includes('aloud'));
      if (aloud) tap(Math.min(width - 60, aloud.right + 90 * width / 1080), (aloud.top + aloud.bottom) / 2);
      await wait(900);
    }
  }
  if (!focus().includes('RewriteActivity')) throw new Error(`the selection action did not open Ownvoice (${mode})`);
  await tapWord('Shorter');
  await wait(1400);
  // The sheet's lowest 'Copy' word is the button row (the note's copy sits above it); the
  // Replace button is the pill to its left, so tap left of the lowest Copy.
  let copy = null;
  for (let i = 0; i < 8 && !copy; i++) {
    const copies = screenWords().filter(w => w.text.toLowerCase().startsWith('copy')).sort((a, b) => a.top - b.top);
    copy = copies.at(-1);
    if (!copy) { adb('shell', 'input', 'swipe', '540', '1900', '540', '1300', '500'); await wait(800); }
  }
  if (!copy) throw new Error(`Replace row not found (${mode})`);
  tap(copy.left - 200 * width / 1080, (copy.top + copy.bottom) / 2);
  // Burst: the toast lives ~2 s and the clipboard overlay can cover part of it.
  for (const [i, ms] of [[1, 700], [2, 900], [3, 2100], [4, 3300]]) {
    await wait(ms);
    shot(tag(`chrome-toast-burst${i}`));
  }
  const legible = [1, 2, 3, 4].some(n => /didn|take it|pied/i.test(execFileSync('tesseract', [resolve(out, `${tag('chrome-toast-burst' + n)}.png`), 'stdout', '--psm', '11'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })));
  if (!legible) throw new Error(`no legible toast frame over Chrome (${mode})`);
  const after = screenText();
  console.log(`${tag} toast legible over Chrome; applied-in-field: ${after.includes('tuesday morning') ? 'chrome kept the original (honest fallback path)' : 'chrome took the rewrite'}`);
  page.close();
};

const priorMode = adb('shell', 'cmd', 'uimode', 'night').trim().match(/^Night mode: (yes|no|auto|custom_schedule|custom_bedtime)$/)?.[1];
if (!priorMode) throw new Error('Could not read the emulator night mode.');
const priorServices = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
const priorAccessibility = adb('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim();
try {
  adb('shell', 'settings', 'put', 'secure', 'ui_night_mode_custom_type', '-1');
  const modes = process.env.CHROME_TOAST_MODES ? process.env.CHROME_TOAST_MODES.split(',') : ['light', 'dark'];
  for (const mode of modes) await run(mode);
} finally {
  for (const args of [
    ['shell', 'cmd', 'uimode', 'night', priorMode],
    ['shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', ...(priorServices === 'null' ? ['com.example.disabled/NoService'] : [priorServices])],
    ['shell', 'settings', 'put', 'secure', 'accessibility_enabled', ...(priorAccessibility === 'null' ? ['1'] : [priorAccessibility])],
  ]) {
    try { adb(...args); } catch { /* best-effort restore */ }
  }
}

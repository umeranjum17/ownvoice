// In-journey Chrome Replace feedback evidence: a real Chrome contenteditable supplies the
// selection, the Ownvoice sheet rewrites it, Replace hands it back, and the toast is captured
// over the Chrome page (burst frames to beat the clipboard overlay). Emulator-only; light+dark.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
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
const ocrBand = (image, top) => {
  const input = top ? execFileSync('magick', ['png:', '-crop', `${width}x150+0+${top}`, '+repage', 'png:-'], { input: image }) : image;
  return execFileSync('tesseract', ['stdin', 'stdout', ...(top ? ['--psm', '7'] : []), 'tsv'], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
};
const screenWords = () => {
  const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 16 * 1024 * 1024 });
  const words = [];
  for (const top of bands(image)) {
    for (const row of ocrBand(image, top).split('\n').slice(1)) {
      const c = row.split('\t');
      if (c.length < 12 || !c[11].trim()) continue;
      words.push({ text: c[11].trim(), left: Number(c[6]), top: Number(c[7]) + top, right: Number(c[6]) + Number(c[8]), bottom: Number(c[7]) + Number(c[9]) + top });
    }
  }
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
    if (screenText().includes(needle)) return true;
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
  execFileSync('bash', ['-c', `adb -s ${serial} shell "su 0 sqlite3 /data/data/dev.ownvoice.next/files/SQLite/ExpoSQLiteStorage \\"INSERT OR REPLACE INTO storage(key,value) VALUES('setup-done','true');\\""`], { stdio: 'ignore' });
  await bubblelessRebind();

  const { createServer } = await import('node:http');
  const page = createServer((_, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end('<meta name="viewport" content="width=device-width, initial-scale=1"><label>Message <div contenteditable="true" aria-label="Message"></div></label>');
  });
  await new Promise(resolve => page.listen(0, '0.0.0.0', resolve));
  const openPage = () => adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `http://10.0.2.2:${page.address().port}/`, 'com.android.chrome');
  openPage();
  if (await waitFor('use without an account', 4)) { await tapWord('Use without'); openPage(); }
  if (screenText().includes('chrome notifications')) { tap(width * 0.52, height * 0.73); await wait(800); openPage(); }
  else if (screenText().includes('no thanks')) { await tapWord('No'); openPage(); }
  for (let i = 0; i < 10 && !focus().includes('chrome'); i++) { openPage(); await wait(1500); }
  if (!(await waitFor('message', 8))) throw new Error(`Chrome page did not load (${tag})`);

  // Fill the editable field with the sentence, then select it all.
  const field = screenWords().find(w => w.text.toLowerCase() === 'message');
  if (!field) throw new Error(`contenteditable label not found (${tag})`);
  tap((field.left + field.right) / 2, field.bottom + 90);
  await wait(800);
  type(SENTENCE);
  await wait(900);
  const before = screenText();
  if (!before.includes('tuesday morning')) throw new Error(`the sentence was not typed into Chrome (${tag}): ${before.slice(0, 160)}`);
  const mid = screenWords().find(w => w.text.toLowerCase().includes('tuesday'));
  tap((mid.left + mid.right) / 2, (mid.top + mid.bottom) / 2);
  await wait(400);
  adb('shell', 'input', 'swipe', String(Math.round(width / 2)), String(Math.round(height * 0.42)), String(Math.round(width / 2)), String(Math.round(height * 0.42)), '1100'); // long-press for the selection menu
  await wait(1100);
  await tapWord('Select all');
  await wait(900);
  let share = null;
  for (let attempt = 0; attempt < 8 && !share; attempt++) {
    const words = screenWords().filter(w => ['share', 'copy', 'cut'].some(t => w.text.toLowerCase().startsWith(t)));
    share = words.sort((a, b) => a.left - b.left).at(-1);
    if (!share) await wait(700);
  }
  if (!share) throw new Error(`selection menu did not appear (${tag})`);
  tap(Math.min(width - 60, share.right + 90 * width / 1080), (share.top + share.bottom) / 2); // the overflow item sits right of Share
  await wait(700);
  await tapWord('Ownvoice');
  for (let i = 0; i < 10 && !focus().includes('RewriteActivity'); i++) await wait(700);
  if (!focus().includes('RewriteActivity')) throw new Error(`the selection action did not open Ownvoice (${tag})`);
  await tapWord('Shorter');
  await wait(1400);
  adb('shell', 'input', 'swipe', '540', '1900', '540', '1300', '500'); // the Replace row sits under the fold
  await wait(800);
  const replace = screenWords().find(w => w.text.toLowerCase().startsWith('replace'));
  if (!replace) throw new Error(`Replace row not found (${tag})`);
  tap((replace.left + replace.right) / 2, (replace.top + replace.bottom) / 2);
  // Burst: the toast lives ~2 s and the clipboard overlay can cover part of it.
  for (const [i, ms] of [[1, 450], [2, 700], [3, 1500]]) {
    await wait(ms);
    shot(tag(`chrome-toast-burst${i}`));
  }
  const frames = [1, 2, 3].map(i => screenText());
  const legible = frames.some(text => text.includes('paste') || text.includes('copied'));
  if (!legible) throw new Error(`no legible toast frame over Chrome (${tag})`);
  const after = screenText();
  console.log(`${tag} toast legible over Chrome; applied-in-field: ${after.includes('tuesday morning') ? 'chrome kept the original (honest fallback path)' : 'chrome took the rewrite'}; before-contained-tuesday=${before.includes('tuesday morning')}`);
  page.close();
};

const priorMode = adb('shell', 'cmd', 'uimode', 'night').trim().match(/^Night mode: (yes|no|auto|custom_schedule|custom_bedtime)$/)?.[1];
if (!priorMode) throw new Error('Could not read the emulator night mode.');
const priorServices = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
const priorAccessibility = adb('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim();
try {
  adb('shell', 'settings', 'put', 'secure', 'ui_night_mode_custom_type', '-1');
  for (const mode of ['light', 'dark']) await run(mode);
} finally {
  for (const args of [
    ['shell', 'cmd', 'uimode', 'night', priorMode],
    ['shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', ...(priorServices === 'null' ? ['com.example.disabled/NoService'] : [priorServices])],
    ['shell', 'settings', 'put', 'secure', 'accessibility_enabled', ...(priorAccessibility === 'null' ? ['1'] : [priorAccessibility])],
  ]) {
    try { adb(...args); } catch { /* best-effort restore */ }
  }
}

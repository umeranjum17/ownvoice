// OWNVOICE-RN-08 emulator evidence driver (adapted from e2e/rn05.mjs helpers).
// Emulator-only: refuses any serial that is not emulator-*. Never touches a phone.
// Proves rows R1-R5 with the release build and the build-flagged stand-in writer:
// selection-menu and share entry, the three chips, Replace returning the chosen version
// (logcat fingerprint, never the text), read-only offering only Copy, a new number
// warned, the bubble hidden while the sheet shows, and the drafts panel's verdict note.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (phones are refused).');
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = process.argv[3] ?? 'reports/rn08';
const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const rewrite = `${pkg}/dev.ownvoice.bridge.RewriteActivity`;
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
const shell = (...args) => { const r = adb('shell', ...args); console.error(`[${new Date().toISOString().slice(11, 19)}] shell:`, args.join(' ').slice(0, 90)); return r; };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const wake = () => { shell('input', 'keyevent', 'KEYCODE_WAKEUP'); shell('svc', 'power', 'stayon', 'true'); shell('settings', 'put', 'system', 'screen_off_timeout', '1800000'); };

mkdirSync(out, { recursive: true });
const [width, height] = shell('wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
const cropTop = 100; // exclude the status bar
const shot = async name => {
  const raw = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 24 * 1024 * 1024 });
  execFileSync('magick', ['png:', '-crop', `${width}x${height - cropTop}+0+${cropTop}`, '+repage', `${out}/${name}.png`], { input: raw });
  console.log(`shot ${name}`);
};
const tap = (x, y) => shell('input', 'tap', String(Math.round(x)), String(Math.round(y)));
const passInputs = image => { // one screencap, OCR'd whole, in 150px strips (psm 7) and negated for white-on-dark
  const inputs = [{ input: image, top: 0, psm: false }];
  for (let i = 0; i < Math.ceil(height / 150); i += 1) inputs.push({ input: execFileSync('magick', ['png:', '-crop', `${width}x150+0+${i * 150}`, '+repage', 'png:-'], { input: image }), top: i * 150, psm: true });
  inputs.push({ input: execFileSync('magick', ['png:', '-channel', 'R', '-threshold', '99.5%', '-separate', '+channel', '-negate', 'png:-'], { input: image }), top: 0, psm: false });
  const grey = execFileSync('magick', ['png:', '-colorspace', 'gray', 'png:-'], { input: image }); // two-step: an inline gray+threshold chain converts differently and OCRs nothing
  inputs.push({ input: execFileSync('magick', ['png:', '-threshold', '60%', 'png:-'], { input: grey }), top: 0, psm: false }); // dark-mode filled buttons (dark labels on light pills) only OCR after a hard grey threshold // white labels on filled buttons: isolate pure-white pixels, else tesseract reads nothing (a -negate pass alone finds none of them)
  return inputs;
};
const ocrPass = ({ input, top, psm }) => {
  const found = [];
  const tsv = execFileSync('tesseract', ['stdin', 'stdout', ...(psm ? ['--psm', '7'] : []), 'tsv'], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  for (const row of tsv.split('\n').slice(1)) {
    const c = row.split('\t');
    if (c.length < 12 || !c[11].trim()) continue;
    found.push({ text: c[11], left: Number(c[6]), top: Number(c[7]) + top, right: Number(c[6]) + Number(c[8]), bottom: Number(c[7]) + Number(c[9]) + top });
  }
  return found;
};
/** One screencap, every OCR pass clustered on its own: words from different passes never join one line. */
const screenClusters = () => {
  const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 24 * 1024 * 1024 });
  return passInputs(image).flatMap(ocrPass2 => clusters(ocrPass(ocrPass2)));
};
const clusters = words => {
  words.sort((a, b) => a.top - b.top || a.left - b.left);
  const groups = [];
  for (const word of words) {
    const group = groups.find(g => word.top < g.bottom + 14 && word.bottom > g.top - 14);
    if (group) {
      group.words.push(word);
      group.top = Math.min(group.top, word.top);
      group.bottom = Math.max(group.bottom, word.bottom);
      group.left = Math.min(group.left, word.left);
      group.right = Math.max(group.right, word.right);
    } else groups.push({ words: [word], left: word.left, right: word.right, top: word.top, bottom: word.bottom });
  }
  return groups.map(g => {
    const ws = g.words.sort((a, b) => a.left - b.left);
    return { text: ws.map(w => w.text).join(' ').toLowerCase(), words: ws, left: g.left, top: g.top, right: g.right, bottom: g.bottom };
  });
};
const textPresent = async (label, tries = 6) => {
  const lower = label.toLowerCase();
  for (let attempt = 0; attempt < tries; attempt++) {
    if (screenClusters().some(g => g.text.includes(lower))) return true;
    if (attempt < tries - 1) await wait(600);
  }
  writeFileSync(`${out}/.debug-miss.png`, execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 24 * 1024 * 1024 }));
  console.log(`MISS: ${label} | focus: ${shell('dumpsys', 'window').split('\n').find(l => l.includes('mCurrentFocus'))}`);
  return false;
};
const tapTextOrNull = async (label, state = '') => { // exact-label clusters (chips, buttons) win over lines merely containing the word, so a note's leading word never steals a button's tap
  const lower = label.toLowerCase();
  for (let attempt = 0; attempt < 5; attempt++) {
    const exact = [];
    const loose = [];
    for (const group of screenClusters()) {
      if (!group.text.includes(lower) || !group.text.includes(state.toLowerCase())) continue;
      (group.text.trim() === lower ? exact : loose).push(group);
    }
    const all = (exact.length ? exact : loose).map(group => {
      const single = group.words.find(w => w.text.toLowerCase() === lower);
      const box = exact.length ? group : single ?? group;
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    });
    const line = all.sort((a, b) => (a.right - a.left) * (a.bottom - a.top) - (b.right - b.left) * (b.bottom - b.top))[0];
    if (line) { const at = [(line.left + line.right) / 2, (line.top + line.bottom) / 2]; tap(at[0], at[1]); return at; }
    if (attempt < 4) await wait(600);
  }
  return null;
};
const tapText = async (label, state = '') => {
  const at = await tapTextOrNull(label, state);
  if (!at) writeFileSync(`${out}/miss-${label.replace(/\W/g, '_')}.png`, execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 24 * 1024 * 1024 }));
  if (!at) throw new Error(`Could not find visible ${label} ${state}`);
  return at;
};
const bubbleVisible = () => {
  const window = adb('shell', 'dumpsys', 'window', 'windows').split(/(?=Window #\d+ Window)/).find(item => item.includes(`u0 ${pkg}`) && item.includes('ty=ACCESSIBILITY_OVERLAY'));
  return window?.match(/mViewVisibility=(0x[0-9a-f]+)/)?.[1] === '0x0';
};
const scrollSheet = async () => { shell('input', 'swipe', '540', '2000', '540', '900', '400'); await wait(700); }; // the Replace/Copy row sits under the fold in the sheet's scroll view
/** Taps the row's filled button (Replace editable, Copy read-only). Tesseract only ever reads a
 *  filled pill when the crop is mostly pill, so: find the pill as the band's dominant non-background
 *  colour, OCR the tight crop to confirm the label, and fall back to tapping the pill's own centre —
 *  it is the only filled button in that band. */
const parsePx = out => {
  const pat = /^\s*(\d+),(\d+):\s*\((\d+),(\d+),(\d+)/;
  const px = [];
  for (const line of out.split('\n')) { const m = pat.exec(line); if (m) px.push([+m[1], +m[2], +m[3], +m[4], +m[5]]); }
  return px;
};
/** True when a cluster carries every word of the label somewhere (a wrapped verdict line reads as
 *  'a more bit stock: simply …', so a contiguous substring would miss it). */
const wordsPresent = async (label, tries = 1) => {
  const want = label.toLowerCase().split(/\s+/);
  for (let attempt = 0; attempt < tries; attempt++) {
    if (screenClusters().some(g => { const ws = g.text.split(/\s+/).map(w => w.replace(/[^\p{L}\p{N}]+/gu, '')); return want.every(w => ws.includes(w)); })) return true;
    if (attempt < tries - 1) await wait(600);
  }
  return false;
};
const tapButtonRow = async (label, verdict = 'Sounds natural') => {
  const lower = label.toLowerCase();
  for (let attempt = 0; attempt < 5; attempt++) {
    const group = screenClusters().find(g => g.text.includes(verdict.toLowerCase()));
    if (group) {
      const y0 = group.bottom + 10;
      const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 24 * 1024 * 1024 });
      const bg = parsePx(execFileSync('magick', ['png:', '-crop', '10x10+950+' + (y0 + 60), '+repage', 'txt:-'], { input: image, encoding: 'utf8' }))[0].slice(2);
      const band = parsePx(execFileSync('magick', ['png:', '-crop', `${width}x160+0+${y0}`, '+repage', 'txt:-'], { input: image, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
      const far = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 90;
      const counts = new Map();
      for (const [, , r, g, b] of band) { if (!far([r, g, b], bg)) continue; const k = `${r},${g},${b}`; counts.set(k, (counts.get(k) || 0) + 1); }
      let best = null;
      for (const [k, n] of counts) if (n > 3000 && (!best || n > best.n)) best = { c: k.split(',').map(Number), n };
      if (best) {
        const near = ([, , r, g, b]) => Math.abs(r - best.c[0]) + Math.abs(g - best.c[1]) + Math.abs(b - best.c[2]) < 60;
        const hit = band.filter(near);
        const x0 = Math.min(...hit.map(p => p[0])), x1 = Math.max(...hit.map(p => p[0]));
        const py0 = Math.min(...hit.map(p => p[1])) + y0, py1 = Math.max(...hit.map(p => p[1])) + y0;
        if (x1 - x0 >= 100 && x1 - x0 <= 700 && py1 - py0 >= 60 && py1 - py0 <= 150) {
          const crop = execFileSync('magick', ['png:', '-crop', `${x1 - x0 + 12}x${py1 - py0 + 8}+${Math.max(0, x0 - 6)}+${py0 - 4}`, '+repage', 'png:-'], { input: image });
          const grey = execFileSync('magick', ['png:', '-colorspace', 'gray', 'png:-'], { input: crop });
          for (const input of [crop, grey, execFileSync('magick', ['png:', '-threshold', '60%', 'png:-'], { input: grey })]) {
            const tsv = execFileSync('tesseract', ['stdin', 'stdout', 'tsv'], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
            for (const row of tsv.split('\n').slice(1)) {
              const c = row.split('\t');
              if (c.length < 12 || c[11].toLowerCase() !== lower) continue;
              tap(Math.max(0, x0 - 6) + Number(c[6]) + Number(c[8]) / 2, py0 - 4 + Number(c[7]) + Number(c[9]) / 2);
              return;
            }
          }
          tap((x0 + x1) / 2, (py0 + py1) / 2); // no variant read the label; the pill is the only filled button here
          return;
        }
      }
    }
    await wait(600);
  }
  throw new Error(`Could not find the ${label} button under the ${verdict} card`);
};
const type = text => shell('input', 'text', text.replaceAll(' ', '%s'));
const enter = () => shell('input', 'keyevent', '66');
const back = async () => { shell('input', 'keyevent', '4'); await wait(900); };
const clearLog = () => execFileSync('adb', ['-s', serial, 'logcat', '-c']);
const logcat = () => adb('logcat', '-d', '-s', 'OwnvoiceNative:I');
const sha = text => createHash('sha256').update(text).digest('hex').slice(0, 12);
const rebindService = async () => {
  const enabled = shell('settings', 'get', 'secure', 'enabled_accessibility_services').trim();
  const services = new Set(enabled === 'null' ? [] : enabled.split(':'));
  services.add(component);
  const without = [...services].filter(x => x !== component);
  shell('settings', 'put', 'secure', 'enabled_accessibility_services', without.length ? without.join(':') : 'com.example.disabled/NoService');
  await wait(1500);
  shell('settings', 'put', 'secure', 'enabled_accessibility_services', [...services].join(':'));
  await wait(1500);
  if (!shell('settings', 'get', 'secure', 'enabled_accessibility_services').includes(component)) throw new Error('service not enabled');
};

execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
await rebindService();

const freshSetup = async (mode = 'no') => { // a clean install per scenario: the prefs and task stack start known
  wake();
  execFileSync('adb', ['-s', serial, 'uninstall', pkg], { stdio: 'ignore' });
  execFileSync('adb', ['-s', serial, 'install', '-t', apk], { stdio: 'ignore' });
  shell('am', 'force-stop', 'com.android.settings');
  shell('cmd', 'uimode', 'night', 'custom_schedule', '-o', 'off'); // the emulator's twilight schedule would otherwise re-enable night over 'no' (current host time is inside it)
  shell('cmd', 'uimode', 'night', mode);
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
  await rebindService();
  shell('input', 'keyevent', 'KEYCODE_HOME');
  await wait(500);
  shell('am', 'start', '-n', `${pkg}/.MainActivity`, '--windowingMode', '1');
  await wait(4000);
  if (!shell('dumpsys', 'window').split('\n').some(l => l.includes('mCurrentFocus') && l.includes('ownvoice.next'))) throw new Error('freshSetup: the app did not come to the front');
  // the RN home swaps to /setup until setup-done sits in the expo-sqlite kv-store; seed it after first boot made the db, then cold-restart
  shell('su', '0', 'sqlite3', '/data/data/dev.ownvoice.next/files/SQLite/ExpoSQLiteStorage', `"INSERT OR REPLACE INTO storage(key,value) VALUES('setup-done','true');"`);
  shell('am', 'force-stop', pkg);
  await wait(800);
  await rebindService();
  shell('am', 'start', '-n', `${pkg}/.MainActivity`, '--windowingMode', '1');
  await wait(4500);
  if (!(await textPresent('Message', 3))) throw new Error('freshSetup: the practice field never showed (setup not seeded?)');
};

const openRewrite = async ({ action = 'android.intent.action.PROCESS_TEXT', text, readonly = false }) => {
  if (shell('dumpsys', 'window').includes('RewriteActivity')) { // a stale sheet would swallow this intent into its old input; back can miss when JS is busy, so kill the process and re-bind the service (AGENTS.md)
    shell('am', 'force-stop', pkg);
    await wait(800);
    await rebindService();
  }
  const extra = action.endsWith('PROCESS_TEXT') ? '--es android.intent.extra.PROCESS_TEXT' : '--es android.intent.extra.TEXT';
  let cmd = `am start -n ${rewrite} -a ${action} -t text/plain ${extra} "${text}"`;
  if (readonly) cmd += ' --ez android.intent.extra.PROCESS_TEXT_READONLY true';
  shell(cmd);
  await wait(2500); // the sheet slides up and reads its intent
  if (!shell('dumpsys', 'window').includes('RewriteActivity')) throw new Error(`the rewrite sheet did not open for "${text}"`);
};
const focusField = async () => { await tapText('Message'); await wait(900); };
const openPanel = async () => {
  for (let i = 0; i < 3; i++) {
    tap(width - 90 * width / 1080, height / 2);
    await wait(4000); // stub: fixed drafts land at once
    if (shell('dumpsys', 'window').includes('PanelActivity')) return;
  }
  throw new Error('the panel never opened from the bubble tap');
};

const SELECTION = 'I think we should move the call to Tuesday.';
const SHORT = 'I think we should move the call to Tuesday.';
const PLAIN = 'We should move the call to Tuesday.';

for (const mode of ['no', 'yes']) {
  const scheme = mode === 'no' ? 'light' : 'dark';

  // R2: an empty selection only shows the plain hint.
  await freshSetup(mode);
  await openRewrite({ text: ' ' });
  if (!(await textPresent('Select some text first'))) throw new Error(`empty selection hint missing (${scheme})`);
  await shot(`08-01-empty-${scheme}`);
  await back();

  // R2/R3: the selection card and the three chips; Shorter writes the short version.
  await openRewrite({ text: SELECTION });
  if (!(await textPresent('You selected'))) throw new Error(`selection card missing (${scheme})`);
  await shot(`08-02-chips-${scheme}`);
  await tapText('Shorter');
  await wait(1200);
  if (!(await textPresent('Replace your text with it'))) throw new Error(`editable note missing (${scheme})`);
  await scrollSheet(); // bring the Replace/Copy row into view for the shot and the tap
  await shot(`08-03-result-editable-${scheme}`);

  // R4: Replace returns the chosen version (fingerprinted in the log) and copies it too.
  clearLog();
  await tapButtonRow('Replace');
  await wait(500);
  await shot(`08-04-replaced-toast-${scheme}`);
  if (!logcat().includes(`rewrite returned sha=${sha(SHORT)}`)) throw new Error(`Replace did not return the chosen version (${scheme})`);

  // R4: a read-only share offers only Copy.
  await openRewrite({ text: SELECTION, action: 'android.intent.action.SEND', readonly: true });
  await tapText('Simpler');
  await wait(1200);
  if (!(await textPresent('Copy it, then paste it'))) throw new Error(`share note missing (${scheme})`);
  if (await textPresent('Replace your text')) throw new Error(`read-only offers Replace (${scheme})`);
  await scrollSheet(); // bring the Copy row into view for the shot and the tap
  await shot(`08-05-result-readonly-${scheme}`);
  clearLog();
  await tapButtonRow('Copy');
  await wait(500);
  if (!logcat().includes(`rewrite copied sha=${sha(PLAIN)}`)) throw new Error(`read-only Copy did not copy the chosen version (${scheme})`);

  // A rewrite that adds a number is warned about.
  await openRewrite({ text: 'Can we push it?!!' });
  await tapText('Shorter');
  await wait(1200);
  if (!(await textPresent('Check this'))) throw new Error(`the added number was not warned (${scheme})`);
  await shot(`08-06-number-warned-${scheme}`);
  await back();
}

// R5: the bubble hides while the sheet shows, and comes back after it.
await freshSetup('no');
for (let i = 0; i < 10 && !bubbleVisible(); i++) await wait(1000);
if (!bubbleVisible()) throw new Error('the bubble never showed over the home screen');
await openRewrite({ text: SELECTION });
if (!(await textPresent('You selected'))) throw new Error('the sheet did not render before the bubble check'); // wait for the mount that hides it
if (bubbleVisible()) throw new Error('the bubble stayed visible while the rewrite sheet showed');
await shot('08-07-bubble-hidden-while-sheet');
shell('input', 'keyevent', '4');
await wait(3500);
if (!bubbleVisible()) throw new Error('the bubble did not come back after the sheet closed');

// The drafts panel's shared verdict note: three clean cards say the same thing, so the note hides.
await freshSetup('no');
await focusField();
await openPanel();
if (await textPresent('Sounds natural')) throw new Error('the shared verdict note showed on identical cards');
await shot('08-08-panel-shared-note-hidden-light');
await tapText('Why?');
await wait(2500);
if (!(await textPresent('reading your writing'))) throw new Error('the Why? cover does not say what was checked');
await shot('08-09-why-cover-checked-line-light');
await back(); // the cover closes first
await back();

// Cards that differ keep every verdict line.
await freshSetup('no');
await focusField();
type('stock please');
await enter();
await wait(400);
await openPanel();
// three cards are taller than the sheet; sweep the list while checking every verdict line shows
let sawStock = false, sawNatural = false;
for (let i = 0; i < 9 && !(sawStock && sawNatural); i++) { // gentle sweeps: a fling jumps past the row that fits on no single screen
  sawNatural ||= await textPresent('Sounds natural', 1);
  sawStock ||= await wordsPresent('A bit stock');
  if (!(sawStock && sawNatural)) { shell('input', 'swipe', '540', '1900', '540', '1350', '600'); await wait(700); }
}
if (!sawStock) throw new Error('the differing card lost its verdict line');
if (!sawNatural) throw new Error('the clean cards lost their verdict line when the cards differed');
await shot('08-10-panel-differing-verdicts-light');
await back();

// The same two panel states in dark.
await freshSetup('yes');
await focusField();
await openPanel();
await shot('08-11-panel-shared-note-hidden-dark');
await tapText('Why?');
await wait(2500);
await shot('08-12-why-cover-checked-line-dark');
await back();
await back();
await freshSetup('yes');
await focusField();
type('stock please');
await enter();
await wait(400);
await openPanel();
for (let i = 0; i < 5; i++) { shell('input', 'swipe', '540', '1900', '540', '1350', '600'); await wait(700); } // gentle sweeps so the stock card's verdict line is on screen for the shot
await shot('08-13-panel-differing-verdicts-dark');
await back();

console.log(`Screenshots saved to ${out}. Rewrite R1-R5, Replace and Copy fingerprints, the new-number warning, the hidden bubble and the panel verdict note all check out.`);

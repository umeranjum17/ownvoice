// OWNVOICE-RN-08 emulator evidence driver (adapted from e2e/rn05.mjs helpers).
// Proves rows R1-R5 with the release build and the build-flagged stand-in writer:
// direct process-text and share intents (not the selection-menu chooser), the three chips,
// Replace returning a changed version into an editable field, read-only offering only Copy, a new number
// warned, the bubble hidden while the sheet shows, and the drafts panel's verdict note.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const serial = process.env.ANDROID_SERIAL;
const avdName = process.env.OWNVOICE_AVD_NAME?.trim();
if (!/^emulator-\d+$/.test(serial ?? '') || !avdName) throw new Error('Set ANDROID_SERIAL to an emulator and OWNVOICE_AVD_NAME to its owned AVD name.');
const actualAvd = execFileSync('adb', ['-s', serial, 'emu', 'avd', 'name'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
if (actualAvd !== avdName) throw new Error(`Refusing ${serial}: AVD ${actualAvd} does not match ${avdName}.`);
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
const waitForFocus = async (packageName, tries = 8) => {
  for (let i = 0; i < tries; i++) {
    if (shell('dumpsys', 'window').split('\n').some(l => l.includes('mCurrentFocus') && l.includes(packageName))) return true;
    if (i < tries - 1) await wait(600);
  }
  return false;
};
const expectedApkSha = createHash('sha256').update(readFileSync(apk)).digest('hex');
const install = (...options) => {
  execFileSync('adb', ['-s', serial, 'install', ...options, apk], { stdio: 'inherit' });
  const path = shell('pm', 'path', pkg).split('\n').find(line => line.startsWith('package:') && line.trim().endsWith('/base.apk'))?.trim().slice(8);
  const installedSha = path && shell('sha256sum', path).trim().split(/\s+/)[0];
  if (installedSha !== expectedApkSha) throw new Error('Installed APK differs from release build; refusing to test a stale install.');
};

mkdirSync(out, { recursive: true });
const [width, height] = [...shell('wm', 'size').matchAll(/(\d+)x(\d+)/g)].at(-1).slice(1).map(Number);
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
    found.push({ text: c[11].trim(), left: Number(c[6]), top: Number(c[7]) + top, right: Number(c[6]) + Number(c[8]), bottom: Number(c[7]) + Number(c[9]) + top });
  }
  return found;
};
/** One screencap, every OCR pass clustered on its own: words from different passes never join one line. */
const readWords = () => ocrPass({ input: execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 24 * 1024 * 1024 }), top: 0, psm: false });
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
const tapButtonRow = async (label, result) => {
  const lower = label.toLowerCase();
  const lastWord = result.trim().split(/\s+/).at(-1).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  for (let attempt = 0; attempt < 5; attempt++) {
    const groups = screenClusters();
    const chip = groups.find(g => g.text.includes('fix spelling'));
    const group = chip && groups.find(g => g.top > chip.bottom && g.words.some(w => w.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') === lastWord));
    if (group) {
      const exact = groups.find(g => g.top > group.bottom && g.text.trim() === lower);
      if (exact) { tap((exact.left + exact.right) / 2, (exact.top + exact.bottom) / 2); return; }
      const y0 = group.bottom + 10;
      const bandHeight = Math.min(160, height - y0 - 80);
      if (bandHeight <= 0) { await wait(600); continue; }
      const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 24 * 1024 * 1024 });
      const bg = parsePx(execFileSync('magick', ['png:', '-crop', '10x10+950+' + (y0 + 60), '+repage', 'txt:-'], { input: image, encoding: 'utf8' }))[0].slice(2);
      const band = parsePx(execFileSync('magick', ['png:', '-crop', `${width}x${bandHeight}+0+${y0}`, '+repage', 'txt:-'], { input: image, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
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
  throw new Error(`Could not find the ${label} button below the rewrite`);
};
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
  if (!shell('settings', 'get', 'secure', 'enabled_accessibility_services').includes(component) || shell('settings', 'get', 'secure', 'accessibility_enabled').trim() !== '1') throw new Error('service not enabled');
};

const freshSetup = async (mode = 'no') => { // a clean install per scenario: the prefs and task stack start known
  wake();
  if (shell('pm', 'list', 'packages', pkg).split('\n').includes(`package:${pkg}`)) execFileSync('adb', ['-s', serial, 'uninstall', pkg], { stdio: 'ignore' });
  install('-t');
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
  await wait(4000); // allow Expo to create the kv-store before seeding it
  if (!(await waitForFocus(pkg))) throw new Error('freshSetup: the app did not come to the front');
  // the RN home swaps to /setup until setup-done sits in the expo-sqlite kv-store; seed it after first boot made the db, then cold-restart
  shell('su', '0', 'sqlite3', '/data/data/dev.ownvoice.next/files/SQLite/ExpoSQLiteStorage', `"INSERT OR REPLACE INTO storage(key,value) VALUES('setup-done','true');"`);
  shell('am', 'force-stop', pkg);
  await wait(800);
  await rebindService();
  shell('am', 'start', '-n', `${pkg}/.MainActivity`, '--windowingMode', '1');
  await wait(4500);
  if (!(await waitForFocus(pkg))) throw new Error('freshSetup: the app did not return to the front');
  if (!(await textPresent('Writes on this phone', 3))) {
    await back(); // service connection can surface the onboarding deep link after home opens
    if (!(await textPresent('Writes on this phone', 3))) throw new Error('freshSetup: home never showed (setup not seeded?)');
  }
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
const focusField = async () => { await tapText('Message'); await wait(900); }; // only on the Chrome practice page
const openPanel = async () => {
  for (let i = 0; i < 3; i++) {
    tap(width - 90 * width / 1080, height / 2);
    await wait(4000); // stub: fixed drafts land at once
    if (await waitForFocus('PanelActivity', 3)) return;
  }
  throw new Error('the panel never opened from the bubble tap');
};

const SELECTION = 'I think we should move the call to Tuesday. Really.';
const SHORT = 'I think we should move the call to Tuesday.';
const PLAIN = 'We should move the call to Tuesday. Really.';
const RECEIVER_ORIGINAL = 'Move Tuesday. Really.';
const RECEIVER_SHORT = 'Move Tuesday.';

const openEditableSelection = async () => {
  // The bubble floats over Home and tesseract segments this row badly (the 150 px strips slice
  // it, whole-frame modes merge it with neighbouring rows), so tap the row's known Home
  // position; the 'example' field check below proves the right screen opened.
  if (!shell('dumpsys', 'window').split('\n').some(l => l.includes('mCurrentFocus') && l.includes('ownvoice.next'))) {
    wake();
    shell('am', 'start', '-n', `${pkg}/.MainActivity`, '--windowingMode', '1');
    await wait(3500);
  }
  tap(width / 2, 1345);
  await wait(900);
  let field;
  for (let i = 0; i < 6 && !field; i++) {
    field = screenClusters().find(g => g.text.includes('example') && g.top > 800);
    if (!field) await wait(500);
  }
  if (!field) throw new Error('Your voice editable field did not appear');
  const x = width / 2, y = (field.top + field.bottom) / 2;
  tap(x, y);
  shell('input', 'text', RECEIVER_ORIGINAL.replaceAll(' ', '%s'));
  await wait(800);
  if (!(await textPresent(RECEIVER_ORIGINAL))) throw new Error('editable receiver was not filled');
  shell('input', 'swipe', String(x), String(y), String(x), String(y), '1100');
  let select;
  for (let i = 0; i < 6 && !select; i++) {
    select = readWords().find(w => w.text.toLowerCase().startsWith('select') && w.top > 700);
    if (!select) await wait(500);
  }
  if (!select) throw new Error('Select all action missing');
  tap((select.left + select.right) / 2, (select.top + select.bottom) / 2);
  let share;
  for (let i = 0; i < 6 && !share; i++) {
    share = readWords().find(w => w.text.toLowerCase().startsWith('share') && w.top > 700);
    if (!share) await wait(500);
  }
  if (!share) throw new Error('selection overflow menu did not appear');
  tap(share.right + 90 * width / 1080, (share.top + share.bottom) / 2); // overflow is immediately after Share, not at the screen edge.
  await wait(500);
  let menuAction;
  for (let i = 0; i < 5 && !menuAction; i++) {
    menuAction = readWords().find(w => w.text.toLowerCase() === 'ownvoice' && w.left > width / 3 && w.top > 700 && w.top < 1300);
    if (!menuAction) await wait(500);
  }
  if (!menuAction) throw new Error('Ownvoice selection action missing');
  tap((menuAction.left + menuAction.right) / 2, (menuAction.top + menuAction.bottom) / 2);
  if (!(await waitForFocus('RewriteActivity'))) throw new Error('editable selection did not open Ownvoice');
};

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

  clearLog();
  await tapButtonRow('Replace', SHORT);
  await wait(500);
  await shot(`08-04-replaced-toast-${scheme}`);
  // A direct-intent sheet has no attributable caller, so the rewrite is copy-only there: the
  // page field stays untouched and nothing is handed back.
  if (!logcat().includes(`rewrite copied (page) sha=${sha(SHORT)}`)) throw new Error(`copy-only replace did not run (${scheme})`);

  await freshSetup(mode);
  await openEditableSelection();
  if (!(await textPresent(RECEIVER_ORIGINAL))) throw new Error(`selected editor text missing (${scheme})`);
  await tapText('Shorter');
  if (!(await textPresent('Replace your text with it'))) throw new Error(`editable selection did not rewrite (${scheme})`);
  await scrollSheet();
  clearLog();
  await tapButtonRow('Replace', RECEIVER_SHORT);
  await wait(900);
  if (!(await waitForFocus('.MainActivity')) || !(await textPresent(RECEIVER_SHORT)) || await textPresent(RECEIVER_ORIGINAL))
    throw new Error(`Replace did not update the receiving editable selection (${scheme})`);
  if (!logcat().includes(`rewrite returned sha=${sha(RECEIVER_SHORT)}`)) throw new Error(`Replace did not return the changed text (${scheme})`);

  // R4: a read-only share offers only Copy.
  await openRewrite({ text: SELECTION, action: 'android.intent.action.SEND', readonly: true });
  await tapText('Simpler');
  await wait(1200);
  if (!(await textPresent('Copy it, then paste it'))) throw new Error(`share note missing (${scheme})`);
  if (await textPresent('Replace your text')) throw new Error(`read-only offers Replace (${scheme})`);
  await scrollSheet(); // bring the Copy row into view for the shot and the tap
  await shot(`08-05-result-readonly-${scheme}`);
  clearLog();
  await tapButtonRow('Copy', PLAIN);
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
await openPanel();
if (await textPresent('Sounds natural')) throw new Error('the shared verdict note showed on identical cards');
await shot('08-08-panel-shared-note-hidden-light');
await tapText('Why?');
await wait(2500);
if (!(await textPresent('reading your writing'))) throw new Error('the Why? cover does not say what was checked');
await shot('08-09-why-cover-checked-line-light');
await back(); // the cover closes first
await back();

// Cards that differ keep every verdict line. A real editable Chrome field supplies the draft;
// the home page's prose about a "message box" is not a field.
const page = createServer((_, response) => { response.setHeader('Content-Type', 'text/html'); response.end('<meta name="viewport" content="width=device-width, initial-scale=1"><label>Message <textarea>stock please</textarea></label>'); });
await new Promise(resolve => page.listen(0, '0.0.0.0', resolve));
const openStockField = async () => {
  const openPage = () => shell('am', 'start', '-a', 'android.intent.action.VIEW', '-d', `http://10.0.2.2:${page.address().port}/`, 'com.android.chrome');
  openPage();
  if (await textPresent('Use without an account', 4)) { await tapText('Use without an account'); openPage(); }
  if (await textPresent('Chrome notifications', 2)) { tap(width * 0.52, height * 0.73); await wait(800); }
  else if (await textPresent('No thanks', 2)) { await tapText('No thanks'); openPage(); }
  if (!(await waitForFocus('com.android.chrome'))) throw new Error('Chrome practice field did not load in front');
  if (!(await textPresent('stock please', 4))) throw new Error('Chrome practice field did not load in front');
  await focusField();
  if (shell('settings', 'get', 'secure', 'accessibility_enabled').trim() !== '1') await rebindService();
};
await freshSetup('no');
await openStockField();
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
await openPanel();
await shot('08-11-panel-shared-note-hidden-dark');
await tapText('Why?');
await wait(2500);
await shot('08-12-why-cover-checked-line-dark');
await back();
await back();
await freshSetup('yes');
await openStockField();
await openPanel();
let darkStock = false, darkNatural = false;
for (let i = 0; i < 9 && !(darkStock && darkNatural); i++) {
  darkNatural ||= await textPresent('Sounds natural', 1);
  darkStock ||= await wordsPresent('A bit stock');
  if (!(darkStock && darkNatural)) { shell('input', 'swipe', '540', '1900', '540', '1350', '600'); await wait(700); }
}
if (!darkStock || !darkNatural || !(await waitForFocus('PanelActivity', 1))) throw new Error('dark differing verdict panel did not stay visible');
await shot('08-13-panel-differing-verdicts-dark');
await back();
page.close();

console.log(`Screenshots saved to ${out}. Rewrite R1-R5, Replace and Copy fingerprints, the new-number warning, the hidden bubble and the panel verdict note all check out.`);

// OWNVOICE-RN-05 emulator evidence driver (adapted from e2e/driver.mjs helpers).
// Emulator-only: refuses any serial that is not emulator-*. Never touches a phone.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (phones are refused).');
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = process.argv[3] ?? 'reports/rn05';
const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
const shell = (...args) => { const r = adb('shell', ...args); console.error(`[${new Date().toISOString().slice(11, 19)}] shell:`, args.join(' ').slice(0, 90)); return r; };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const wake = () => { shell('input', 'keyevent', 'KEYCODE_WAKEUP'); shell('svc', 'power', 'stayon', 'true'); shell('settings', 'put', 'system', 'screen_off_timeout', '1800000'); };
const focusNow = () => (shell('dumpsys', 'window').split('\n').find(l => l.includes('mCurrentFocus')) ?? '').trim();

mkdirSync(out, { recursive: true });
const [width, height] = shell('wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
const cropTop = 100; // exclude the status bar
const shot = async name => {
  const raw = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 24 * 1024 * 1024 });
  execFileSync('magick', ['png:', '-crop', `${width}x${height - cropTop}+0+${cropTop}`, '+repage', `${out}/${name}.png`], { input: raw });
  console.log(`shot ${name}`);
};
const tap = (x, y) => shell('input', 'tap', String(Math.round(x)), String(Math.round(y)));
const tapTextOrNull = async (label, state = '') => {
  // Words clustered by vertical overlap (tesseract splits one button across 'lines' and
  // merges stacked buttons into one 'paragraph'; neither maps to what is visually a row).
  const clusters = tsv => {
    const words = [];
    for (const row of tsv.split('\n').slice(1)) {
      const c = row.split('\t');
      if (c.length < 12 || !c[11].trim()) continue;
      words.push({ text: c[11], left: Number(c[6]), top: Number(c[7]) + currentTop, right: Number(c[6]) + Number(c[8]), bottom: Number(c[7]) + Number(c[9]) + currentTop });
    }
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
      const words = g.words.sort((a, b) => a.left - b.left);
      return { text: words.map(w => w.text).join(' ').toLowerCase(), words, left: g.left, top: g.top, right: g.right, bottom: g.bottom };
    });
  };
  // The box of the words that actually say the label (a merged row's centre can be dead space).
  const labelBox = (group, lower) => {
    const single = group.words.find(w => w.text.toLowerCase().includes(lower));
    if (single) return single;
    for (let i = 0; i < group.words.length; i++) {
      for (let j = i; j < group.words.length; j++) {
        const phrase = group.words.slice(i, j + 1).map(w => w.text).join(' ').toLowerCase();
        if (phrase.includes(lower)) return { left: group.words[i].left, right: group.words[j].right, top: Math.min(...group.words.slice(i, j + 1).map(w => w.top)), bottom: Math.max(...group.words.slice(i, j + 1).map(w => w.bottom)) };
      }
    }
    return group;
  };
  let currentTop = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    const all = [];
    const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 24 * 1024 * 1024 });
    for (const top of [0, ...Array.from({ length: Math.ceil(height / 150) }, (_, i) => i * 150 + (attempt % 2 === 1 ? 75 : 0)), -1]) { // -1: the negated frame, for white-on-dark buttons
      currentTop = Math.max(top, 0);
      const input = top > 0 ? execFileSync('magick', ['png:', '-crop', `${width}x150+0+${top}`, '+repage', 'png:-'], { input: image }) : top === -1 ? execFileSync('magick', ['png:', '-negate', 'png:-'], { input: image }) : image;
      const tsv = execFileSync('tesseract', ['stdin', 'stdout', ...(top > 0 ? ['--psm', '7'] : []), 'tsv'], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      for (const item of clusters(tsv)) {
        if (!item.text.includes(label.toLowerCase()) || !item.text.includes(state.toLowerCase())) continue;
        const box = labelBox(item, label.toLowerCase());
        all.push({ text: item.text, left: box.left, top: box.top, right: box.right, bottom: box.bottom });
      }
    }
    const line = all.sort((a, b) => (a.right - a.left) * (a.bottom - a.top) - (b.right - b.left) * (b.bottom - b.top))[0]; // the smallest matching cluster is the real control
    if (line) { const at = [(line.left + line.right) / 2, (line.top + line.bottom) / 2]; tap(at[0], at[1]); return at; }
    if (attempt < 3) await wait(600);
  }
  return null;
};
const tapText = async (label, state = '') => {
  const at = await tapTextOrNull(label, state);
  if (!at) execFileSync('bash', ['-c', `adb -s ${serial} exec-out screencap -p > '/tmp/miss-${label.replace(/\W/g, '_')}.png'`]);
  if (!at) throw new Error(`Could not find visible ${label} ${state}`);
  return at;
};
const bubbleVisible = () => {
  const window = adb('shell', 'dumpsys', 'window', 'windows').split(/(?=Window #\d+ Window)/).find(item => item.includes(`u0 ${pkg}`) && item.includes('ty=ACCESSIBILITY_OVERLAY'));
  const visibility = window?.match(/mViewVisibility=(0x[0-9a-f]+)/)?.[1];
  return visibility === '0x0';
};
// Tap the Dot only once Ownvoice's own screen is in front (the overlay window exists even when
// the bubble view is hidden over a non-enabled app, where the tap would fall through).
const bubble = async (requireApp = true) => {
  for (let i = 0; i < 5 && requireApp; i++) {
    if (shell('dumpsys', 'window').split('\n').some(l => l.includes('mCurrentFocus') && l.includes('ownvoice.next'))) break;
    wake();
    shell('am', 'start', '-n', `${pkg}/.MainActivity`, '--windowingMode', '1');
    await wait(3500);
  }
  if (!requireApp && !bubbleVisible()) throw new Error('bubble never became visible');
  if (requireApp && !shell('dumpsys', 'window').split('\n').some(l => l.includes('mCurrentFocus') && l.includes('ownvoice.next'))) throw new Error('Ownvoice screen never came to the front');
  for (let i = 0; i < 10 && !bubbleVisible(); i++) await wait(1000);
  if (!bubbleVisible()) throw new Error('bubble never became visible');
  for (let i = 0; i < 3; i++) {
    tap(width - 90 * width / 1080, height / 2); // the Dot sits at CENTER_VERTICAL: exactly half the screen height
    await wait(2500);
    if (shell('dumpsys', 'window').includes('PanelActivity')) return;
  }
  throw new Error('the panel never opened from the bubble tap');
};
const type = text => shell('input', 'text', text.replaceAll(' ', '%s'));
const enter = () => shell('input', 'keyevent', '66');
// no keyboard ever shows on this emulator (hardware-keyboard mode), so there is nothing to dismiss;
// a keyevent 4 here would finish the activity instead
const dismissKeyboard = async () => { await wait(200); };
const clearField = async () => {
  shell('input', 'keyevent', '123'); // MOVE_END
  for (let i = 0; i < 90; i++) shell('input', 'keyevent', '67'); // DEL
  await wait(300);
};

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
const restartApp = async () => {
  wake();
  shell('am', 'force-stop', pkg);
  await wait(800);
  await rebindService();
  shell('am', 'start', '-n', `${pkg}/.MainActivity`, '--windowingMode', '1');
  await wait(4000);
};
const setMode = async mode => {
  // an explicit yes/no is manual on this image; no twilight override follows
  shell('cmd', 'uimode', 'night', mode);
  await wait(800);
  await restartApp();
};
const focusField = async () => { await tapText('Message'); await wait(500); await dismissKeyboard(); await wait(400); };

// Enable apps directly in the app's own prefs (root is fine on this emulator) instead of
// OCR-driving the in-app list; the service re-reads them at each rebind.
const chooseApp = async () => {
  shell('am', 'force-stop', pkg);
  await wait(600);
  execFileSync('bash', ['-c', `adb -s ${serial} shell "su 0 sh -c 'cat > /data/data/dev.ownvoice.next/shared_prefs/ownvoice-native.xml'" <<'XML'
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
  await rebindService();
  await wait(500);
};

wake();
// ---- scenario helpers ----
const freshSetup = async (mode = 'no') => { // a clean install per scenario: the field, prefs and task stack all start known
  wake();
  execFileSync('adb', ['-s', serial, 'uninstall', pkg], { stdio: 'ignore' });
  execFileSync('adb', ['-s', serial, 'install', '-t', apk], { stdio: 'ignore' });
  shell('am', 'force-stop', 'com.android.settings');
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
  await rebindService();
  shell('input', 'keyevent', 'KEYCODE_HOME');
  await wait(500);
  shell('am', 'start', '-n', `${pkg}/.MainActivity`, '--windowingMode', '1');
  await wait(4000);
  if (!shell('dumpsys', 'window').split('\n').some(l => l.includes('mCurrentFocus') && l.includes('ownvoice.next'))) throw new Error('freshSetup: the app did not come to the front');
};

const openPanel = async () => { await bubble(); await wait(5000); }; // stub: download 2.5 s + writing 2.5 s

// ---- shots ----
// Reply-ready, light: an empty focused field next to Sam's chat.
await freshSetup('no');
await focusField();
await openPanel();
await shot('05-01-reply-ready-light');

// Why? cover: the rule row, the honest no-model line and the footer.
await tapText('Why?');
await wait(2500);
await shot('05-11-why-cover-light');
shell('input', 'keyevent', '4'); // Back: the cover closes first
await wait(700);

// Insert from the first card: back to Home with the draft and the done pill.
// The pill's white-on-dark label defeats tesseract, so tap its fixed position (first card, ready state).
tap(199, 1132);
await wait(2500);
await shot('05-13-inserted-done-pill');

// Write new ones: the same request again with the shown texts excluded.
await freshSetup('no');
await focusField();
await openPanel();
await tapText('Write new ones');
await wait(6500);
await shot('05-02-reply-rewritten-light');
shell('input', 'keyevent', '4'); // close the panel
await wait(900);

// Empty drafts -> Try again (stub: typed text containing !! asks for no drafts).
await freshSetup('no');
await focusField();
type('!!');
await wait(400);
await openPanel();
await shot('05-12-try-again-empty');
shell('input', 'keyevent', '4');
await wait(900);

// Polish: the numbered-list practice input.
await freshSetup('no');
await focusField();
type('I can bring the stove.');
await enter();
type('1. I will bring the stove.');
await enter();
type('2. You can bring the tent.');
await wait(400);
await openPanel();
await shot('05-03-polish-list-light');

// Writing placeholders: catch the writing phase of a fresh stub run.
shell('input', 'swipe', '540', '1700', '540', '800', 300); // the panel scrolls; bring the button up
await wait(600);
await tapText('Write new ones');
await wait(3400);
await shot('05-09-placeholders-writing');
shell('input', 'keyevent', '4');
await wait(900);

// Dark reply + dark Why?.
await freshSetup('yes');
await focusField();
await openPanel();
await shot('05-04-reply-ready-dark');
await tapText('Why?');
await wait(2500);
await shot('05-11b-why-cover-dark');
shell('input', 'keyevent', '4');
await wait(700);
shell('input', 'keyevent', '4');
await wait(900);

// Compose and empty over a page whose text has no four-word line (served locally, Chrome).
const { createServer } = await import('node:http');
let views = 0;
const page = createServer((_q, r) => r.end(readFileSync(new URL('./page.html', import.meta.url))));
await new Promise(resolve => page.listen(0, '127.0.0.1', resolve));
const { port } = page.address();
// 10.0.2.2 is the emulator's alias for the host loopback; no adb reverse needed.
const openPage = async () => {
  views += 1;
  execFileSync('adb', ['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `http://10.0.2.2:${port}/?v=${views}`], { stdio: 'ignore' });
  await wait(4500);
};
await freshSetup('no');
await openPage();
const welcome = await tapTextOrNull('Use without an account'); // Chrome's first-run screen on a fresh AVD
if (welcome) { await wait(2500); await openPage(); }
const at = await tapText('Textarea');
tap(Math.round(width / 2), at[1] + 280); // the textarea sits under the "Textarea" heading
await wait(600);
type('i can bring the stove, super excited');
await wait(1200);
await openPanel();
await shot('05-05-compose-light');
shell('input', 'keyevent', '4');
await wait(900);

// Empty mode: a reloaded page, nothing focused.
await openPage();
await openPanel();
await wait(2000);
await shot('05-06-empty-light');
shell('input', 'keyevent', '4');
await wait(900);

// Dark compose + empty.
await freshSetup('yes');
await openPage();
const at2 = await tapText('Textarea');
tap(Math.round(width / 2), at2[1] + 280);
await wait(600);
type('i can bring the stove, super excited');
await wait(1200);
await openPanel();
await shot('05-07-compose-dark');
shell('input', 'keyevent', '4');
await wait(900);
await openPage();
await openPanel();
await wait(2000);
await shot('05-08-empty-dark');
shell('input', 'keyevent', '4');
await wait(900);
page.close();

// No capture: a textless Chrome screen -> the check pill and the panel's own line.
await freshSetup('no');
execFileSync('adb', ['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'about:blank'], { stdio: 'ignore' });
await wait(4500);
await bubble(false); // the textless Chrome page: capture returns nothing and the check pill shows
await wait(3000);
await shot('05-14-no-capture-check-pill');
shell('input', 'keyevent', '4');
await wait(900);

// Reply-ready with no field: Home without focusing the message box.
await freshSetup('no');
await bubble();
await shot('05-10-reply-no-field');
shell('input', 'keyevent', '4');
await wait(900);

// E1: two wallpaper palettes on the reply panel.
shell('settings', 'put', 'secure', 'theme_customization_overlay_packages', '{"android.theme.customization.system_palette":"7B4DFF"}');
await freshSetup('no');
await focusField();
await openPanel();
await shot('05-15-palette-1');
shell('input', 'keyevent', '4');
await wait(900);
shell('settings', 'put', 'secure', 'theme_customization_overlay_packages', '{"android.theme.customization.system_palette":"2E6C3F"}');
await freshSetup('no');
await focusField();
await openPanel();
await shot('05-16-palette-2');
shell('input', 'keyevent', '4');
await wait(900);

// E7: font scale 2.0.
shell('settings', 'put', 'system', 'font_scale', '2.0');
await freshSetup('no');
await focusField();
await openPanel();
await shot('05-17-large-text');
shell('settings', 'put', 'system', 'font_scale', '1.0');
shell('input', 'keyevent', '4');
await wait(900);

// E8: reduced motion - the still Dot and a sheet with no slide.
shell('settings', 'put', 'global', 'animator_duration_scale', '0');
await freshSetup('no');
await focusField();
await shot('05-18-reduced-motion-bubble-still'); // the resting Dot, still at animator scale 0
await openPanel();
await shot('05-18b-reduced-motion-panel');
shell('settings', 'put', 'global', 'animator_duration_scale', '1');

console.log(`Screenshots in ${out}`);

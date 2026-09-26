import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// FirstRunTest for the setup slice: welcome -> permission (the test flips the switch) -> setup comes
// back by itself -> practice insert in 4 taps -> only installed apps offered -> home. Every setup
// screen's visible text is scanned for technical words, and the phone's settings are restored after.
// Shell input and screencap only, never UiAutomator (which would unbind the service).
const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
const out = resolve(process.argv[3] ?? 'e2e/artifacts');
mkdirSync(out, { recursive: true });

const wait = ms => new Promise(r => setTimeout(r, ms));
const snap = name => {
  const dark = name.startsWith('dark-');
  adb('shell', 'screencap', '-p', `/sdcard/${name}.png`);
  if (!adb('shell', 'dumpsys', 'uimode').includes(`mComputedNightMode=${dark}`)) throw new Error(`Wrong colour mode for ${name}.`);
  execFileSync('adb', ['-s', serial, 'pull', `/sdcard/${name}.png`, resolve(out, `${name}.png`)], { stdio: 'inherit' });
};

const [width, height] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
const tap = (x, y) => adb('shell', 'input', 'tap', String(x), String(y));
const bubble = () => tap(width - Math.round(90 * width / 1080), Math.round(height * .53));

// OCR the whole screen; returns the visible lowercase text, one screen at a time.
const screenText = () => {
  const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
  const tsv = execFileSync('tesseract', ['stdin', 'stdout', 'tsv'], { input: image, encoding: 'utf8' });
  return tsv.split('\n').slice(1).map(row => row.split('\t')[11]).filter(Boolean).join(' ').toLowerCase();
};

// The plain-words rule, on the device: none of these may show on a setup screen.
const BANNED = [/\bmodel/, /\btokens?\b/, /\bprompt/, /\bgemini/, /\bgemma/, /\bnano\b/, /aicore/, /ml ?kit/, /\bllm\b/, /\bjudge\b/, /\bslop\b/, /characters/, /on-device/, /gpt-\d/, /\bcodex\b/, /openai api/, /\bresponses\b/, /\/100/, /\/10\b/];
const expectPlain = label => {
  const text = screenText();
  const bad = BANNED.filter(pattern => pattern.test(text)).map(p => String(p));
  if (bad.length) throw new Error(`${label}: technical words on screen: ${bad.join(', ')}\n${text}`);
};

// A phrase on screen, waited for. Tesseract's TSV is one word per row, so words are joined first.
const waitForLine = async (labels, tries = 20) => {
  const wanted = (Array.isArray(labels) ? labels : [labels]).map(label => label.toLowerCase());
  for (let attempt = 0; attempt < tries; attempt++) {
    const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
    const tsv = execFileSync('tesseract', ['stdin', 'stdout', 'tsv'], { input: image, encoding: 'utf8' });
    const text = tsv.split('\n').slice(1).map(row => row.split('\t')[11]).filter(Boolean).join(' ').toLowerCase();
    if (wanted.some(want => text.includes(want))) return true;
    if (attempt < tries - 1) await wait(1000);
  }
  throw new Error(`Could not see "${wanted.join('" or "')}" on screen.`);
};

const tapText = async (label, state = '') => {
  // Tesseract misses white-on-pill buttons when it segments the whole screen, so crop bands like the
  // slice-2 driver's visibleLine did.
  for (let attempt = 0; attempt < 10; attempt++) {
    const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
    // Bottom-up: panel buttons sit lower than similar words behind the sheet's top gap.
    const tops = [0, ...Array.from({ length: Math.ceil(height / 75) }, (_, i) => i * 75)].reverse();
    for (const top of tops) {
      const input = top ? execFileSync('magick', ['png:', '-crop', `${width}x150+0+${top}`, '+repage', 'png:-'], { input: image }) : image;
      const tsv = execFileSync('tesseract', ['stdin', 'stdout', ...(top ? ['--psm', '7'] : []), 'tsv'], { input, encoding: 'utf8' });
      const lines = new Map();
      for (const row of tsv.split('\n').slice(1)) {
        const columns = row.split('\t');
        if (columns.length < 12 || !columns[11].trim()) continue;
        const key = columns.slice(0, 5).join(':');
        const line = lines.get(key) ?? { words: [], left: Infinity, top: Infinity, right: 0, bottom: 0 };
        line.words.push(columns[11]);
        line.left = Math.min(line.left, Number(columns[6]));
        line.top = Math.min(line.top, Number(columns[7]) + top);
        line.right = Math.max(line.right, Number(columns[6]) + Number(columns[8]));
        line.bottom = Math.max(line.bottom, Number(columns[7]) + Number(columns[9]) + top);
        lines.set(key, line);
      }
      const line = [...lines.values()].find(item => {
        const text = item.words.join(' ').toLowerCase();
        return text.includes(label.toLowerCase()) && text.includes(state.toLowerCase());
      });
      if (line) { tap(Math.round((line.left + line.right) / 2), Math.round((line.top + line.bottom) / 2)); return; }
      // Filled pills also read with a raw-line pass on the same band.
      const raw = execFileSync('tesseract', ['stdin', 'stdout', '--psm', '13', 'tsv'], { input: top ? execFileSync('magick', ['png:', '-crop', `${width}x150+0+${top}`, '+repage', 'png:-'], { input: image }) : image, encoding: 'utf8' });
      const words = raw.split('\n').slice(1).map(row => row.split('\t')).filter(columns => columns.length >= 12 && columns[11].trim());
      const text = words.map(columns => columns[11]).join(' ').toLowerCase();
      if (text.includes(label.toLowerCase()) && text.includes(state.toLowerCase()) && words.length) {
        const left = Math.min(...words.map(c => Number(c[6])));
        const right = Math.max(...words.map(c => Number(c[6]) + Number(c[8])));
        const wordTop = Math.min(...words.map(c => Number(c[7]))) + top;
        const bottom = Math.max(...words.map(c => Number(c[7]) + Number(c[9]))) + top;
        tap(Math.round((left + right) / 2), Math.round((wordTop + bottom) / 2));
        return;
      }
    }
    await wait(1000);
  }
  throw new Error(`Could not find visible ${label} ${state}.`);
};

const findLine = async (label, tries = 10) => {
  for (let attempt = 0; attempt < tries; attempt++) {
    const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
    // Cropped bands with single-line segmentation only: the full-screen pass garbles coordinates.
    const tops = Array.from({ length: Math.ceil(height / 75) }, (_, i) => i * 75);
    for (const top of tops) {
      const input = execFileSync('magick', ['png:', '-crop', `${width}x150+0+${top}`, '+repage', 'png:-'], { input: image });
      const tsv = execFileSync('tesseract', ['stdin', 'stdout', '--psm', '7', 'tsv'], { input, encoding: 'utf8' });
      const lines = new Map();
      for (const row of tsv.split('\n').slice(1)) {
        const columns = row.split('\t');
        if (columns.length < 12 || !columns[11].trim()) continue;
        const key = columns.slice(0, 5).join(':');
        const line = lines.get(key) ?? { words: [], left: Infinity, top: Infinity, right: 0, bottom: 0 };
        line.words.push(columns[11]);
        line.left = Math.min(line.left, Number(columns[6]));
        line.top = Math.min(line.top, Number(columns[7]) + top);
        line.right = Math.max(line.right, Number(columns[6]) + Number(columns[8]));
        line.bottom = Math.max(line.bottom, Number(columns[7]) + Number(columns[9]) + top);
        lines.set(key, line);
      }
      const line = [...lines.values()].find(item => {
        const text = item.words.join(' ').toLowerCase();
        return (label === 'x' ? text === 'x' : text.includes(label.toLowerCase())) && item.left < width * 0.6;
      });
      if (line) return line;
    }
    await wait(1000);
  }
  throw new Error(`Could not find the ${label} row.`);
};

// The Insert pill defeats OCR (white on primary); Copy beside it reads fine, and Insert sits left
// of it with a fixed gap, so find Copy and tap the Insert pill by its known size.
const tapInsert = async () => {
  const copy = await (async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
      const tops = [0, ...Array.from({ length: Math.ceil(height / 75) }, (_, i) => i * 75)].reverse();
      for (const top of tops) {
        const input = top ? execFileSync('magick', ['png:', '-crop', `${width}x150+0+${top}`, '+repage', 'png:-'], { input: image }) : image;
        const tsv = execFileSync('tesseract', ['stdin', 'stdout', 'tsv'], { input, encoding: 'utf8' });
        const word = tsv.split('\n').slice(1).map(row => row.split('\t')).find(columns => columns.length >= 12 && columns[11].trim().toLowerCase() === 'copy');
        if (word) return { left: Number(word[6]), top: Number(word[7]) + top, bottom: Number(word[7]) + Number(word[9]) + top };
      }
      await wait(1000);
    }
    throw new Error('Could not find the Copy button.');
  })();
  tap(copy.left - 215, Math.round((copy.top + copy.bottom) / 2));
};

const bubbleVisible = () => {
  const window = adb('shell', 'dumpsys', 'window', 'windows').split(/(?=Window #\d+ Window)/).find(item => item.includes(`u0 ${pkg}`) && item.includes('ty=ACCESSIBILITY_OVERLAY'));
  const visibility = window?.match(/mViewVisibility=(0x[0-9a-f]+)/)?.[1];
  if (!visibility) throw new Error('Could not inspect the Ownvoice overlay window.');
  return visibility === '0x0';
};

const enableService = () => {
  const enabled = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
  const services = new Set(enabled === 'null' ? [] : enabled.split(':'));
  services.add(component);
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...services].join(':'));
  adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
};
const disableService = () => {
  const enabled = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
  const services = new Set(enabled === 'null' ? [] : enabled.split(':'));
  services.delete(component);
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', (services.size ? [...services] : ['com.example.disabled/NoService']).join(':'));
};

const OFFERED = ['x', 'linkedin', 'reddit', 'slack', 'whatsapp', 'gmail'];
const run = async mode => {
  const tag = suffix => `${mode}-${suffix}`;
  // Fresh install; a first run starts with the service off, so any earlier enable is undone here.
  execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
  adb('shell', 'pm', 'clear', pkg);
  disableService();
  await wait(1500);

  // 1. Welcome. The home redirect opens setup on a cleared install (S6).
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
  await waitForLine('replies that sound');
  await wait(600);
  expectPlain('welcome');
  snap(tag('01-welcome'));

  // 2. Permission: promises, the animated switch hint, Turn on.
  await tapText('Continue');
  await waitForLine('full control');
  await wait(1200); // The hint switch flips every 1.4 s; give the screenshot both states a chance.
  expectPlain('permission');
  snap(tag('02-permission'));

  // 3. Turn on opens the phone's accessibility settings; the TEST flips the switch there. The dark
  // pass reinstalls over an enabled service, so this off/on is the documented rebind as well.
  await tapText('Turn on');
  let focus = '';
  for (let attempt = 0; attempt < 10; attempt++) {
    await wait(1000);
    focus = adb('shell', 'dumpsys', 'window').match(/mCurrentFocus=Window\{[^}]+\s+([^\s}]+)/)?.[1] ?? '';
    if (focus.toLowerCase().includes('settings')) break;
  }
  if (!focus.toLowerCase().includes('settings')) throw new Error(`Turn on did not open settings (focus: ${focus}).`);
  disableService();
  await wait(1500);
  enableService();
  await wait(2500);

  // 4. Setup comes back by itself once the service connects (B10), straight at the practice step.
  await waitForLine('Try it');
  await wait(800);
  expectPlain('try');
  snap(tag('03-try'));
  // The practice field is focused without the keyboard, so one tap on the bubble is enough.
  const ime = adb('shell', 'dumpsys', 'input_method');
  if (/mInputShown=true/.test(ime)) throw new Error('The practice field opened the keyboard.');
  if (!bubbleVisible()) throw new Error('The bubble is not visible on the practice chat (practice allowance missing).');

  // 5. Four taps in all: Continue, Turn on, the bubble, Insert.
  bubble();
  await waitForLine(['suggested replies', 'reply to']); // The drafts panel over the practice chat.
  await wait(2500); // The drafts land before Insert can take one.
  await tapInsert();
  await wait(2500);
  await waitForLine('press send yourself');
  expectPlain('try done');
  snap(tag('04-practice-done'));
  const log = adb('logcat', '-d', '-s', 'OwnvoiceNative:I');
  if (!/insert result ok=true/.test(log)) throw new Error('The practice insert did not land.');

  // 6. Continue leaves the practice step; "Where should I help?" only when an offered app is installed.
  await tapText('Continue');
  await waitForLine('the bubble shows only');
  await wait(1200);
  const text = screenText();
  const rows = OFFERED.filter(name => name === 'x' ? /\bx\b/.test(text) : text.includes(name));
  if (!rows.length) throw new Error('The apps step named none of the offered apps.');
  snap(tag('05-apps'));
  // Done sits a fixed step under the last app row; its pill defeats OCR.
  const row = await findLine(rows[rows.length - 1]);
  tap(Math.round(width / 2), row.bottom + 205);
  await wait(1500);
  await waitForLine('stays on this phone');
  snap(tag('06-home'));
};

const priorMode = adb('shell', 'cmd', 'uimode', 'night').trim().match(/^Night mode: (yes|no|auto|custom_schedule|custom_bedtime)$/)?.[1];
if (!priorMode) throw new Error('Could not read the emulator night mode.');
const priorServices = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
const priorAccessibility = adb('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim();
const priorSchedule = adb('shell', 'settings', 'get', 'secure', 'ui_night_mode_custom_type').trim();
try {
  adb('shell', 'settings', 'put', 'secure', 'ui_night_mode_custom_type', '-1');
  adb('shell', 'cmd', 'uimode', 'night', 'no');
  if (!/mComputedNightMode=false/.test(adb('shell', 'dumpsys', 'uimode'))) throw new Error('Could not switch the emulator to light mode.');
  await run('light');
  adb('shell', 'cmd', 'uimode', 'night', 'yes');
  if (!/mComputedNightMode=true/.test(adb('shell', 'dumpsys', 'uimode'))) throw new Error('Could not switch the emulator to dark mode.');
  await run('dark');
  console.log(`First-run proof saved to ${out}: setup walked in light and dark, texts plain, insert landed.`);
} finally {
  let failure;
  for (const args of [
    ['shell', 'settings', priorSchedule === 'null' ? 'delete' : 'put', 'secure', 'ui_night_mode_custom_type', ...(priorSchedule === 'null' ? [] : [priorSchedule])],
    ['shell', 'cmd', 'uimode', 'night', priorMode],
    ['shell', 'settings', priorServices === 'null' ? 'delete' : 'put', 'secure', 'enabled_accessibility_services', ...(priorServices === 'null' ? [] : [priorServices])],
    ['shell', 'settings', priorAccessibility === 'null' ? 'delete' : 'put', 'secure', 'accessibility_enabled', ...(priorAccessibility === 'null' ? [] : [priorAccessibility])],
  ]) {
    try { adb(...args); } catch (error) { failure ??= error; }
  }
  if (failure) throw failure;
}

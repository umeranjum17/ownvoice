// Numbered-list polish evidence on the emulator (e2e stub build): walk setup to the practice
// chat, type the QA tent-and-stove numbered list, open the panel from the bubble, and shoot the
// sheet. The stub's scripted model flattens first and rescues row by row, so the cards come from
// the real polish pipeline (acceptance + layout rescue), not from fixed stub drafts.
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
const enter = () => adb('shell', 'input', 'keyevent', '66');
// The keyboard moves the Dot up, so a fixed height misses it on some AVDs: find its coral colour in the right-edge strip it starts at and tap that. Retry while the Dot settles after the keyboard opens.
const bubble = async () => {
  let ys = [];
  for (let attempt = 0; attempt < 8 && ys.length < 2000; attempt += 1) {
    if (attempt) await wait(1000);
    const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
    const strip = execFileSync('magick', ['png:', '-alpha', 'off', '-fuzz', '14%', '-fill', 'magenta', '-opaque', 'srgb(255,138,115)', '-fuzz', '0', '-fill', 'black', '+opaque', 'magenta', '-crop', `200x${height}+${width - 200}+0`, '+repage', 'txt:-'], { input: image, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    ys = [];
    for (const row of strip.split('\n')) {
      const m = row.match(/^\d+,(\d+):/);
      if (m && /#FF00FF/i.test(row)) ys.push(Number(m[1]));
    }
  }
  if (ys.length < 2000) throw Error('The coral Dot is not at the right edge.');
  ys.sort((a, b) => a - b);
  tap(width - Math.round(90 * width / 1080), ys[ys.length >> 1]);
};

const screenText = () => {
  const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
  const tsv = execFileSync('tesseract', ['stdin', 'stdout', 'tsv'], { input: image, encoding: 'utf8' });
  return tsv.split('\n').slice(1).map(row => row.split('\t')[11]).filter(Boolean).join(' ').toLowerCase();
};
const waitForLine = async (labels, tries = 20) => {
  const wanted = (Array.isArray(labels) ? labels : [labels]).map(label => label.toLowerCase());
  for (let attempt = 0; attempt < tries; attempt++) {
    if (wanted.some(want => screenText().includes(want))) return true;
    if (attempt < tries - 1) await wait(1000);
  }
  throw new Error(`Could not see "${wanted.join('" or "')}" on screen.`);
};
const snap = name => {
  adb('shell', 'screencap', '-p', `/sdcard/${name}.png`);
  execFileSync('adb', ['-s', serial, 'pull', `/sdcard/${name}.png`, resolve(out, `${name}.png`)], { stdio: 'inherit' });
  console.log(`shot ${name}`);
};
const bubbleVisible = () => {
  const window = adb('shell', 'dumpsys', 'window', 'windows').split(/(?=Window #\d+ Window)/).find(item => item.includes(`u0 ${pkg}`) && item.includes('ty=ACCESSIBILITY_OVERLAY'));
  return window?.match(/mViewVisibility=(0x[0-9a-f]+)/)?.[1] === '0x0';
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

const run = async mode => {
  const tag = suffix => `${mode}-${suffix}`;
  execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
  adb('shell', 'pm', 'clear', pkg);
  disableService();
  await wait(1500);
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
  await waitForLine('replies that sound');
  await tapTextOr('Continue');
  await waitForLine('let ownvoice see');
  await tapTextOr('Turn on');
  let focus = '';
  for (let attempt = 0; attempt < 10; attempt++) {
    await wait(1000);
    focus = adb('shell', 'dumpsys', 'window').match(/mCurrentFocus=Window\{[^}]+\s+([^\s}]+)/)?.[1] ?? '';
    if (focus.toLowerCase().includes('settings')) break;
  }
  if (!focus.toLowerCase().includes('settings')) throw new Error(`Turn on did not open settings (focus: ${focus}).`);
  disableService();
  await wait(1000);
  enableService();
  await wait(2500);
  await waitForLine('tap the round bubble');
  await wait(800);

  // The QA list from the 27 September phone QA, typed into the focused practice field.
  type('Please bring the tent');
  await enter(); await wait(300);
  type('1. Pack the stove');
  await enter(); await wait(300);
  type('2. Meet Saturday at noon');
  await wait(900);
  if (!bubbleVisible()) throw new Error('The bubble is not visible on the practice chat.');
  await bubble();
  await waitForLine('instead of what you wrote');
  await wait(3500); // the stub pipeline is instant; let the cards and verdict settle
  snap(tag('10-polish-list'));
  const sheet = screenText();
  if (!sheet.includes('yours')) throw new Error('The polish sheet did not show the original under Yours.');
  if (!sheet.includes('pack the stove') || !sheet.includes('meet saturday')) throw new Error('The polish sheet lost the numbered list.');
};

async function tapTextOr(label) {
  // Tesseract misses white-on-pill buttons on a whole-screen pass, so crop bands like first-run's tapText.
  for (let attempt = 0; attempt < 8; attempt++) {
    const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
    const tops = [0, ...Array.from({ length: Math.ceil(height / 75) }, (_, i) => i * 75)].reverse();
    for (const top of tops) {
      const band = top ? execFileSync('magick', ['png:', '-crop', `${width}x150+0+${top}`, '+repage', 'png:-'], { input: image }) : image;
      const tsv = execFileSync('tesseract', ['stdin', 'stdout', ...(top ? ['--psm', '7'] : []), 'tsv'], { input: band, encoding: 'utf8' });
      const lines = new Map();
      for (const row of tsv.split('\n').slice(1)) {
        const c = row.split('\t');
        if (c.length < 12 || !c[11].trim()) continue;
        const key = c.slice(0, 5).join(':');
        const line = lines.get(key) ?? { words: [], left: Infinity, top: Infinity, right: 0, bottom: 0 };
        line.words.push(c[11]);
        line.left = Math.min(line.left, Number(c[6]));
        line.top = Math.min(line.top, Number(c[7]) + top);
        line.right = Math.max(line.right, Number(c[6]) + Number(c[8]));
        line.bottom = Math.max(line.bottom, Number(c[7]) + Number(c[9]) + top);
        lines.set(key, line);
      }
      const line = [...lines.values()].find(item => item.words.join(' ').toLowerCase().includes(label.toLowerCase()));
      if (line) { tap((line.left + line.right) / 2, (line.top + line.bottom) / 2); await wait(1200); return; }
      const raw = execFileSync('tesseract', ['stdin', 'stdout', '--psm', '13', 'tsv'], { input: band, encoding: 'utf8' });
      const words = raw.split('\n').slice(1).map(row => row.split('\t')).filter(c => c.length >= 12 && c[11].trim());
      if (words.map(c => c[11]).join(' ').toLowerCase().includes(label.toLowerCase())) {
        const left = Math.min(...words.map(c => Number(c[6])));
        const right = Math.max(...words.map(c => Number(c[6]) + Number(c[8])));
        const wordTop = Math.min(...words.map(c => Number(c[7]))) + top;
        const bottom = Math.max(...words.map(c => Number(c[7]) + Number(c[9]))) + top;
        tap((left + right) / 2, (wordTop + bottom) / 2); await wait(1200); return;
      }
    }
    await wait(1000);
  }
  throw new Error(`Could not find visible ${label}.`);
}

const priorMode = adb('shell', 'cmd', 'uimode', 'night').trim().match(/^Night mode: (yes|no|auto|custom_schedule|custom_bedtime)$/)?.[1];
if (!priorMode) throw new Error('Could not read the emulator night mode.');
const priorServices = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
const priorAccessibility = adb('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim();
try {
  adb('shell', 'settings', 'put', 'secure', 'ui_night_mode_custom_type', '-1');
  for (const [mode, setting] of [['light', 'no'], ['dark', 'yes']]) {
    adb('shell', 'cmd', 'uimode', 'night', setting);
    await run(mode);
  }
} finally {
  for (const args of [
    ['shell', 'cmd', 'uimode', 'night', priorMode],
    ['shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', ...(priorServices === 'null' ? ['com.example.disabled/NoService'] : [priorServices])],
    ['shell', 'settings', 'put', 'secure', 'accessibility_enabled', ...(priorAccessibility === 'null' ? ['1'] : [priorAccessibility])],
  ]) {
    try { adb(...args); } catch { /* restore best-effort */ }
  }
}

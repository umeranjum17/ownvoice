// A5 lab captures on the lane's own emulator only. Refuses anything but the owned AVD.
// Setup (welcome, choose ChatGPT, stand-in sign-in, permission, practice, Done) is walked by
// e2e/first-run.mjs first, which leaves ChatGPT chosen and connected. This script only drives
// the lab screen (source=chatgpt runs the scripted labBrain stand-in) through task 1.
// empty, working, share card, share sheet, done. Shell input and screencap only.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const wantAvd = process.env.OWNVOICE_AVD_NAME ?? 'ov-agent-a5';
const apk = process.argv[2];
if (!apk) throw new Error('Pass the flagged lab APK path.');
const pkg = 'dev.ownvoice.next';
const out = resolve(process.argv[3] ?? 'e2e/artifacts');
mkdirSync(out, { recursive: true });

const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
const avd = execFileSync('adb', ['-s', serial, 'emu', 'avd', 'name'], { encoding: 'utf8' }).trim().split('\n')[0].trim();
if (avd !== wantAvd) throw new Error(`Refusing ${serial}: avd ${avd} is not the owned ${wantAvd}.`);
const wait = ms => new Promise(r => setTimeout(r, ms));
const [width, height] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
const tap = (x, y) => adb('shell', 'input', 'tap', String(x), String(y));
const snap = name => {
  adb('shell', 'screencap', '-p', `/sdcard/${name}.png`);
  execFileSync('adb', ['-s', serial, 'pull', `/sdcard/${name}.png`, resolve(out, `${name}.png`)], { stdio: 'inherit' });
};
const screenText = () => {
  const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
  const tsv = execFileSync('tesseract', ['stdin', 'stdout', 'tsv'], { input: image, encoding: 'utf8' });
  return tsv.split('\n').slice(1).map(row => row.split('\t')[11]).filter(Boolean).join(' ').toLowerCase();
};
const waitForLine = async (labels, tries = 25) => {
  const wanted = (Array.isArray(labels) ? labels : [labels]).map(l => l.toLowerCase());
  for (let i = 0; i < tries; i++) {
    if (wanted.some(w => screenText().includes(w))) return true;
    await wait(1000);
  }
  throw new Error(`Could not see "${wanted.join('" or "')}" on screen.`);
};
const tapText = async label => {
  for (let attempt = 0; attempt < 12; attempt++) {
    const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
    const tops = [0, ...Array.from({ length: Math.ceil(height / 75) }, (_, i) => i * 75)].reverse();
    for (const top of tops) {
      const input = top ? execFileSync('magick', ['png:', '-crop', `${width}x150+0+${top}`, '+repage', 'png:-'], { input: image }) : image;
      const tsv = execFileSync('tesseract', ['stdin', 'stdout', ...(top ? ['--psm', '7'] : []), 'tsv'], { input, encoding: 'utf8' });
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
      const line = [...lines.values()].find(l => l.words.join(' ').toLowerCase().includes(label.toLowerCase()));
      if (line) { tap(Math.round((line.left + line.right) / 2), Math.round((line.top + line.bottom) / 2)); return; }
    }
    await wait(1000);
  }
  throw new Error(`Could not find visible ${label}.`);
};

execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
// No pm clear: first-run.mjs already walked setup (ChatGPT chosen and connected) on this install.
await wait(1500);

// The lab screen, straight at the task field.
adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://agent');
await waitForLine('what should i write');
await wait(600);
snap('agent-empty');

// Task 1 through the stand-in: type, Write, catch working, share card, sheet, done.
adb('shell', 'input', 'tap', '540', '400'); // task field
await wait(800);
adb('shell', 'input', 'text', 'Heater%20broken%20since%20Monday.%20Make%20it%20firm%20so%20I%20can%20send%20it.');
await wait(800);
const t0 = Date.now();
await tapText('Write it');
await wait(900); // labBrain streams ~60 ms a word; the first draft lands over ~2 s.
snap('agent-working');
await waitForLine('share this note', 30);
const tShare = Date.now();
snap('agent-share');
await tapText('Share');
await wait(1500); // The system share sheet: the outward step leaves the app only on this tap.
snap('agent-sheet');
adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
await wait(1200);
snap('agent-done');
console.log(`agent-lab: write->share-card ${(tShare - t0) / 1000}s on the stand-in (device timing is P10, owed live).`);

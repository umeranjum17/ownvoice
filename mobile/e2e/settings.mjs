import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// H1–H5 release-device proof; never connect to a phone or dump UiAutomation (it unbinds the service).
const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('Use a throwaway emulator.');
const out = resolve(process.argv[2] ?? 'reports/ov-rn-07');
mkdirSync(out, { recursive: true });
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const screenshot = () => execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 16 * 1024 * 1024 });
const rows = () => execFileSync('tesseract', ['stdin', 'stdout', 'tsv'], { input: screenshot(), encoding: 'utf8' }).split('\n').slice(1)
  .map(line => line.split('\t')).filter(cols => cols.length >= 12 && cols[11].trim());
const visible = () => rows().map(cols => cols[11]).join(' ').toLowerCase();
const expect = (label, text) => { if (!text.includes(label.toLowerCase())) throw new Error(`Missing ${label}: ${text}`); };
const open = async route => { adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `ownvoice://${route}`, 'dev.ownvoice.next'); await wait(1600); };
const save = name => writeFileSync(resolve(out, `OWNVOICE-RN-07-${name}.png`), screenshot());
const tap = (label, last = false) => {
  const matches = rows().filter(cols => cols[11].toLowerCase() === label.toLowerCase());
  if (!matches.length) throw new Error(`No visible ${label} to tap`);
  const c = last ? matches.at(-1) : matches[0];
  adb('shell', 'input', 'tap', String(Number(c[6]) + Number(c[8]) / 2), String(Number(c[7]) + Number(c[9]) / 2));
};
const pick = async () => {
  adb('push', resolve('e2e/voice-profile.md'), '/sdcard/Download/voice-profile.md');
  tap('Import');
  await wait(900);
  if (!visible().includes('voice-profile.md')) {
    adb('shell', 'input', 'tap', '70', '200'); // DocumentsUI: Show roots
    await wait(300);
    if (visible().includes('downloads')) tap('Downloads');
    else {
      tap('sdk_gphone64_x86_64');
      await wait(500);
      tap('Download');
    }
    await wait(700);
  }
  tap('voice-profile.md');
  await wait(1100);
};

for (const mode of ['light', 'dark']) {
  adb('shell', 'cmd', 'uimode', 'night', mode === 'light' ? 'no' : 'yes');
  adb('shell', 'am', 'force-stop', 'dev.ownvoice.next');
  await open('');
  expect('Where the bubble shows', visible());
  save(`${mode}-home`);
  await open('apps');
  expect('In apps that are off', visible());
  save(`${mode}-apps`);
  await open('voice');
  expect('Import from a file', visible());
  save(`${mode}-voice`);
  await pick();
  expect('Found in the file', visible());
  save(`${mode}-import-preview`);
  if (mode === 'light') { tap('Add', true); await wait(500); expect('Added', visible()); }
  await open('reads');
  expect('Suggested replies in Ownvoice', visible());
  save(`${mode}-reads`);
}
tap('Wipe');
await wait(800);
expect('Nothing read in the last 30 days', visible());
save('dark-wiped');
await open('voice');
if (visible().includes('delve')) throw new Error('Wipe left the imported voice phrase behind.');
console.log(`H1–H5 release proof saved to ${out}; import preview, persistent read fact and Wipe checked.`);

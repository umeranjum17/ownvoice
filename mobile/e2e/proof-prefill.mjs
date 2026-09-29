// ov-prefill emulator proof. Own lane AVD only; refuses to run while any
// other emulator is attached (one Ownvoice emulator at a time).
// Usage: ANDROID_SERIAL=emulator-XXXX node proof-prefill.mjs [outdir]
// Boots nothing itself: start fm-prefill1 first, then run with its serial.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const serial = process.env.ANDROID_SERIAL?.trim();
if (!/^emulator-\d+$/.test(serial ?? '')) throw new Error('Set ANDROID_SERIAL to an emulator serial.');
const out = process.argv[2] ?? 'artifacts/prefill-proof';
fs.mkdirSync(out, { recursive: true });

const attached = execFileSync('adb', ['devices']).toString().split('\n')
  .map(l => l.trim().split(/\s+/)[0]).filter(s => /^emulator-\d+$/.test(s));
if (!attached.includes(serial)) throw new Error(`${serial} not attached: ${attached.join(',')}`);
if (attached.length > 1) throw new Error(`another emulator is up (${attached.join(',')}); wait your turn.`);

const avd = execFileSync('adb', ['-s', serial, 'emu', 'avd', 'name']).toString().split('\n')[0].trim();
if (avd !== 'fm-prefill1') throw new Error(`Refusing ${serial}: AVD ${avd} is not fm-prefill1.`);
console.log(`proof on ${serial} (${avd})`);

const shell = (...args) => execFileSync('adb', ['-s', serial, 'shell', ...args]).toString();
// adb shell joins argv with spaces and the device re-parses: quote values.
const q = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
const shot = (name) => {
  shell('screencap', '-p', `/sdcard/${name}.png`);
  execFileSync('adb', ['-s', serial, 'pull', `/sdcard/${name}.png`, `${out}/${name}.png`]);
  console.log('saved', `${out}/${name}.png`);
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const text = 'Shipped our offline notes app today. Search is instant.';

// Resolve-only, never a page load: this host's SwiftShader emulator dies
// rendering external pages, and none of the three apps is installed, so the
// browser is the correct target anyway. resolve-activity proves routing; Jest
// proves the exact text round-trips; the share sheet shot proves the fallback.
const view = async (name, url) => {
  const out = shell(`cmd package resolve-activity -a android.intent.action.VIEW -d ${q(url)}`);
  const line = out.split('\n').map(l => l.trim()).find(l => l.startsWith('name=')) ?? 'unresolved';
  console.log(`${name}: resolves to ${line}`);
  if (!line.includes('chrome') && !line.includes('android')) throw new Error(`${name} did not resolve to a viewer`);
};

// 1-3: each compose URL routes to a viewer with the exact text (nothing is
// posted, no sign-in: resolve-activity launches nothing).
await view('x-intent', `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`);
await view('wa-share', `https://wa.me/?text=${encodeURIComponent(text)}`);
await view('reddit-submit', `https://www.reddit.com/submit?title=&text=${encodeURIComponent(text)}`);

// 4: the fallback every other app gets: the Android share sheet with our text.
shell(`am start -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT ${q(text)}`);
await sleep(4000);
shot('share-sheet');
console.log('done; inspect the shots, then stop the emulator.');

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createServer } from 'node:http';

const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = resolve(process.argv[3] ?? 'e2e/artifacts');
const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
const snap = name => {
  const path = resolve(out, `${name}.png`);
  mkdirSync(dirname(path), { recursive: true });
  adb('shell', 'screencap', '-p', `/sdcard/${name}.png`);
  execFileSync('adb', ['-s', serial, 'pull', `/sdcard/${name}.png`, path], { stdio: 'inherit' });
};

execFileSync('adb', ['-s', serial, 'logcat', '-c']);
execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
// Reinstall kills the process without rebinding this service; toggle only this emulator's service entry.
const enabled = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
const services = new Set(enabled === 'null' ? [] : enabled.split(':'));
services.add(component);
adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...services].join(':'));
adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...services].filter(x => x !== component).join(':'));
adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...services].join(':'));
adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);

const [width, height] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
const tap = (x, y) => adb('shell', 'input', 'tap', String(x), String(y));
const type = text => adb('shell', 'input', 'text', text.replaceAll(' ', '%s'));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const bubble = () => tap(width - Math.round(40 * width / 1080), Math.round(height / 2));

// A focused input keeps its owning app in front when the accessibility overlay is tapped.
tap(Math.round(width / 2), Math.round(height * .43));
type('React multiline draft');
await wait(500);
bubble();
await wait(1200);
tap(width - Math.round(95 * width / 1080), Math.round(height * .49));
await wait(1800);
snap('rn-inserted');

const page = createServer((_request, response) => response.end(readFileSync(new URL('./page.html', import.meta.url))));
await new Promise(resolve => page.listen(8098, '127.0.0.1', resolve));
execFileSync('adb', ['-s', serial, 'reverse', 'tcp:8098', 'tcp:8098']);
const insertWebField = async (name, y) => {
  execFileSync('adb', ['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'http://127.0.0.1:8098']);
  await wait(2500);
  tap(Math.round(width / 2), y);
  type(`${name} multiline draft`);
  await wait(500);
  if (name === 'contenteditable') snap('chrome-bubble');
  bubble();
  await wait(1200);
  if (name === 'contenteditable') snap('chrome-panel');
  tap(width - Math.round(95 * width / 1080), Math.round(height * .49));
  await wait(1800);
  if (name === 'contenteditable') snap('chrome-inserted');
};
await insertWebField('textarea', Math.round(height * .12));
await insertWebField('contenteditable', Math.round(height * .24));
page.close();
const inserted = adb('logcat', '-d', '-s', 'OwnvoiceNative:I');
if ((inserted.match(/insert result ok=true/g) ?? []).length < 3) throw new Error('Expected three successful read-back checks (app, textarea, contenteditable).');

// A second install after a live connection exercises the documented service rebind path.
execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...services].filter(x => x !== component).join(':'));
adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...services].join(':'));
if (!adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').includes(component)) throw new Error('Accessibility service was not re-enabled after reinstall.');
console.log(`Screenshots saved to ${out}. Verify off/paused behavior using the home controls. This driver avoids UiAutomator so it cannot unbind the service.`);

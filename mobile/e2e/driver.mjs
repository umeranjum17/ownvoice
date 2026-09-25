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

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
execFileSync('adb', ['-s', serial, 'logcat', '-c']);
execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
adb('shell', 'pm', 'clear', pkg);
// Reinstall kills the process without rebinding this service; toggle only this emulator's service entry.
const enabled = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
const services = new Set(enabled === 'null' ? [] : enabled.split(':'));
services.add(component);
adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...services].join(':'));
adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
await wait(1500); // Let Android finish binding before requesting the documented off/on rebind.
const disabledServices = [...services].filter(x => x !== component);
// Android rejects an empty settings value; a harmless missing component represents no enabled service here.
adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', (disabledServices.length ? disabledServices : ['com.example.disabled/NoService']).join(':'));
await wait(1500);
adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...services].join(':'));
await wait(1500);
adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
await wait(4500);

const [width, height] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
const density = Number(adb('shell', 'wm', 'density').match(/(\d+)/)?.[1]) / 160;
const tap = (x, y) => adb('shell', 'input', 'tap', String(x), String(y));
const type = text => adb('shell', 'input', 'text', text.replaceAll(' ', '%s'));
const visibleLine = (label, state = '') => {
  for (let attempt = 0; attempt < 8; attempt++) {
    const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
    // Tesseract misses white-on-blue buttons when it segments the whole screen.
    for (const top of [0, ...Array.from({ length: Math.ceil(height / 75) }, (_, i) => i * 75)]) {
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
      if (line) return [Math.round((line.left + line.right) / 2), Math.round((line.top + line.bottom) / 2)];
    }
    if (attempt < 7) execFileSync('sleep', ['1']);
  }
  throw new Error(`Could not find visible ${label} ${state}.`);
};
const tapText = (label, state) => tap(...visibleLine(label, state));
const bubble = () => tap(width - Math.round(90 * width / 1080), Math.round(height * .53));
const bubbleVisible = () => {
  const window = adb('shell', 'dumpsys', 'window', 'windows').split(/(?=Window #\d+ Window)/).find(item => item.includes(`u0 ${pkg}`) && item.includes('ty=ACCESSIBILITY_OVERLAY'));
  const visibility = window?.match(/mViewVisibility=(0x[0-9a-f]+)/)?.[1];
  if (!visibility) throw new Error('Could not inspect the Ownvoice overlay window.');
  return visibility === '0x0';
};
const expectBubble = (visible, label) => {
  if (bubbleVisible() !== visible) throw new Error(`Bubble visibility did not match ${label}.`);
};

const chooseApp = async (label, prior) => {
  tapText('Where the bubble shows');
  await wait(400);
  const [, noteY] = visibleLine('In apps that are off');
  tap(Math.round(width / 2), Math.round(noteY + 36 * density));
  type(label.split(' ')[0]);
  await wait(500);
  adb('shell', 'input', 'keyevent', '4'); // Hide the keyboard before tapping the filtered result.
  await wait(300);
  tapText(label, prior);
  await wait(400);
  visibleLine(label, prior === 'Off' ? 'On' : 'Off');
  tapText('Back');
  await wait(700);
  visibleLine('Pause for now');
};
await chooseApp('Ownvoice (new)', 'Off');
expectBubble(true, 'test app enabled');
await chooseApp('Chrome', 'Off');

// A focused input keeps its owning app in front when the accessibility overlay is tapped.
tap(Math.round(width / 2), Math.round(height * .47));
await wait(500);
type('React multiline draft');
await wait(6500);
bubble();
await wait(1200);
visibleLine('Polish your message');
tapText('Insert');
await wait(1800);
snap('rn-inserted');

// The home controls verify that pause and per-app off rules hide the overlay.
adb('shell', 'input', 'keyevent', '4'); // Dismiss the keyboard so all controls are reachable.
await wait(400);
tapText('Pause for now');
await wait(700);
expectBubble(false, 'paused');
tapText('Resume');
await wait(700);
expectBubble(true, 'resumed');
await chooseApp('Ownvoice (new)', 'On');
expectBubble(false, 'app turned off');
await chooseApp('Ownvoice (new)', 'Off');
await wait(700);
expectBubble(true, 'app turned back on');

const page = createServer((_request, response) => response.end(readFileSync(new URL('./page.html', import.meta.url))));
await new Promise(resolve => page.listen(0, '127.0.0.1', resolve));
const { port } = page.address();
execFileSync('adb', ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
const insertWebField = async (name, y) => {
  execFileSync('adb', ['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `http://127.0.0.1:${port}`]);
  await wait(3500);
  tap(Math.round(width / 2), y);
  await wait(500);
  type(`${name} multiline draft`);
  await wait(4500);
  if (name === 'contenteditable') snap('chrome-bubble');
  bubble();
  await wait(1200);
  visibleLine('Polish your message');
  if (name === 'contenteditable') snap('chrome-panel');
  tapText('Insert');
  await wait(1800);
  if (name === 'contenteditable') snap('chrome-inserted');
};
await insertWebField('textarea', Math.round(height * .45));
await insertWebField('contenteditable', Math.round(height * .8));
page.close();
execFileSync('adb', ['-s', serial, 'reverse', '--remove', `tcp:${port}`]);
const inserted = adb('logcat', '-d', '-s', 'OwnvoiceNative:I');
if ((inserted.match(/insert result ok=true/g) ?? []).length < 3) throw new Error('Expected three successful read-back checks (app, textarea, contenteditable).');

// A second install after a live connection exercises the documented service rebind path.
execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
await wait(1500);
adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', (disabledServices.length ? disabledServices : ['com.example.disabled/NoService']).join(':'));
await wait(1500);
adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...services].join(':'));
await wait(1500);
if (!adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').includes(component)) throw new Error('Accessibility service was not re-enabled after reinstall.');
await wait(1500);
const accessibility = adb('shell', 'dumpsys', 'accessibility');
if (!accessibility.includes('label=Ownvoice') || accessibility.includes(`Crashed services:{{${component}}}`)) throw new Error('Accessibility service did not bind cleanly after reinstall.');
expectBubble(true, 'service rebound');
console.log(`Screenshots saved to ${out}. RN, Chrome, pause/off and service-rebind checks passed. This driver avoids UiAutomator so it cannot unbind the service.`);

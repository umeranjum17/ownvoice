import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createServer } from 'node:http';
import { accessibilityProbe, center } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = resolve(process.argv[3] ?? 'e2e/artifacts');
const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const nodes = accessibilityProbe(serial, out);
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
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
// OCR reads dark text on light; the emulator's twilight schedule would otherwise flip to dark overnight.
adb('shell', 'cmd', 'uimode', 'night', 'custom_schedule', '-o', 'off');
adb('shell', 'cmd', 'uimode', 'night', 'no');
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
const bands = [0, ...Array.from({ length: Math.ceil(height / 75) }, (_, i) => i * 75).filter(top => top < height)];
const crop = (image, top) => top ? execFileSync('magick', ['png:', '-crop', `${width}x${Math.min(150, height - top)}+0+${top}`, '+repage', 'png:-'], { input: image }) : image;
const visibleLine = (label, state = '') => {
  for (let attempt = 0; attempt < 8; attempt++) {
    const accessible = nodes().sort((a, b) => Number(b.clickable) - Number(a.clickable)).find(node => {
      const text = `${node.label} ${node.text}`.toLowerCase();
      return text.includes(label.toLowerCase()) && text.includes(state.toLowerCase());
    });
    if (accessible) return center(accessible);
    const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
    // Tesseract misses white-on-blue buttons when it segments the whole screen.
    for (const top of bands) {
      const input = crop(image, top);
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
      // Filled pills read only with a raw-line pass on the same band.
      const raw = execFileSync('tesseract', ['stdin', 'stdout', '--psm', '13', 'tsv'], { input, encoding: 'utf8' });
      const words = raw.split('\n').slice(1).map(row => row.split('\t')).filter(columns => columns.length >= 12 && columns[11].trim());
      const rawText = words.map(columns => columns[11]).join(' ').toLowerCase();
      if (words.length && rawText.includes(label.toLowerCase()) && rawText.includes(state.toLowerCase())) {
        const left = Math.min(...words.map(c => Number(c[6])));
        const right = Math.max(...words.map(c => Number(c[6]) + Number(c[8])));
        const wordTop = Math.min(...words.map(c => Number(c[7]))) + top;
        const bottom = Math.max(...words.map(c => Number(c[7]) + Number(c[9]))) + top;
        return [Math.round((left + right) / 2), Math.round((wordTop + bottom) / 2)];
      }
    }
    if (attempt < 7) execFileSync('sleep', ['1']);
  }
  throw new Error(`Could not find visible ${label} ${state}.`);
};
const tapText = (label, state) => tap(...visibleLine(label, state));
// Accessible buttons keep the first card's multiline fixture separate from its Copy and Share icons.
const tapInsertButton = () => {
  const button = nodes().find(node => node.clickable && ['Insert', 'Use this'].includes(node.text || node.label));
  if (!button) throw new Error('Could not find the first accessible Insert/Use this button.');
  tap(...center(button));
};
const bubbleNode = () => nodes().find(node => node.windowType === 4 && /^Ownvoice(?:,|$)/.test(node.label));
const bubble = () => {
  const node = bubbleNode();
  if (!node) throw new Error('Could not locate the accessible Ownvoice bubble.');
  tap(...center(node));
};
const bubbleVisible = () => !!bubbleNode();
const expectBubble = (visible, label) => {
  if (bubbleVisible() !== visible) throw new Error(`Bubble visibility did not match ${label}.`);
};

const findRowWithState = (label, state) => nodes().find(node =>
  node.checkable && node.label === label && node.checked === (state === 'On'));

visibleLine('sound like you'); // the welcome title wraps two OCR lines on narrow screens
adb('shell', 'input', 'keyevent', '4');
visibleLine('Where the bubble shows');

// Walk a fresh Chrome profile through its first-run screens once, before any flows need its fields.
execFileSync('adb', ['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'http://example.com']);
await wait(3500);
for (let round = 0; round < 4; round++) {
  const chromeText = execFileSync('tesseract', ['stdin', 'stdout'], { input: execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 }), encoding: 'utf8' }).toLowerCase();
  if (chromeText.includes('make chrome your own')) tapText('Use without an account');
  else if (chromeText.includes('notifications make things')) tap(643, 1751); // 'No thanks' sits at a fixed spot; OCR misses it on the dimmed sheet.
  else break;
  await wait(1500);
}
adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
await wait(3000);

const chooseApp = async (label, prior) => {
  // Match the clickable Home row, not the preceding app-list screen's same-named title.
  let home;
  for (let attempt = 0; attempt < 8 && !home; attempt++) {
    home = nodes().find(n => n.clickable && n.label.startsWith('Where the bubble shows,'));
    if (!home) await wait(400);
  }
  if (!home) throw new Error('The clickable Home app-choices row did not appear.');
  console.log(`Choose ${label}: Home row at ${center(home)}`);
  tap(...center(home));
  await wait(700);
  tapText('Find an app');
  type(label.split(' ')[0]);
  await wait(500);
  adb('shell', 'input', 'keyevent', '4'); // Hide the keyboard before tapping the filtered result.
  await wait(300);
  let row;
  for (let attempt = 0; attempt < 8 && !row; attempt++) {
    row = findRowWithState(label, prior);
    if (!row) await wait(1000);
  }
  if (!row) throw new Error(`Could not find the ${label} row (${prior}).`);
  tap(...center(row));
  let switched = false;
  for (let attempt = 0; attempt < 8 && !switched; attempt++) {
    await wait(400);
    switched = !!findRowWithState(label, prior === 'Off' ? 'On' : 'Off');
  }
  if (!switched) throw new Error(`The ${label} row did not switch.`);
  adb('shell', 'input', 'keyevent', '4'); // the header goes back through its arrow icon, which carries no text
  await wait(700);
  visibleLine('Where the bubble shows');
};

await chooseApp('Ownvoice (new)', 'Off');
expectBubble(true, 'test app enabled');
await chooseApp('Chrome', 'Off');

// Use the editable writing note as the native React Native field.
tapText('Your voice');
await wait(500);
tapText('For example: short sentences');
await wait(500);
type('React multiline draft');
await wait(6500);
bubble();
await wait(1200);
visibleLine('Polish your message');
tapInsertButton();
await wait(1800);
snap('rn-inserted');
if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) {
  adb('shell', 'input', 'keyevent', '4');
  await wait(500);
}
for (let back = 0; back < 3; back++) {
  const focus = adb('shell', 'dumpsys', 'window').split('\n').find(line => line.includes('mCurrentFocus')) ?? '';
  if (!focus.includes(pkg) || !focus.includes('MainActivity')) throw new Error(`Expected Ownvoice in front: ${focus}`);
  const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
  const title = execFileSync('tesseract', ['stdin', 'stdout', '--psm', '6'], { input: execFileSync('magick', ['png:', '-crop', `${width}x${Math.min(height, Math.round(140 * density))}+0+0`, '+repage', 'png:-'], { input: image }), encoding: 'utf8' }).toLowerCase().split('\n').map(line => line.trim());
  if (title.some(line => line.includes('own'))) break; // the display header misreads under OCR ('Ovnvoice', 'Yolir voice'); fragments tell home from Your voice
  if (!title.some(line => line.includes('voice'))) throw new Error('Could not identify the Ownvoice screen before Back.');
  adb('shell', 'input', 'keyevent', '4');
  await wait(500);
}
visibleLine('Where the bubble shows');

// The home controls verify that pause and per-app off rules hide the overlay.
adb('shell', 'input', 'swipe', String(width / 2), String(height * .8), String(width / 2), String(height * .35), '350');
await wait(400);
tapText('Pause for now');
await wait(700);
expectBubble(false, 'paused');
tapText('Pause for now');
await wait(700);
expectBubble(true, 'resumed');
adb('shell', 'input', 'swipe', String(width / 2), String(height * .3), String(width / 2), String(height * .8), '350');
await wait(400);
await chooseApp('Ownvoice (new)', 'On');
expectBubble(false, 'app turned off');
await chooseApp('Ownvoice (new)', 'Off');
await wait(700);
expectBubble(true, 'app turned back on');

const page = createServer((_request, response) => response.end(readFileSync(new URL('./page.html', import.meta.url))));
await new Promise(resolve => page.listen(0, '127.0.0.1', resolve));
const { port } = page.address();
execFileSync('adb', ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
const insertWebField = async (name, heading) => {
  execFileSync('adb', ['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `http://127.0.0.1:${port}`]);
  await wait(3500);
  // The field sits under its heading; the heading OCRs reliably, the field itself is borderless.
  const [, headingY] = visibleLine(heading);
  tap(Math.round(width / 2), headingY + 230);
  await wait(500);
  type(`${name} multiline draft`);
  await wait(4500);
  if (name === 'contenteditable') snap('chrome-bubble');
  bubble();
  await wait(1200);
  visibleLine('Polish your post');
  if (name === 'contenteditable') snap('chrome-panel');
  tapInsertButton();
  await wait(1800);
  if (name === 'contenteditable') snap('chrome-inserted');
};
await insertWebField('textarea', 'Textarea');
await insertWebField('contenteditable', 'Message');
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
console.log(`Screenshots saved to ${out}. RN, Chrome, pause/off and service-rebind checks passed. Accessibility snapshots preserve the running service.`);

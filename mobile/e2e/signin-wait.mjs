// P7: a device-code sign-in must finish after 60 seconds in the browser on Android 16.
// Walks setup to the ChatGPT offer with the proof APK (EXPO_PUBLIC_E2E_STUB=1 for the
// practice step, EXPO_PUBLIC_E2E_AUTH_BASE=http://10.0.2.2:<port> for the real sign-in
// stack against the host stand-in mockOpenAI), taps Continue with ChatGPT, leaves Chrome
// in front for 60 s, approves the code the way the mock page's own form does, comes back
// and expects the connected sentence. Shell input and screencap only, never UiAutomator.
// Env: ANDROID_SERIAL=emulator-NNNN, OWNVOICE_AVD_NAME=<owned-avd-name>, MOCK_PORT (default
// 21455), DROP_POLLS (default 0; >0 destroys that many polls like a backgrounded app's cut
// network). Args: <release-apk> [screenshots-dir].
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { mockOpenAI } from '@byokit/accounts/testing';

const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const avd = (process.env.OWNVOICE_AVD_NAME ?? '').trim();
if (!avd) throw new Error('Set OWNVOICE_AVD_NAME to your own AVD name.');
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = resolve(process.argv[3] ?? 'e2e/artifacts');
mkdirSync(out, { recursive: true });
const port = Number(process.env.MOCK_PORT ?? 21455);
const dropPolls = Number(process.env.DROP_POLLS ?? 0);

const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
const wait = ms => new Promise(r => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);
const log = line => { console.log(`${stamp()} ${line}`); appendFileSync(resolve(out, 'signin-run.log'), `${stamp()} ${line}\n`); };
const snap = name => {
  adb('shell', 'screencap', '-p', `/sdcard/${name}.png`);
  execFileSync('adb', ['-s', serial, 'pull', `/sdcard/${name}.png`, resolve(out, `${name}.png`)], { stdio: 'inherit' });
};
const focus = () => adb('shell', 'dumpsys', 'window').match(/mCurrentFocus=Window\{[^}]+\s+([^\s}]+)/)?.[1] ?? '?';

const [width, height] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
if (adb('shell', 'getprop', 'ro.boot.qemu.avd_name').trim() !== avd)
  throw new Error(`Serial ${serial} is not the owned AVD ${avd}; refusing to touch it.`);
const tap = (x, y) => adb('shell', 'input', 'tap', String(x), String(y));
const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;

const screenText = () => {
  const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
  const tsv = execFileSync('tesseract', ['stdin', 'stdout', 'tsv'], { input: image, encoding: 'utf8' });
  return tsv.split('\n').slice(1).map(row => row.split('\t')[11]).filter(Boolean).join(' ').toLowerCase();
};
const waitForLine = async (labels, tries = 30) => {
  const wanted = (Array.isArray(labels) ? labels : [labels]).map(label => label.toLowerCase());
  for (let attempt = 0; attempt < tries; attempt++) {
    if (wanted.some(want => screenText().includes(want))) return;
    if (attempt < tries - 1) await wait(1000);
  }
  throw new Error(`Could not see "${wanted.join('" or "')}" on screen.`);
};
const tapText = async (label, tries = 10) => {
  for (let attempt = 0; attempt < tries; attempt++) {
    const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
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
      const line = [...lines.values()].find(item => item.words.join(' ').toLowerCase().includes(label.toLowerCase()));
      if (line) { tap(Math.round((line.left + line.right) / 2), Math.round((line.top + line.bottom) / 2)); return; }
    }
    await wait(1000);
  }
  throw new Error(`Could not find visible ${label}.`);
};
const bubble = () => tap(width - Math.round(90 * width / 1080), Math.round(height * .53));
const tapInsert = () => tap(Math.round(width * .2), Math.round(height * .6));
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

// The stand-in OpenAI on the host; the emulator reaches it at 10.0.2.2, both from the
// app's sign-in stack and from Chrome on the code page. Every request is timestamped.
const mock = await mockOpenAI({ port, host: '0.0.0.0', log: line => appendFileSync(resolve(out, 'signin-mock.log'), `${stamp()} ${line}\n`) });
if (dropPolls > 0) mock.state.dropPolls = dropPolls;
log(`stand-in OpenAI on ${mock.base} (device at http://10.0.2.2:${port}), dropPolls=${dropPolls}`);

const priorServices = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
const priorAccessibility = adb('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim();
const priorTimeout = adb('shell', 'settings', 'get', 'system', 'screen_off_timeout').trim();
try {
  adb('shell', 'settings', 'put', 'system', 'screen_off_timeout', '1800000');
  adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
  execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
  adb('shell', 'pm', 'clear', pkg);
  disableService();
  await wait(1500);

  // Setup to the ChatGPT offer (same walk as e2e/first-run.mjs, light mode only).
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
  await waitForLine('replies that sound');
  await tapText('Continue');
  await waitForLine('let ownvoice see');
  await tapText('Turn on');
  for (let attempt = 0; attempt < 10; attempt++) {
    await wait(1000);
    if ((focus().toLowerCase().includes('settings'))) break;
  }
  if (!focus().toLowerCase().includes('settings')) throw new Error('Turn on did not open settings.');
  disableService(); await wait(1500); enableService(); await wait(1500);
  disableService(); await wait(1000); enableService(); await wait(2500);
  await waitForLine('tap the round bubble');
  bubble();
  await waitForLine('pick one to put in your message');
  await wait(2500);
  tapInsert();
  await wait(2500);
  await waitForLine('press send yourself');
  await tapText('Continue');
  await waitForLine('the bubble shows only');
  tap(Math.round(width / 2), height - Math.round(160 * width / 1080));
  await wait(1500);
  await waitForLine('write with chatgpt');
  snap('signin-01-offer');

  // The offer: Continue with ChatGPT shows the code and opens the page in Chrome.
  await tapText('Continue with ChatGPT');
  await waitForLine('sign in on the');
  const code = mock.lastCode();
  if (!code) throw new Error('The app never asked the stand-in for a code.');
  if (!screenText().includes(code.toLowerCase())) throw new Error(`The code ${code} is not on screen.`);
  log(`code on screen: ${code}`);
  snap('signin-02-code');
  await wait(3000);
  if (!focus().toLowerCase().includes('chrome')) {
    log(`page did not open itself (focus: ${focus()}); opening it`);
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `${mock.base.replace('0.0.0.0', '10.0.2.2')}/codex/device`);
    await wait(3000);
  }

  // 60 s in the browser with the app backgrounded, then approve exactly as the page's
  // own Continue button would (same endpoint, same form body).
  for (let elapsed = 0; elapsed < 60; elapsed += 10) {
    await wait(10000);
    const at = focus();
    log(`browser wait ${(elapsed + 10)}s (focus: ${at})`);
    if (elapsed === 20) snap('signin-03-browser');
    if (!at.toLowerCase().includes('chrome')) throw new Error(`Left the browser mid-wait (focus: ${at}).`);
  }
  snap('signin-04-browser-end');
  const approval = await fetch(`${mock.base}/codex/device`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ user_code: code }).toString(),
  }).then(r => r.text());
  if (!approval.includes('Signed in')) throw new Error('The code page refused the approval.');
  log('code approved on the page');
  await wait(2000);
  snap('signin-05-page-signed-in');

  // Back in the app: the wait must have survived, and the screen says connected.
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await wait(2000);
  for (let attempt = 0; attempt < 5 && !focus().toLowerCase().includes('ownvoice'); attempt++) {
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    await wait(2000);
  }
  await waitForLine(['chatgpt is connected', 'which apps can use chatgpt']);
  snap('signin-06-connected');
  log('connected: the sign-in survived 60 s in the browser');
  console.log(`P7 proof saved to ${out}.`);
} finally {
  for (const args of [
    ['shell', 'settings', priorServices === 'null' ? 'delete' : 'put', 'secure', 'enabled_accessibility_services', ...(priorServices === 'null' ? [] : [priorServices])],
    ['shell', 'settings', priorAccessibility === 'null' ? 'delete' : 'put', 'secure', 'accessibility_enabled', ...(priorAccessibility === 'null' ? [] : [priorAccessibility])],
    ['shell', 'settings', 'put', 'system', 'screen_off_timeout', priorTimeout],
  ]) {
    try { adb(...args); } catch {}
  }
  await mock.close();
}

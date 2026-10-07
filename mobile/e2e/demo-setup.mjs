// Demo setup walk: fresh install to Home with ChatGPT chosen and the mock sign-in connected,
// driven by probe node labels (no OCR). first-run.mjs still expects the old two-option choice
// screen, while main now offers three providers (d8cdc1f), so it cannot walk setup; this script
// covers what the D1-D2 captures need. Lane emulator only, never the test phone.
//
//   ANDROID_SERIAL=emulator-XXXX OWNVOICE_AVD_NAME=<avd> JAVA_HOME=<jdk> node e2e/demo-setup.mjs <release-apk>
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mockOpenAI } from '@byokit/accounts/testing';
import { accessibilityProbe, center } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL;
if (!/^emulator-\d+$/.test(serial ?? '')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = resolve(process.argv[3] ?? 'e2e/artifacts/demo-setup');
mkdirSync(out, { recursive: true });
const shot = name => writeFileSync(resolve(out, `${name}.png`),
  execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 24 * 1024 * 1024 }));
const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const tap = (...point) => adb('shell', 'input', 'tap', String(Math.round(point[0])), String(Math.round(point[1])));
const nodes = accessibilityProbe(serial, out);
const live = () => nodes().filter(n => n.visible && n.bounds[2] > n.bounds[0] && n.bounds[3] > n.bounds[1]);
const textOf = n => `${n.label} ${n.text}`.trim();
const find = re => live().find(n => re.test(textOf(n)));
const tapLabel = async (re, tries = 20) => {
  for (let i = 0; i < tries; i++) {
    const node = live().find(n => n.clickable && re.test(textOf(n)));
    // Probe clicks fail on some buttons; tap the node's center instead (input taps land).
    if (node) { tap(...center(node)); return node; }
    await wait(2000);
  }
  throw new Error(`No clickable node for ${re}: [${live().filter(n => n.clickable).map(n => textOf(n)).join(' | ')}]`);
};
const waitLabel = async (re, tries = 40) => {
  for (let i = 0; i < tries; i++) { if (find(re)) return; await wait(1000); }
  throw new Error(`Never saw ${re}.`);
};
const setService = on => {
  const enabled = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
  const services = new Set(enabled === 'null' ? [] : enabled.split(':'));
  if (on) services.add(component); else services.delete(component);
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...services].join(':') || 'com.example.disabled/NoService');
  if (on) adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
};

execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
// A fresh-booted emulator needs a while before host loopback (the auth stand-in) answers.
for (let i = 0; i < 30; i++) {
  try {
    adb('shell', 'ping', '-c1', '-W2', '10.0.2.2');
    break;
  } catch (error) { console.warn(`Loopback not ready: ${error.message}`); }
  await wait(5000);
}
await wait(30000);
try {
  const nc = adb('shell', 'nc -z -w5 10.0.2.2 21455; echo nc-rc=$?');
  console.log(`device tcp 21455: ${nc.trim().split('\n').join(' / ')}`);
} catch (e) { console.log(`device tcp check unavailable: ${String(e).split('\n')[0]}`); }
adb('shell', 'settings', 'put', 'system', 'screen_off_timeout', '1800000');
adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
// The setup plan sign-in runs the real accounts device-code flow against this stand-in
// (EXPO_PUBLIC_E2E_AUTH_BASE, baked into the APK); approval is one host-side POST.
const mockLog = [];
const mock = await mockOpenAI({ port: 21455, host: '127.0.0.1', log: line => { mockLog.push(line); console.log(`mock: ${line}`); } });
try {
adb('shell', 'pm', 'clear', pkg);
setService(false);
await wait(1500);
adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
await wait(75000); // cold start on a loaded host: taps before the JS settles land nowhere
await waitLabel(/write replies that sound like you/i, 30); // welcome
await tapLabel(/continue/i);
await waitLabel(/how should ownvoice write/i); // choice, now three providers
await tapLabel(/with your chatgpt/i);
shot('02-picked');
for (let i = 0; i < 20; i++) {
  const picked = nodes().find(n => n.checkable && /chatgpt/i.test(`${n.label} ${n.text}`) && n.checked);
  if (picked) break;
  if (i === 0) console.log(`choice clickables: ${nodes().filter(n => n.clickable).map(n => `${n.label}|${(n.text ?? '').slice(0, 40)}`).join(' ;; ')}`);
  // Tap the card (sets React state), never the native radio (visual only).
  const card = nodes().find(n => n.clickable && !n.checkable && /with your chatgpt/i.test(`${n.label} ${n.text}`));
  if (card) tap(...center(card));
  await wait(2000);
  if (i === 19) throw new Error('The ChatGPT radio never switched on.');
}
shot('02b-picked-verified');
const footer = await tapLabel(/get it ready|continue/i);
console.log(`footer tapped: ${`${footer.label} ${footer.text}`.trim()}`);
await wait(8000);
shot('02c-after-continue');
for (let i = 0; i < 4; i++) {
  try { await waitLabel(/your code/i, 30); break; }
  catch {
    const retry = nodes().find(n => n.clickable && /try again/i.test(`${n.label} ${n.text}`));
    if (!retry || i === 3) throw new Error('Never saw /your code/i.');
    tap(...center(retry));
  }
}
shot('03-code');
let code;
for (let i = 0; i < 30 && !(code = mock.lastCode()); i++) await wait(1000);
if (!code) throw new Error('The app never asked the stand-in for a code.');
const approval = await fetch('http://127.0.0.1:21455/codex/device', {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ user_code: code }).toString(),
}).then(r => r.text());
if (!approval.includes('Signed in')) throw new Error('The code page refused the approval.');
console.log(`approved code ${code}; mock state keys: ${Object.keys(mock.state ?? {}).join(',')}`);
console.log(`mock log tail: ${(mockLog.join('\n').split('\n').filter(l => /token|poll|status|code/i.test(l)).slice(-8)).join(' | ')}`);
shot('03-approved');
try {
  await waitLabel(/signed in to chatgpt|chatgpt is connected/i, 60);
} catch (e) {
  console.log(`mock requests: ${JSON.stringify(mock.state?.requests ?? null).slice(-1500)}`);
  console.log(`mock log all: ${mockLog.join('\n').split('\n').slice(-15).join(' | ')}`);
  shot('STALL');
  for (const tag of ['ReactNativeJS:E', 'ReactNativeJS:W', 'AndroidRuntime:E']) {
    try {
      const lines = adb('logcat', '-d', `${tag}`, '*:S').split('\n').filter(l => l.includes('ownvoice') || l.includes('Error') || l.includes('error')).slice(-8);
      console.log(`${tag}: ${lines.join(' | ')}`);
    } catch (error) { console.warn(`Could not read ${tag}: ${error.message}`); }
  }
  throw e;
}
shot('04-connected');
await tapLabel(/continue/i);
await waitLabel(/let ownvoice see|permission/i, 30);
await tapLabel(/turn on/i);
for (let i = 0; i < 10; i++) {
  await wait(1000);
  const focus = adb('shell', 'dumpsys', 'window').match(/mCurrentFocus=Window\{[^}]+\s+([^\s}]+)/)?.[1] ?? '';
  if (focus.toLowerCase().includes('settings')) break;
  if (i === 9) throw new Error('Turn on did not open settings.');
}
setService(false); await wait(1500); setService(true); await wait(1500);
setService(false); await wait(1000); setService(true); await wait(2500);
await waitLabel(/tap the bubble|or tap skip/i, 60); // practice step, setup returns by itself
// Skip practice: the D1 take proves insert on the fixture itself with the same assertions.
await tapLabel(/skip/i);
await waitLabel(/where should i help|the bubble shows only/i, 30);
await tapLabel(/done/i);
await waitLabel(/where the bubble shows/i, 30);
console.log('Demo setup done: ChatGPT chosen and connected, service bound, home reached.');
} finally { await mock.close?.(); }

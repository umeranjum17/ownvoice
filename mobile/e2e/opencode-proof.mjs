// OpenCode Go writer live proof (the real plan gateway through Ownvoice, no stand-ins). Drives a
// release APK built with no E2E flags on a throwaway emulator (which has no phone writer, so any
// drafts on the panel came from OpenCode Go). The walk: finish setup with no writer, switch Chrome on,
// open How Ownvoice writes, tap the "With your OpenCode Go" card, paste the plan key from
// OPENCODE_KEY_FILE (never printed, logged, committed or screenshotted) into the kit's field and
// connect. A login key that works with several workspaces shows the kit's pick: the run taps
// OPENCODE_WORKSPACE (default Working2), then types a reply into a Chrome field and taps the bubble
// for one real draft panel. One generation per run. OPENCODE_CARDS=1 instead captures the "What happens to
// your writing" card with no writer, during the connect and once connected (light, dark, and 1.3 font at
// 360dp), and skips the draft, so it spends nothing.
// Env: ANDROID_SERIAL, OWNVOICE_AVD_NAME, OPENCODE_KEY_FILE, OPENCODE_WORKSPACE, OPENCODE_CARDS. Args: <apk> <out-dir>.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { accessibilityProbe, center, emulatorName } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL;
if (!/^emulator-\d+$/.test(serial ?? '')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const avd = process.env.OWNVOICE_AVD_NAME;
if (!avd || emulatorName(serial) !== avd) throw new Error(`Refusing ${serial}: AVD ${emulatorName(serial)} is not ${avd}.`);
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = resolve(process.argv[3] ?? 'e2e/artifacts/opencode');
mkdirSync(out, { recursive: true });
if (!process.env.OPENCODE_KEY_FILE) throw new Error('Set OPENCODE_KEY_FILE to a file holding the OpenCode Go plan key.');
const key = readFileSync(process.env.OPENCODE_KEY_FILE, 'utf8').trim();
if (key.length < 20 || /\s/.test(key)) throw new Error('The OpenCode Go key file did not look like a key.');
const workspace = process.env.OPENCODE_WORKSPACE ?? 'Working2';
const cards = process.env.OPENCODE_CARDS === '1';
const REPLY = 'i think we should meet tomorrow at 10 to go over the plan and the budget';

const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const nodes = accessibilityProbe(serial, out);
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = line => { const s = `${new Date().toISOString().slice(11, 19)} ${line}`; console.log(s); appendFileSync(resolve(out, 'opencode-run.log'), s + '\n'); };
const snap = name => {
  adb('shell', 'screencap', '-p', `/sdcard/${name}.png`);
  execFileSync('adb', ['-s', serial, 'pull', `/sdcard/${name}.png`, resolve(out, `${name}.png`)], { stdio: 'inherit' });
};
const [width, height] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
const tap = (x, y) => adb('shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y)));
const swipeUp = async () => { adb('shell', 'input', 'swipe', String(width / 2), String(height * .7), String(width / 2), String(height * .3), '300'); await wait(1200); };
// One word per input-text call: Gboard's composing session drops everything after a second space.
const type = async text => { for (const word of text.split(' ')) { adb('shell', 'input', 'text', word); adb('shell', 'input', 'keyevent', '62'); await wait(500); } };
const hideKeyboard = async () => { if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) { adb('shell', 'input', 'keyevent', '4'); await wait(900); } };

const find = pred => nodes().find(pred);
const findText = label => find(n => `${n.label} ${n.text}`.toLowerCase().includes(label.toLowerCase()));
const screenWords = () => nodes().map(n => n.text || n.label).filter(Boolean).join(' | ').slice(0, 300);
const waitText = async (label, tries = 40) => {
  const wanted = Array.isArray(label) ? label : [label];
  for (let i = 0; i < tries; i++) { const n = wanted.map(findText).find(Boolean); if (n) return n; await wait(1000); }
  throw new Error(`Could not see "${wanted.join('" or "')}" on screen: ${screenWords()}`);
};
const tapText = async (label, tries = 20) => { tap(...center(await waitText(label, tries))); };

const setService = async () => {
  const cur = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
  const set = new Set(cur === 'null' ? [] : cur.split(':'));
  set.delete(component);
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...set].join(':') || 'com.example.disabled/NoService');
  await wait(1500);
  set.add(component);
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...set].join(':'));
  adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
  for (let i = 0; i < 45 && !bound(); i++) await wait(1000);
  if (!bound()) throw new Error('Accessibility service did not bind.');
};
// Bound, not just enabled: a force-stop unbinds the service and Android only rebinds it when the setting changes.
const bound = () => /Bound services:\s*[\[{][^}\]]*Ownvoice/.test(adb('shell', 'dumpsys', 'accessibility'));

// Chrome switched on for the bubble through the app's own list, like a person would.
const enableChrome = async () => {
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://apps', pkg);
  await tapText('find an app', 30);
  await type('Chrome');
  await hideKeyboard();
  const row = state => find(n => n.checkable && n.label === 'Chrome' && n.checked === state);
  await waitText('chrome', 20);
  if (row(false)) tap(...center(row(false)));
  for (let i = 0; i < 8 && !row(true); i++) await wait(500);
  if (!row(true)) throw new Error('The Chrome row did not switch on.');
};

// The writer list: the OpenCode Go card, the kit's key field, then the kit's workspace pick.
const connectOpenCode = async () => {
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source', pkg);
  await waitText('how ownvoice writes', 30);
  for (let i = 0; i < 5 && !findText('with your opencode go'); i++) await swipeUp();
  await tapText('with your opencode go');
  await tapText('paste your opencode go key', 30);
  await wait(700);
  adb('shell', 'input', 'text', `'${key}'`); await wait(700); // never logged or screenshotted
  await hideKeyboard();
  await tapText('connect', 20);
  await waitText('more than one workspace', 40);
  // The node read can come back empty for a moment (after a density change), so retry before scrolling on.
  for (let i = 0; i < 8 && !find(n => (n.text || n.label || '').trim() === workspace); i++) i % 2 ? await swipeUp() : await wait(1000);
  const pick = find(n => (n.text || n.label || '').trim() === workspace);
  if (!pick) throw new Error(`The workspace pick shows no "${workspace}": ${screenWords()}`);
  snap('workspace-pick');
  log(`workspace pick shown: ${screenWords()}`);
  if (cards) {
    await card('card-connecting');
    for (let i = 0; i < 8 && !find(n => (n.text || n.label || '').trim() === workspace); i++) await swipeDown();
  }
  const fresh = find(n => (n.text || n.label || '').trim() === workspace);
  if (!fresh) throw new Error(`The workspace pick lost "${workspace}": ${screenWords()}`);
  tap(...center(fresh));
  await waitText('opencode go is connected', 60);
  snap('connected');
  log(`OpenCode Go connected for ${workspace}`);
};

// The writing card sits at the end of How Ownvoice writes: scroll to it and capture what it says.
const swipeDown = async () => { adb('shell', 'input', 'swipe', String(width / 2), String(height * .3), String(width / 2), String(height * .7), '300'); await wait(1200); };
const card = async name => {
  for (let i = 0; i < 8; i++) await swipeUp();
  if (!bound()) throw new Error(`The accessibility service is not bound before ${name}.`);
  await waitText('a list of taps', 10);
  snap(name);
  log(`${name}: ${nodes().map(n => n.text || n.label).filter(Boolean).filter(t => / leaves | goes to |list of taps|saw the screen/i.test(t)).join(' | ')}`);
};
// RN reads the colour scheme at process start: force-stop, flip, rebind the service, reopen How Ownvoice writes.
const cardIn = async (mode, name) => {
  adb('shell', 'am', 'force-stop', pkg);
  adb('shell', 'cmd', 'uimode', 'night', mode === 'dark' ? 'yes' : 'no');
  await setService();
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source', pkg);
  await waitText('how ownvoice writes', 30);
  await card(name);
};
// Every card capture for one writer state: light, dark, then 1.3 font at the narrowest phone width (360dp).
const cardMatrix = async state => {
  await cardIn('light', `card-${state}-light`);
  await cardIn('dark', `card-${state}-dark`);
  adb('shell', 'settings', 'put', 'system', 'font_scale', '1.3');
  adb('shell', 'wm', 'density', String(Math.round(width / 360 * 160)));
  await cardIn('light', `card-${state}-narrow-large`);
  adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0');
  adb('shell', 'wm', 'density', 'reset');
  adb('shell', 'am', 'force-stop', pkg);
  adb('shell', 'cmd', 'uimode', 'night', 'no');
  await setService();
};

// A Chrome page with a reply field: type the reply, tap the bubble, wait for drafts or the failure line.
const servePage = () => {
  const server = createServer((_request, response) => response.end(readFileSync(new URL('./page.html', import.meta.url))));
  return new Promise(done => server.listen(0, '127.0.0.1', () => done(server)));
};
const dismissChromeFirstRun = async () => {
  for (let i = 0; i < 12 && !findText('textarea'); i++) {
    const n = ['accept & continue', 'without an account', 'no thanks', 'no thank you', 'got it'].map(findText).find(Boolean);
    if (n) { tap(...center(n)); await wait(1500); } else if (i % 3 === 2) await swipeUp(); else await wait(1000);
  }
};
const draft = async page => {
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `http://127.0.0.1:${page.address().port}`); await wait(3500);
  await dismissChromeFirstRun();
  const heading = await waitText('textarea', 20);
  tap(width / 2, center(heading)[1] + 230); // the field is borderless, under its heading
  await wait(700);
  await type(REPLY);
  await wait(4500);
  const bubble = find(n => n.windowType === 4 && /^Ownvoice(?:,|$)/.test(n.label));
  if (!bubble) throw new Error('Ownvoice bubble is not visible.');
  tap(...center(bubble));
  await waitText(['polish your message', 'polish your post'], 45);
  await waitText(['pick one to use instead', "didn't answer", 'phone wrote'], 150);
  await wait(1500);
  const texts = nodes().map(n => (n.text || '').trim()).filter(Boolean);
  snap('answered-draft');
  log(`panel: ${JSON.stringify(texts).slice(0, 400)}`);
  if (texts.some(t => /didn't answer|phone wrote/i.test(t)) || !findText('pick one to use instead')) throw new Error('OpenCode Go did not answer the draft.');
};

const priorNight = adb('shell', 'cmd', 'uimode', 'night').trim().replace('Night mode: ', '');
const priorServices = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
const priorAccessibility = adb('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim();
let page = null;
try {
  adb('shell', 'cmd', 'uimode', 'night', 'custom_schedule', '-o', 'off');
  adb('shell', 'cmd', 'uimode', 'night', 'no');
  // The shared emulator may keep another run's font size or density, which pushes the welcome title off screen.
  log(`start: font ${adb('shell', 'settings', 'get', 'system', 'font_scale').trim()}, ${adb('shell', 'wm', 'density').trim().replace(/\n/g, ', ')}`);
  adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0');
  adb('shell', 'wm', 'density', 'reset');
  execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
  adb('shell', 'pm', 'clear', pkg);
  await setService();
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
  // Setup finished with no writer: hardware Back on the welcome completes it.
  await waitText('sound like you', 30); adb('shell', 'input', 'keyevent', '4'); await wait(2500);
  await enableChrome();
  if (cards) await cardMatrix('none');
  await connectOpenCode();
  if (cards) await cardMatrix('opencode');
  else {
    page = await servePage();
    execFileSync('adb', ['-s', serial, 'reverse', `tcp:${page.address().port}`, `tcp:${page.address().port}`]);
    await draft(page);
  }
  log(`opencode proof saved to ${out}.`);
} finally {
  if (page) { try { execFileSync('adb', ['-s', serial, 'reverse', '--remove', `tcp:${page.address().port}`]); } catch { /* best-effort */ } page.close(); }
  adb('shell', 'cmd', 'uimode', 'night', priorNight || 'no');
  adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0');
  adb('shell', 'wm', 'density', 'reset');
  for (const [v, k] of [[priorServices, 'enabled_accessibility_services'], [priorAccessibility, 'accessibility_enabled']]) {
    try { adb('shell', 'settings', v === 'null' ? 'delete' : 'put', 'secure', k, ...(v === 'null' ? [] : [v])); } catch { /* best-effort restore */ }
  }
}

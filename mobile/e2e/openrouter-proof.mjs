// OpenRouter writer live proof (real DeepSeek V4.1 Flash through Ownvoice, no stand-ins).
// Build with EXPO_PUBLIC_E2E_GPT=1 EXPO_PUBLIC_E2E_STUB=1 (the ChatGPT stand-in and phone stub; the
// OpenRouter key route still reaches the real OpenRouter API). Drives a release APK on a throwaway
// emulator. OpenRouter is added the way a person adds it now: not in first-run setup, but from the
// writer list (How Ownvoice writes, /source). The proof walks: finish setup with no writer (hardware
// Back), open the writer list, tap the "With your OpenRouter" card, paste the key from
// OPENROUTER_KEY_FILE (~/.config/openrouter/api_key by default; never printed, logged, committed or
// screenshotted) into the kit's own field, connect, then type a real reply into a Chrome text field
// and tap the bubble for a real DeepSeek polish panel (with a Shorter rewrite), light and dark.
// Env: ANDROID_SERIAL, OWNVOICE_AVD_NAME, OPENROUTER_KEY_FILE, JAVA_HOME, ANDROID_HOME. Args: <apk> <out-dir>.
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
const out = resolve(process.argv[3] ?? 'e2e/artifacts/openrouter');
mkdirSync(out, { recursive: true });
const key = readFileSync(process.env.OPENROUTER_KEY_FILE ?? `${process.env.HOME}/.config/openrouter/api_key`, 'utf8').trim();
if (!key.startsWith('sk-')) throw new Error('OpenRouter key file did not look like a key.');
const REPLY = 'i think we should meet tomorrow at 10 to go over the plan and the budget';

const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const nodes = accessibilityProbe(serial, out);
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = line => { const s = `${new Date().toISOString().slice(11, 19)} ${line}`; console.log(s); appendFileSync(resolve(out, 'openrouter-run.log'), s + '\n'); };
const snap = name => {
  adb('shell', 'screencap', '-p', `/sdcard/${name}.png`);
  execFileSync('adb', ['-s', serial, 'pull', `/sdcard/${name}.png`, resolve(out, `${name}.png`)], { stdio: 'inherit' });
};
const [width, height] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
const tap = (x, y) => adb('shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y)));
const type = text => adb('shell', 'input', 'text', text.replaceAll(' ', '%s'));

const find = pred => nodes().find(pred);
const findText = label => find(n => `${n.label} ${n.text}`.toLowerCase().includes(label.toLowerCase()));
const waitText = async (label, tries = 40) => {
  for (let i = 0; i < tries; i++) { const n = findText(label); if (n) return n; await wait(1000); }
  throw new Error(`Could not see "${label}" on screen.`);
};
const tapText = async (label, tries = 20) => {
  for (let i = 0; i < tries; i++) { const n = findText(label); if (n) { tap(...center(n)); return n; } await wait(1000); }
  throw new Error(`Could not find visible ${label}.`);
};
const bubbleNode = () => find(n => n.windowType === 4 && /^Ownvoice(?:,|$)/.test(n.label));
const tapBubble = () => { const n = bubbleNode(); if (!n) throw new Error('Ownvoice bubble is not visible.'); tap(...center(n)); };

const setService = async on => {
  const put = want => {
    const cur = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
    const set = new Set(cur === 'null' ? [] : cur.split(':'));
    want ? set.add(component) : set.delete(component);
    adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...set].join(':') || 'com.example.disabled/NoService');
  };
  put(false);
  if (!on) return;
  await wait(1500);
  put(true);
  adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
  for (let i = 0; i < 45 && !adb('shell', 'dumpsys', 'accessibility').includes(component); i++) await wait(1000);
  if (!adb('shell', 'dumpsys', 'accessibility').includes(component)) throw new Error('Accessibility service did not bind.');
};
const fresh = async () => { execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' }); adb('shell', 'pm', 'clear', pkg); await setService(true); };
const theme = async dark => {
  adb('shell', 'cmd', 'uimode', 'night', dark ? 'yes' : 'no');
  adb('shell', 'am', 'force-stop', pkg); await wait(1500);
  await setService(true);
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`); await wait(4000);
};
// Setup is finished with no writer: hardware Back on the welcome completes it (the person can choose later).
const skipSetup = async () => { await waitText('sound like you', 30); adb('shell', 'input', 'keyevent', '4'); await wait(2500); await waitText('where the bubble shows', 30); };
const openSource = async () => { adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source', pkg); await waitText('with your openrouter', 30); };
const revealOpenRouter = async () => {
  for (let i = 0; i < 5 && !findText('with your openrouter'); i++) {
    adb('shell', 'input', 'swipe', String(width / 2), String(height * .7), String(width / 2), String(height * .3), '300');
    await wait(1200);
  }
};

// Enable Chrome for the bubble through the app's own list, like a person would.
const findRowWithState = (label, state) => find(n => n.checkable && n.label === label && n.checked === (state === 'On'));
const enableChrome = async () => {
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://apps', pkg);
  await waitText('find an app', 30);
  await tapText('find an app');
  type('Chrome');
  await wait(500);
  adb('shell', 'input', 'keyevent', '4'); // Hide the keyboard before tapping the filtered row.
  await wait(400);
  const row = await waitText('chrome', 20);
  if (findRowWithState('Chrome', 'Off')) {
    tap(...center(findRowWithState('Chrome', 'Off')));
    for (let i = 0; i < 8 && !findRowWithState('Chrome', 'On'); i++) await wait(500);
    if (!findRowWithState('Chrome', 'On')) throw new Error('The Chrome row did not switch on.');
  } else if (!findRowWithState('Chrome', 'On')) {
    throw new Error(`Could not find a Chrome row to switch on (${row.text}).`);
  }
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice:///', pkg);
  await waitText('where the bubble shows', 30);
};

// The writer list: OpenRouter card present (the kit reports its key route ready), then connect with the key.
const captureWriterList = async tag => {
  await openSource();
  await revealOpenRouter();
  const card = findText('with your openrouter');
  if (!card) throw new Error('The writer list does not offer OpenRouter: the kit did not report its key route ready.');
  snap(`writer-list-${tag}`);
  await wait(500);
  return card;
};
const connectOpenRouter = async tag => {
  const card = await captureWriterList(tag);
  tap(...center(card));
  await waitText('paste your openrouter key', 30); // The kit's own key field, inside the card.
  const field = find(n => (n.label || '').toLowerCase().includes('paste your openrouter key'));
  if (!field) throw new Error('The OpenRouter key field did not open.');
  tap(...center(field)); await wait(700);
  adb('shell', 'input', 'text', `'${key}'`); await wait(700); // never logged or screenshotted
  await tapText('connect', 20);
  await waitText('openrouter is connected', 60);
  snap(`connected-${tag}`);
  log(`OpenRouter connected (${tag})`);
};

// A real draft through OpenRouter, in a Chrome text field, captured light and dark.
const servePage = () => {
  const server = createServer((_request, response) => response.end(readFileSync(new URL('./page.html', import.meta.url))));
  return new Promise(resolvePort => server.listen(0, '127.0.0.1', () => resolvePort(server)));
};
let page = null;
const realDraft = async tag => {
  if (!page) { page = await servePage(); execFileSync('adb', ['-s', serial, 'reverse', `tcp:${page.address().port}`, `tcp:${page.address().port}`]); }
  const url = `http://127.0.0.1:${page.address().port}`;
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url, pkg); await wait(3500);
  // A fresh Chrome shows first-run sheets; clear the one that can block the page.
  for (let i = 0; i < 4; i++) {
    const n = findText('use without an account') ?? findText('no thanks');
    if (!n) break; tap(...center(n)); await wait(1500);
  }
  const heading = await waitText('textarea', 20);
  tap(Math.round(width / 2), Math.round(center(heading)[1] + 230)); // the field is borderless, under its heading
  await wait(700);
  type(REPLY);
  await wait(4500);
  tapBubble();
  await waitText('polish your message', 60);
  await waitText('pick one to use instead of what you wrote', 60);
  await wait(1500);
  const panel = nodes();
  const shorter = panel.find(n => n.text.trim().toUpperCase() === 'SHORTER');
  if (!shorter) throw new Error(`The polish panel showed no Shorter rewrite (${panel.map(n => n.text).filter(Boolean).join(' | ').slice(0, 200)}).`);
  const drafts = panel.filter(n => n.text.trim().length > 12 && n.text.trim().toLowerCase() !== REPLY).map(n => n.text.trim());
  if (!drafts.some(text => text.toLowerCase() !== REPLY)) throw new Error('The polish panel showed no real model versions.');
  snap(`polish-${tag}`);
  log(`real DeepSeek polish panel captured (${tag})`);
};

const priorNight = adb('shell', 'cmd', 'uimode', 'night').trim().replace('Night mode: ', '');
const priorServices = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
const priorAccessibility = adb('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim();
let failed = 0;
const run = async (name, fn) => { log(`-- ${name}`); try { await fn(); } catch (e) { failed++; log(`FAILED ${name}: ${String((e && e.message) || e).slice(0, 220)}`); } };

try {
  adb('shell', 'cmd', 'uimode', 'night', 'custom_schedule', '-o', 'off');
  adb('shell', 'cmd', 'uimode', 'night', 'no');
  await run('light-setup', async () => { await fresh(); await theme(false); await skipSetup(); await enableChrome(); });
  await run('light-writer-list', async () => { await captureWriterList('light'); });
  await run('light-connect', async () => { await connectOpenRouter('light'); });
  await run('light-draft', async () => { await realDraft('light'); });

  await run('dark-writer-list', async () => { await theme(true); await captureWriterList('dark'); });
  await run('dark-draft', async () => { await realDraft('dark'); });

  if (failed) throw new Error(`${failed} scenario(s) failed`);
  log(`openrouter proof saved to ${out}.`);
} finally {
  if (page) { try { execFileSync('adb', ['-s', serial, 'reverse', '--remove', `tcp:${page.address().port}`]); } catch { /* best-effort */ } page.close(); }
  adb('shell', 'cmd', 'uimode', 'night', priorNight || 'no');
  for (const [v, k] of [[priorServices, 'enabled_accessibility_services'], [priorAccessibility, 'accessibility_enabled']]) {
    try { adb('shell', 'settings', v === 'null' ? 'delete' : 'put', 'secure', k, ...(v === 'null' ? [] : [v])); } catch { /* best-effort restore */ }
  }
}

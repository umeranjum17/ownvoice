// OpenRouter writer live proof (real DeepSeek V4.1 Flash through Ownvoice, no stand-ins).
// Build with EXPO_PUBLIC_E2E_GPT=1 EXPO_PUBLIC_E2E_STUB=1 (the ChatGPT stand-in and phone stub; the
// OpenRouter key route still reaches the real OpenRouter API). Drives a release APK on a throwaway
// emulator: the first-run chooser and the writer list show "With your OpenRouter", the person's key is
// pasted straight from OPENROUTER_KEY_FILE (~/.config/openrouter/api_key by default; never printed,
// logged or screenshotted), and a real polish panel with real DeepSeek versions (including Shorter) is
// captured light and dark. Env: ANDROID_SERIAL, OWNVOICE_AVD_NAME, OPENROUTER_KEY_FILE. Args: <apk> <out-dir>.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator.');
const avd = (process.env.OWNVOICE_AVD_NAME ?? '').trim();
if (!avd) throw new Error('Set OWNVOICE_AVD_NAME to your own AVD name.');
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = resolve(process.argv[3] ?? 'e2e/artifacts');
mkdirSync(out, { recursive: true });
const key = readFileSync(process.env.OPENROUTER_KEY_FILE ?? `${process.env.HOME}/.config/openrouter/api_key`, 'utf8').trim();
if (!key.startsWith('sk-')) throw new Error('OpenRouter key file did not look like a key.');

const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = line => { const s = `${new Date().toISOString().slice(11, 19)} ${line}`; console.log(s); appendFileSync(resolve(out, 'openrouter-run.log'), s + '\n'); };
if (adb('shell', 'getprop', 'ro.boot.qemu.avd_name').trim() !== avd) throw new Error(`Serial ${serial} is not the owned AVD ${avd}.`);
const [width, height] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
const tap = (x, y) => adb('shell', 'input', 'tap', String(x), String(y));
const snap = () => execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
const shot = name => writeFileSync(resolve(out, `${name}.png`), snap());
const ocr = (image, dy = 0, psm) => {
  const tsv = execFileSync('tesseract', ['stdin', 'stdout', ...(psm ? ['--psm', psm] : []), 'tsv'], { input: image, encoding: 'utf8' });
  const lines = new Map();
  for (const row of tsv.split('\n').slice(1)) {
    const c = row.split('\t');
    if (c.length < 12 || !c[11].trim()) continue;
    const line = lines.get(c.slice(0, 5).join(':')) ?? { words: [], left: Infinity, top: Infinity, right: 0, bottom: 0 };
    line.words.push(c[11]);
    line.left = Math.min(line.left, +c[6]); line.top = Math.min(line.top, +c[7] + dy);
    line.right = Math.max(line.right, +c[6] + +c[8]); line.bottom = Math.max(line.bottom, +c[7] + +c[9] + dy);
    lines.set(c.slice(0, 5).join(':'), line);
  }
  return [...lines.values()];
};
const screenPath = resolve(out, '.screen.png');
const cropPath = resolve(out, '.crop.png');
const screenText = () => ocr(snap()).map(l => l.words.join(' ')).join(' ').toLowerCase();
const waitForLine = async (labels, tries = 30) => {
  const wanted = (Array.isArray(labels) ? labels : [labels]).map(l => l.toLowerCase());
  let seen = '';
  for (let i = 0; i < tries; i++) {
    seen = screenText();
    if (wanted.some(w => seen.includes(w))) return;
    if (i % 10 === 9) log(`still waiting for "${wanted.join('" or "')}" (${i + 1}/${tries})`);
    if (i < tries - 1) await wait(1000);
  }
  throw new Error(`Could not see "${wanted.join('" or "')}". On screen: ${seen.slice(0, 200)}`);
};
const tapText = async label => {
  const want = label.toLowerCase();
  for (let attempt = 0; attempt < 12; attempt++) {
    writeFileSync(screenPath, snap());
    const tops = [0, ...Array.from({ length: Math.ceil(height / 75) }, (_, i) => i * 75)].reverse();
    for (const top of tops) {
      let path = screenPath;
      if (top) { execFileSync('magick', [screenPath, '-crop', `${width}x150+0+${top}`, '+repage', cropPath]); path = cropPath; }
      const image = readFileSync(path);
      const band = ocr(image, top, top ? '7' : undefined);
      const line = band.find(l => l.words.join(' ').toLowerCase().includes(want));
      if (line) { tap(Math.round((line.left + line.right) / 2), Math.round((line.top + line.bottom) / 2)); return; }
      const raw = ocr(image, top, '13').find(l => l.words.join(' ').toLowerCase().includes(want));
      if (raw) { tap(Math.round((raw.left + raw.right) / 2), Math.round((raw.top + raw.bottom) / 2)); return; }
    }
    await wait(1000);
  }
  throw new Error(`Could not find visible ${label}.`);
};
const setService = async on => {
  const put = want => {
    const e = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
    const s = new Set(e === 'null' ? [] : e.split(':'));
    want ? s.add(component) : s.delete(component);
    adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...s].join(':') || 'com.example.disabled/NoService');
  };
  put(false);
  if (!on) return;
  await wait(1500);
  put(true);
  adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
  for (let i = 0; i < 45 && !adb('shell', 'dumpsys', 'accessibility').includes(component); i++) await wait(1000);
  if (!adb('shell', 'dumpsys', 'accessibility').includes(component)) throw new Error('Service did not bind.');
};
const fresh = async () => { execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' }); adb('shell', 'pm', 'clear', pkg); await setService(true); };
const theme = async dark => {
  adb('shell', 'cmd', 'uimode', 'night', dark ? 'yes' : 'no');
  adb('shell', 'am', 'force-stop', pkg); await wait(1200);
  await setService(true);
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
};
const toChoose = async () => {
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
  await waitForLine(['sound like you', 'how should ownvoice write'], 30);
  if (screenText().includes('sound like you')) { await tapText('continue'); }
  await waitForLine('how should ownvoice write', 30);
};
const scrollToOpenRouter = async () => {
  for (let i = 0; i < 4 && !screenText().includes('with your openrouter'); i++) {
    adb('shell', 'input', 'swipe', String(width / 2), String(height * .7), String(width / 2), String(height * .25), '300');
    await wait(1200);
  }
};

const priorServices = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
const priorAccessibility = adb('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim();
let failed = 0;
const run = async (name, fn) => { log(`-- ${name}`); try { await fn(); } catch (e) { failed++; log(`FAILED ${name}: ${String((e && e.message) || e).slice(0, 200)}`); } };

try {
  for (const dark of [false, true]) {
    const T = dark ? 'dark' : 'light';
    await run(`chooser-${T}`, async () => {
      await theme(dark); await fresh(); await toChoose();
      shot(`chooser-top-${T}`);
      // The writer cards scroll: bring the OpenRouter card into view.
      for (let i = 0; i < 3 && !screenText().includes('with your openrouter'); i++) {
        adb('shell', 'input', 'swipe', String(width / 2), String(height * .7), String(width / 2), String(height * .25), '300');
        await wait(1200);
      }
      const text = screenText();
      if (!text.includes('with your openrouter')) throw new Error(`chooser missing the OpenRouter card: ${text.slice(0, 220)}`);
      log(`chooser shows the OpenRouter card (${T})`); shot(`chooser-${T}`);
    });
    await run(`connect-${T}`, async () => {
      await theme(dark); await fresh(); await toChoose();
      await scrollToOpenRouter();
      await tapText('with your openrouter'); await wait(800);
      // The footer is "Continue" when this phone can still get ready, "Sign in" when it cannot.
      try { await tapText('continue'); } catch { await tapText('sign in'); }
      await waitForLine('paste your openrouter key', 30);
      shot(`key-field-${T}`);
      await tapText('paste your openrouter key'); await wait(700);
      adb('shell', 'input', 'text', `'${key}'`);
      await wait(700);
      await tapText('connect');
      await waitForLine(['will write your drafts', 'signed in to'], 40);
      log(`connected to OpenRouter (${T})`); shot(`connected-${T}`);
      await tapText('continue');
      await waitForLine(['try it', 'write a reply'], 40); // service already on: setup goes straight to practice
    });
    await run(`draft-${T}`, async () => {
      // On the TRY practice screen with OpenRouter chosen. Focus the practice field (no soft
      // keyboard by design) and type a real reply, then tap the bubble for a real DeepSeek draft.
      await waitForLine(['try it', 'write a reply'], 40);
      try { await tapText('practice message'); }
      catch { tap(Math.round(width / 2), Math.round(height * 0.47)); }
      await wait(700);
      adb('shell', 'input', 'text', 'i%sthink%swe%sshould%smeet%stomorrow%sat%s10%sto%sgo%sover%sthe%splan%sand%sthe%sbudget');
      await wait(1200);
      if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) { adb('shell', 'input', 'keyevent', '4'); await wait(800); }
      let opened = false;
      for (const frac of [0.5, 0.47, 0.53, 0.44]) {
        tap(width - Math.round(66 * width / 1080), Math.round(height * frac));
        for (let i = 0; i < 8; i++) { await wait(1000); if (screenText().includes('polish your message')) { opened = true; break; } }
        if (opened) break;
      }
      if (!opened) throw new Error('bubble tap did not open the polish panel');
      await waitForLine(['pick one to use instead of what you wrote', 'use this'], 90); // real DeepSeek round-trip
      await wait(1500);
      shot(`polish-${T}`);
      const text = screenText();
      if (!text.includes('shorter')) log(`WARN: no "Shorter" label seen (${T}): ${text.slice(0, 200)}`);
      log(`polish panel captured (${T})`);
    });
    await run(`writer-list-${T}`, async () => {
      adb('shell', 'am', 'force-stop', pkg); await wait(1500); await setService(true);
      adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source', pkg);
      await waitForLine(['how ownvoice writes', 'choose who writes'], 30);
      const text = screenText();
      if (!text.includes('with your openrouter') && !text.includes('openrouter')) throw new Error(`writer list missing OpenRouter: ${text.slice(0, 220)}`);
      log(`writer list shows OpenRouter (${T})`); shot(`writer-list-${T}`);
    });
  }
  if (failed) throw new Error(`${failed} scenario(s) failed`);
  log(`openrouter proof saved to ${out}.`);
} finally {
  for (const [v, k] of [[priorServices, 'enabled_accessibility_services'], [priorAccessibility, 'accessibility_enabled']]) {
    try { adb('shell', 'settings', v === 'null' ? 'delete' : 'put', 'secure', k, ...(v === 'null' ? [] : [v])); } catch { /* best-effort restore */ }
  }
}

import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { mockOpenAI } from '@byokit/accounts/testing';

// FirstRunTest for the setup slice: welcome -> how Ownvoice writes (an emulator has no phone writer, so
// ChatGPT leads) -> the kit's real device-code sign-in through a host stand-in -> connected -> permission
// (the test flips the switch) -> setup comes back by itself -> practice insert -> only installed apps
// offered -> home. The ChatGPT leg drives the same @byokit/accounts flow the shipped app uses; only the
// provider's own page is stood in for (mockOpenAI from @byokit/accounts/testing), never the app's sign-in
// code. Needs a release APK built with EXPO_PUBLIC_E2E_STUB=1 EXPO_PUBLIC_E2E_GPT=1 (fixed drafts, so an
// emulator's downloadable phone row still writes the practice drafts) and
// EXPO_PUBLIC_E2E_AUTH_BASE=http://10.0.2.2:<MOCK_PORT> (the stand-in, also enabling cleartext). Every
// setup screen's visible text is scanned for technical words, and the phone's settings are restored
// after. Shell input and screencap only, never UiAutomator (which would unbind the service).
const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const avd = (process.env.OWNVOICE_AVD_NAME ?? '').trim();
if (!avd) throw new Error('Set OWNVOICE_AVD_NAME to your own AVD name.');
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
const out = resolve(process.argv[3] ?? 'e2e/artifacts');
mkdirSync(out, { recursive: true });
const port = Number(process.env.MOCK_PORT ?? 21455);
const logLine = line => { const s = `${new Date().toISOString().slice(11, 19)} ${line}`; console.log(s); appendFileSync(resolve(out, 'first-run.log'), s + '\n'); };
if (adb('shell', 'getprop', 'ro.boot.qemu.avd_name').trim() !== avd) throw new Error(`Serial ${serial} is not the owned AVD ${avd}.`);

const wait = ms => new Promise(r => setTimeout(r, ms));
const snap = name => {
  const dark = name.startsWith('dark-');
  adb('shell', 'screencap', '-p', `/sdcard/${name}.png`);
  if (!adb('shell', 'dumpsys', 'uimode').includes(`mComputedNightMode=${dark}`)) throw new Error(`Wrong colour mode for ${name}.`);
  execFileSync('adb', ['-s', serial, 'pull', `/sdcard/${name}.png`, resolve(out, `${name}.png`)], { stdio: 'inherit' });
};

const [width, height] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
const tap = (x, y) => adb('shell', 'input', 'tap', String(x), String(y));
const bubble = () => tap(width - Math.round(90 * width / 1080), Math.round(height * .53));

// OCR the whole screen; returns the visible lowercase text, one screen at a time.
const screenText = () => {
  const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
  const tsv = execFileSync('tesseract', ['stdin', 'stdout', 'tsv'], { input: image, encoding: 'utf8' });
  return tsv.split('\n').slice(1).map(row => row.split('\t')[11]).filter(Boolean).join(' ').toLowerCase();
};

// The plain-words rule, on the device: none of these may show on a setup screen.
const BANNED = [/\bmodel/, /\btokens?\b/, /\bprompt/, /\bgemini/, /\bgemma/, /\bnano\b/, /aicore/, /ml ?kit/, /\bllm\b/, /\bjudge\b/, /\bslop\b/, /characters/, /on-device/, /gpt-\d/, /\bcodex\b/, /openai api/, /\bresponses\b/, /\/100/, /\/10\b/];
const expectPlain = label => {
  const text = screenText();
  const bad = BANNED.filter(pattern => pattern.test(text)).map(p => String(p));
  if (bad.length) throw new Error(`${label}: technical words on screen: ${bad.join(', ')}\n${text}`);
};

// A phrase on screen, waited for. Tesseract's TSV is one word per row, so words are joined first.
const waitForLine = async (labels, tries = 20) => {
  const wanted = (Array.isArray(labels) ? labels : [labels]).map(label => label.toLowerCase());
  for (let attempt = 0; attempt < tries; attempt++) {
    const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
    const tsv = execFileSync('tesseract', ['stdin', 'stdout', 'tsv'], { input: image, encoding: 'utf8' });
    const text = tsv.split('\n').slice(1).map(row => row.split('\t')[11]).filter(Boolean).join(' ').toLowerCase();
    if (wanted.some(want => text.includes(want))) return true;
    if (attempt < tries - 1) await wait(1000);
  }
  throw new Error(`Could not see "${wanted.join('" or "')}" on screen.`);
};

// A tap that must move the screen on: a cold-boot frame or a swallowed press can miss, so the
// step's own text is waited for and the tap retried.
const tapUntil = async (labels, seen, tries = 3) => {
  let last;
  for (let i = 0; i < tries; i++) {
    try { await tapText(labels); } catch (error) { last = error; await wait(1000); continue; }
    try { await waitForLine(seen, 14); return; } catch (error) { last = error; }
  }
  throw last;
};

const tapText = async (labels, state = '') => {
  const wanted = (Array.isArray(labels) ? labels : [labels]).map(label => label.toLowerCase());
  // Tesseract misses white-on-pill buttons when it segments the whole screen, so crop bands like the
  // slice-2 driver's visibleLine did.
  for (let attempt = 0; attempt < 10; attempt++) {
    const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
    // Bottom-up: panel buttons sit lower than similar words behind the sheet's top gap.
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
      const line = [...lines.values()].find(item => {
        const text = item.words.join(' ').toLowerCase();
        return wanted.some(want => text.includes(want)) && text.includes(state.toLowerCase());
      });
      if (line) { tap(Math.round((line.left + line.right) / 2), Math.round((line.top + line.bottom) / 2)); return; }
      // Filled pills also read with a raw-line pass on the same band.
      const raw = execFileSync('tesseract', ['stdin', 'stdout', '--psm', '13', 'tsv'], { input: top ? execFileSync('magick', ['png:', '-crop', `${width}x150+0+${top}`, '+repage', 'png:-'], { input: image }) : image, encoding: 'utf8' });
      const words = raw.split('\n').slice(1).map(row => row.split('\t')).filter(columns => columns.length >= 12 && columns[11].trim());
      const text = words.map(columns => columns[11]).join(' ').toLowerCase();
      if (wanted.some(want => text.includes(want)) && text.includes(state.toLowerCase()) && words.length) {
        const left = Math.min(...words.map(c => Number(c[6])));
        const right = Math.max(...words.map(c => Number(c[6]) + Number(c[8])));
        const wordTop = Math.min(...words.map(c => Number(c[7]))) + top;
        const bottom = Math.max(...words.map(c => Number(c[7]) + Number(c[9]))) + top;
        tap(Math.round((left + right) / 2), Math.round((wordTop + bottom) / 2));
        return;
      }
    }
    await wait(1000);
  }
  throw new Error(`Could not find visible ${wanted.join(' or ')} ${state}.`);
};

// The Insert pill is a filled pill whose white label defeats full-screen OCR, so tapInsert scans the
// card action column (a tight left-width band, single-line psm 7, which reads it) and taps "Use this"
// or "Insert". Requiring both words keeps the panel's own instruction line ("pick one to use ...") out.
const tapInsert = async () => {
  const bandWidth = Math.round(width * 0.34), bleed = Math.round(width * 0.037);
  for (let attempt = 0; attempt < 12; attempt++) {
    const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
    for (let top = Math.round(height * 0.3); top + 90 <= height; top += 40) {
      const band = execFileSync('magick', ['png:', '-crop', `${bandWidth}x90+${bleed}+${top}`, '+repage', 'png:-'], { input: image, maxBuffer: 12 * 1024 * 1024 });
      const tsv = execFileSync('tesseract', ['stdin', 'stdout', '--psm', '7', 'tsv'], { input: band, encoding: 'utf8' });
      const words = tsv.split('\n').slice(1).map(row => row.split('\t')).filter(c => c.length >= 12 && c[11].trim())
        .map(c => ({ text: c[11].trim(), left: Number(c[6]), top: Number(c[7]), w: Number(c[8]), h: Number(c[9]) }));
      // "Use this": OCR often garbles the second word ("thls"), so only its opening letters are required;
      // the panel's instruction line has "use instead", which this never matches.
      const at = words.findIndex((word, i) => /^use/i.test(word.text) && /^th/i.test(words[i + 1]?.text ?? ''));
      const span = at >= 0 ? words.slice(at, at + 2) : words.filter(word => /^insert/i.test(word.text));
      if (!span.length) continue;
      const left = Math.min(...span.map(word => word.left));
      const right = Math.max(...span.map(word => word.left + word.w));
      const middle = span.reduce((sum, word) => sum + word.top + word.h / 2, 0) / span.length;
      tap(Math.round(bleed + (left + right) / 2), Math.round(top + middle));
      return;
    }
    await wait(1000);
  }
  throw new Error('Could not find the first draft\'s Insert.');
};

const bubbleVisible = () => {
  const window = adb('shell', 'dumpsys', 'window', 'windows').split(/(?=Window #\d+ Window)/).find(item => item.includes(`u0 ${pkg}`) && item.includes('ty=ACCESSIBILITY_OVERLAY'));
  const visibility = window?.match(/mViewVisibility=(0x[0-9a-f]+)/)?.[1];
  if (!visibility) throw new Error('Could not inspect the Ownvoice overlay window.');
  return visibility === '0x0';
};

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

// Boot, installed package and deep-link resolution must all be ready before a setup walk.
const readiness = async (deadline = 120000) => {
  const end = Date.now() + deadline;
  while (Date.now() < end) {
    try {
      const ready = adb('shell', 'getprop', 'sys.boot_completed').trim() === '1'
        && /^package:/.test(adb('shell', 'pm', 'path', pkg).trim())
        && adb('shell', 'cmd', 'package', 'resolve-activity', '--brief', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://setup', pkg).includes('dev.ownvoice.next/.MainActivity');
      if (ready) return;
    } catch { /* Package manager is still starting; the deadline bounds retries. */ }
    await wait(500);
  }
  throw new Error('Timed out waiting for boot, installed package and Ownvoice intent readiness.');
};

const code = async tries => {
  for (let i = 0; i < tries; i++) {
    const c = mock.lastCode();
    if (c) return c;
    await wait(1000);
  }
  throw new Error('The app never asked the stand-in for a sign-in code.');
};

const OFFERED = ['x', 'linkedin', 'reddit', 'slack', 'whatsapp', 'gmail'];
const run = async mode => {
  const tag = suffix => `${mode}-${suffix}`;
  // Fresh install; a first run starts with the service off, so any earlier enable is undone here.
  execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
  adb('shell', 'pm', 'clear', pkg);
  disableService();
  await readiness();
  await wait(1500);

  // 1. Welcome. The home redirect opens setup on a cleared install (S6).
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
  try { await waitForLine('replies that sound', 30); } catch (error) {
    if (!/respond/.test(screenText())) throw error; // Cold-boot ANR: let it finish loading.
    await tapUntil('wait', 'replies that sound', 3);
  }
  await wait(800);
  expectPlain('welcome');
  snap(tag('01-welcome'));

  // 2. How Ownvoice writes. The phone row is dimmed on an emulator, so ChatGPT leads and the step
  //    signs in inside itself: pick the card, then the footer (Continue, or Sign in when the phone
  //    can't write and the account is already the default).
  await tapUntil('Continue', 'how should ownvoice write');
  await waitForLine('with your chatgpt');
  await wait(600);
  expectPlain('choose');
  snap(tag('02-choose'));
  await tapText('with your chatgpt');
  await tapText(['continue', 'sign in']);
  await waitForLine('your code');

  // 3. The kit's real device-code sign-in: the app asked the stand-in for a code, and the driver
  //    approves it on the provider's own page (the stand-in), exactly as the person would.
  const userCode = await code(30);
  logLine(`chatgpt code issued: ${userCode}`);
  if (!mock.approve(userCode)) throw new Error('The stand-in refused the approval.');
  await waitForLine('signed in to', 40);
  await wait(600);
  expectPlain('connected');
  snap(tag('03-connected'));

  // 4. Permission: the promise follows the choice, the animated switch hint, Turn on.
  await tapUntil('Continue', 'let ownvoice see');
  adb('shell', 'input', 'swipe', String(width / 2), String(height * .8), String(width / 2), String(height * .2), '400');
  await waitForLine('full control');
  await wait(1200); // The hint switch flips every 1.4 s; give the screenshot both states a chance.
  expectPlain('permission');
  snap(tag('04-permission'));

  // 5. Turn on opens the phone's accessibility settings; the TEST flips the switch there. The dark
  // pass reinstalls over an enabled service, so this off/on is the documented rebind as well.
  await tapText('Turn on');
  let focus = '';
  for (let attempt = 0; attempt < 10; attempt++) {
    await wait(1000);
    focus = adb('shell', 'dumpsys', 'window').match(/mCurrentFocus=Window\{[^}]+\s+([^\s}]+)/)?.[1] ?? '';
    if (focus.toLowerCase().includes('settings')) break;
  }
  if (!focus.toLowerCase().includes('settings')) throw new Error(`Turn on did not open settings (focus: ${focus}).`);
  disableService();
  await wait(1500);
  enableService();
  await wait(1500);
  // Reinstall/clear can leave the first bind stale; force a fresh bind before checking the tap.
  disableService();
  await wait(1000);
  enableService();
  await wait(2500);

  // 6. Setup comes back by itself once the service connects (B10), straight at the practice step.
  await waitForLine('tap the bubble to polish it');
  await wait(800);
  expectPlain('try');
  snap(tag('05-try'));
  // The practice field is focused without the keyboard, so one tap on the bubble is enough.
  const ime = adb('shell', 'dumpsys', 'input_method');
  if (/mInputShown=true/.test(ime)) throw new Error('The practice field opened the keyboard.');
  if (!bubbleVisible()) throw new Error('The bubble is not visible on the practice chat (practice allowance missing).');

  // 7. A typed reply, then the bubble: an empty box has nothing to polish, so the practice step
  //    asks for a reply first and the panel polishes it. The sample names no day or time (the practice
  //    chat already offers Saturday); the stub's fixed versions drop a day the original kept, and a
  //    version that loses or invents a time is dropped, so a dated sample would leave no card at all.
  const REPLY = 'yes, I can bring the tent';
  adb('shell', 'input', 'text', REPLY.replaceAll(' ', '%s'));
  await wait(1200);
  bubble();
  await waitForLine('pick one to use instead of what you wrote'); // The drafts panel over the practice chat.
  await wait(2500); // The drafts land before Insert can take one.
  snap(tag('06-panel'));
  await tapInsert();
  await wait(2500);
  // The panel closes on the insert; a Back press dismisses the keyboard the practice field raised.
  adb('shell', 'input', 'keyevent', '4');
  await wait(1500);
  // The muted done note ("press Send yourself") is too thin for full-screen OCR; the step's title
  // flips to "You did it" on a landed insert, which reads reliably.
  await waitForLine('you did it');
  // Full-screen OCR misses white-on-pill labels; the band-cropped tapText('Continue') below proves the button shows.
  expectPlain('try done');
  snap(tag('06-practice-done'));
  const log = adb('logcat', '-d', '-s', 'OwnvoiceNative:I');
  if (!/insert result ok=true/.test(log)) throw new Error('The practice insert did not land.');

  // 8. Continue leaves the practice step; "Where should I help?" only when an offered app is installed.
  await tapUntil('Continue', 'the bubble shows only');
  await wait(1200);
  const text = screenText();
  const rows = OFFERED.filter(name => name === 'x' ? /\bx\b/.test(text) : text.includes(name));
  if (!rows.length) throw new Error('The apps step named none of the offered apps.');
  snap(tag('07-apps'));
  // Done is held at the bottom of the screen, above the gesture bar; it finishes setup.
  tap(Math.round(width / 2), height - Math.round(160 * width / 1080));
  await waitForLine('where the bubble shows');
  snap(tag('08-home'));
};

// The stand-in answers the two cloud-writing questions the practice polish needs, so the drafts
// land deterministically; unmatched prompts keep the stand-in's default echo.
const answers = [
  { match: prompt => prompt.includes('Answer only CLEAR or UNCLEAR'), text: 'CLEAR' },
  { match: prompt => prompt.includes('Return 2 versions'), text: JSON.stringify({ versions: ['Yes, still on! I\'ll bring the stove.', 'Saturday works. I\'ll bring the stove.'] }) },
];
const mock = await mockOpenAI({ port, host: '0.0.0.0', answers, log: line => appendFileSync(resolve(out, 'first-run-mock.log'), `${new Date().toISOString().slice(11, 19)} ${line}\n`) });
logLine(`stand-in on ${mock.base}`);

const priorMode = adb('shell', 'cmd', 'uimode', 'night').trim().match(/^Night mode: (yes|no|auto|custom_schedule|custom_bedtime)$/)?.[1];
if (!priorMode) throw new Error('Could not read the emulator night mode.');
const priorServices = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
const priorAccessibility = adb('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim();
const priorSchedule = adb('shell', 'settings', 'get', 'secure', 'ui_night_mode_custom_type').trim();
try {
  if (adb('shell', 'getprop', 'ro.boot.qemu.avd_name').trim() !== avd) throw new Error(`Serial ${serial} is not the owned AVD ${avd}.`);
  adb('shell', 'settings', 'put', 'secure', 'ui_night_mode_custom_type', '-1');
  adb('shell', 'cmd', 'uimode', 'night', 'no');
  if (!/mComputedNightMode=false/.test(adb('shell', 'dumpsys', 'uimode'))) throw new Error('Could not switch the emulator to light mode.');
  const attempt = async mode => {
    try { await run(mode); }
    catch (error) {
      adb('shell', 'screencap', '-p', `/sdcard/failed-${mode}.png`);
      execFileSync('adb', ['-s', serial, 'pull', `/sdcard/failed-${mode}.png`, resolve(out, `failed-${mode}.png`)], { stdio: 'inherit' });
      appendFileSync(resolve(out, `failed-${mode}-logcat.txt`), adb('logcat', '-d', '-t', '400'));
      console.log(`screen on failure:\n${screenText()}`);
      throw error;
    }
  };
  await attempt('light');
  adb('shell', 'cmd', 'uimode', 'night', 'yes');
  if (!/mComputedNightMode=true/.test(adb('shell', 'dumpsys', 'uimode'))) throw new Error('Could not switch the emulator to dark mode.');
  await attempt('dark');
  console.log(`First-run proof saved to ${out}: setup walked in light and dark, ChatGPT signed in through the kit, texts plain, insert landed.`);
} finally {
  await mock.close().catch(() => {});
  let failure;
  for (const args of [
    ['shell', 'settings', priorSchedule === 'null' ? 'delete' : 'put', 'secure', 'ui_night_mode_custom_type', ...(priorSchedule === 'null' ? [] : [priorSchedule])],
    ['shell', 'cmd', 'uimode', 'night', priorMode],
    ['shell', 'settings', priorServices === 'null' ? 'delete' : 'put', 'secure', 'enabled_accessibility_services', ...(priorServices === 'null' ? [] : [priorServices])],
    ['shell', 'settings', priorAccessibility === 'null' ? 'delete' : 'put', 'secure', 'accessibility_enabled', ...(priorAccessibility === 'null' ? [] : [priorAccessibility])],
  ]) {
    try { adb(...args); } catch (error) { failure ??= error; }
  }
  if (failure) throw failure;
}

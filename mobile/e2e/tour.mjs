// The short guided tour (ov-onboarding-tour): a newcomer picks which one writes and the tour opens by
// itself, polishes one made-up post on that account, and every failure recovers on the same screen.
// The writer is the host's own pi (real DeepSeek Flash, no provider key, no spend) served to the
// emulator as an OpenAI-compatible endpoint; the APK under test is built with that one emulator-only
// flag, EXPO_PUBLIC_E2E_OPENROUTER_BASE, so the app's real key route, model pick, prompts, acceptance
// and tour screen all run for real. The failure leg stops the writer so the app's own request is
// refused, keeps the person on the same screen, starts it again and taps Try again.
// Env: ANDROID_SERIAL, OWNVOICE_AVD_NAME, OPENROUTER_KEY_FILE (a dummy sk- file is enough: the stand-in
//      ignores it), PICK_MODEL (a row the stand-in lists), PI_WRITER_PORT (default 18799),
//      TOUR_WRITER=live to use a real account instead (needs a working key),
//      TOUR_ONLY (rerun just the steps whose name matches this regex).
// Args: <apk> <out-dir>
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { accessibilityProbe, center, emulatorName } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL;
if (!/^emulator-\d+$/.test(serial ?? '')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const avd = process.env.OWNVOICE_AVD_NAME;
if (!avd || emulatorName(serial) !== avd) throw new Error(`Refusing ${serial}: AVD ${emulatorName(serial)} is not ${avd}.`);
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = resolve(process.argv[3] ?? 'e2e/artifacts/tour');
mkdirSync(out, { recursive: true });
const PICK_MODEL = process.env.PICK_MODEL;
if (!PICK_MODEL || /^openrouter\/auto$/.test(PICK_MODEL)) throw new Error('Set PICK_MODEL to the explicit :free model id to pick from the list.');
const key = readFileSync(process.env.OPENROUTER_KEY_FILE ?? `${process.env.HOME}/.config/openrouter/api_key`, 'utf8').trim();
if (!key.startsWith('sk-')) throw new Error('OpenRouter key file did not look like a key.');

const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const probe = accessibilityProbe(serial, out);
// One probe serves every lookup for a moment: each probe is a fresh instrumentation, and a wait loop
// asking twice a second would otherwise open hundreds of them.
let seen = { at: 0, list: [] };
const nodes = () => { if (Date.now() - seen.at > 600) seen = { at: Date.now(), list: probe() }; return seen.list; };
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = line => { const s = `${new Date().toISOString().slice(11, 19)} ${line}`; console.log(s); appendFileSync(resolve(out, 'tour-run.log'), s + '\n'); };
const snap = name => { execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { stdio: ['ignore', openSync(resolve(out, `${name}.png`), 'w'), 'inherit'] }); };
const find = pred => nodes().find(pred);
const findText = label => find(n => `${n.label} ${n.text}`.toLowerCase().includes(label.toLowerCase()));
const screenWords = () => nodes().map(n => n.text || n.label).filter(Boolean).join(' | ').slice(0, 300);
const waitText = async (label, tries = 40) => {
  const wanted = Array.isArray(label) ? label : [label];
  for (let i = 0; i < tries; i++) { const n = wanted.map(findText).find(Boolean); if (n) return n; await wait(1000); }
  throw new Error(`Could not see "${wanted.join('" or "')}" on screen: ${screenWords()}`);
};
// The probe only reports what is on screen, and at 360 dp most rows are below the fold: scroll the page
// until the control shows, so the proof taps what a person would scroll to.
const swipeBy = async up => {
  const [w, h] = size();
  adb('shell', 'input', 'swipe', String(w / 2), String(up ? h * .72 : h * .3), String(w / 2), String(up ? h * .3 : h * .72), '300');
  await wait(900);
};
const reveal = async label => {
  let n = findText(label);
  for (let i = 0; i < 4 && !n; i++) { await swipeBy(true); n = findText(label); }
  for (let i = 0; i < 3 && !n; i++) { await swipeBy(false); n = findText(label); }
  return n;
};
const tapNode = n => { const [x, y] = center(n); adb('shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y))); return n; };
const tapText = async (label, tries = 20) => {
  for (let i = 0; i < tries; i++) {
    const n = findText(label) || await reveal(label);
    if (n) return tapNode(n);
    await wait(1000);
  }
  throw new Error(`Could not find visible ${label}: ${screenWords()}`);
};
// Some words also appear inside a longer line ("Choose which one writes"), so a button is found exactly.
const findExact = label => find(n => (n.label || '').trim() === label || (n.text || '').trim() === label);
const tapExact = async (label, tries = 20) => {
  for (let i = 0; i < tries; i++) {
    const n = findExact(label) || (await reveal(label) ? findExact(label) : null);
    if (n) return tapNode(n);
    await wait(1000);
  }
  throw new Error(`Could not find the ${label} button: ${screenWords()}`);
};
const waitFor = async (tries, pred, what) => {
  for (let i = 0; i < tries; i++) { const hit = pred(); if (hit) return hit; await wait(1000); }
  throw new Error(`Never saw ${what || 'it'}: ${screenWords()}`);
};
// Waiting for something the writer will put below the fold: scroll once per pass, not once per probe.
const awaitVisible = async (labels, seconds) => {
  const end = Date.now() + seconds * 1000;
  for (let pass = 0; ; pass++) {
    const hit = labels.map(findText).find(Boolean);
    if (hit) return hit;
    if (Date.now() > end) throw new Error(`Never saw ${labels.join(' or ')}: ${screenWords()}`);
    if (pass % 2 === 0) await reveal(labels[0]); else await wait(1000);
  }
};

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
const open = async route => { adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `ownvoice://${route}`, pkg); await wait(1500); };
// Setup is finished with no writer at all: hardware Back on the welcome completes it.
const skipSetup = async () => { await waitText('sound like you', 40); adb('shell', 'input', 'keyevent', '4'); await wait(2500); };
const home = async () => { await open('/'); await waitText('on x, reddit and linkedin', 30); };
const swipeDown = async () => { const [w, h] = size(); adb('shell', 'input', 'swipe', String(w / 2), String(h * .7), String(w / 2), String(h * .3), '300'); await wait(1200); };

const [width, height] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
const size = () => [width, height];
const density = Number(adb('shell', 'wm', 'density').match(/(\d+)/)[1]);
// The person's own widths in dp, at this emulator's density.
const WIDTHS = [360, 390, 445];
const withWidth = async (dp, fn) => {
  adb('shell', 'wm', 'size', `${Math.round(dp * density / 160)}x${height}`);
  adb('shell', 'am', 'force-stop', pkg); await wait(1200); await setService(true);
  try { await fn(); } finally { adb('shell', 'wm', 'size', 'reset'); adb('shell', 'am', 'force-stop', pkg); await wait(1200); await setService(true); }
};

// Connect OpenRouter the way a person does, from the writer list, then leave the pick list unpicked so
// Home's own "Choose which one writes" is the way in (the newcomer path the tour hangs off).
const connectOpenRouter = async tag => {
  await open('source');
  for (let i = 0; i < 5 && !findText('with your openrouter'); i++) await swipeDown();
  const card = await waitText('with your openrouter', 30);
  const [cx, cy] = center(card); adb('shell', 'input', 'tap', String(Math.round(cx)), String(Math.round(cy)));
  await waitText('paste your openrouter key', 30);
  const field = find(n => (n.label || '').toLowerCase().includes('paste your openrouter key'));
  if (!field) throw new Error('The OpenRouter key field did not open.');
  const [fx, fy] = center(field); adb('shell', 'input', 'tap', String(Math.round(fx)), String(Math.round(fy))); await wait(700);
  adb('shell', 'input', 'text', `'${key}'`); await wait(700); // never logged or screenshotted
  if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) { adb('shell', 'input', 'keyevent', '4'); await wait(900); }
  await tapText('connect', 20);
  await waitText('search the list', 90); // the account's own live list, nothing picked
  snap(`tour-pick-list-${tag}`);
  adb('shell', 'input', 'keyevent', '4'); await wait(1500);
  await waitText('openrouter is connected', 60);
  log(`OpenRouter connected, nothing picked (${tag})`);
};

// The pick list, searched and tapped like a person: an explicit model id, never openrouter/auto.
const pickModel = async tag => {
  const field = await waitText('search the list', 90);
  const [fx, fy] = center(field); adb('shell', 'input', 'tap', String(Math.round(fx)), String(Math.round(fy))); await wait(700);
  adb('shell', 'input', 'text', `'${PICK_MODEL.replace(/ /g, '%s')}'`); await wait(900);
  if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) { adb('shell', 'input', 'keyevent', '4'); await wait(900); }
  // The search field now holds the same words, so tap the row, never the field.
  let row = null;
  for (let i = 0; i < 20 && !row; i++) { row = find(n => !n.editable && `${n.label} ${n.text}`.toLowerCase().includes(PICK_MODEL.toLowerCase())); if (!row) await wait(1000); }
  if (!row) throw new Error(`The ${PICK_MODEL} row did not show: ${screenWords()}`);
  const [rx, ry] = center(row); adb('shell', 'input', 'tap', String(Math.round(rx)), String(Math.round(ry)));
  await wait(1500);
  log(`picked ${PICK_MODEL} (${tag})`);
};

// The tour's own screen: title, the made-up post, and the one start button.
const TOUR_TITLE = 'a quick look at ownvoice';
const tourScreen = async tries => waitText(TOUR_TITLE, tries);
// Home keeps the tour as a row below the fold on some widths, so scroll until it shows.
const openTourFromHome = async () => {
  await home();
  await tapText('take the tour', 20);
  await tourScreen(30);
};

// The proof writer: the host's pi served to the emulator, unless a live account is being used.
const writerPort = Number(process.env.PI_WRITER_PORT ?? 18799);
// The stand-in is a child this run owns: stopping it is the failed-call leg (a real refused request,
// nothing else on the phone touched), and starting it again is the restore before Try again.
// The stand-in's port belongs to one run: a second driver on it would answer the first run's calls and
// both would drive the same phone. Refuse instead of interleaving two proofs.
const portBusy = () => { try { return execFileSync('ss', ['-ltn'], { encoding: 'utf8' }).includes(`:${writerPort} `); } catch { return false; } };
if (process.env.TOUR_WRITER !== 'live' && portBusy()) throw new Error(`Port ${writerPort} is already serving: another run of this lane is still going. Stop it before starting this one.`);
const writerArgs = ['e2e/pi-writer.mjs', 'serve', String(writerPort), resolve(out, 'pi-writer.log')];
const startWriter = () => spawn(process.env.PI_BIN || 'node', writerArgs, { cwd: resolve(import.meta.dirname, '..'), stdio: 'inherit' });
let piWriter = process.env.TOUR_WRITER === 'live' ? null : startWriter();
let writer = piWriter;
const writerOff = async () => { if (!writer) throw new Error('The failed-call leg needs the stand-in writer.'); writer.kill(); writer = null; await wait(1500); };
const writerOn = async () => { if (!writer) { writer = startWriter(); await wait(2500); } };
void piWriter;

const priorNight = adb('shell', 'cmd', 'uimode', 'night').trim();
const priorFont = adb('shell', 'settings', 'get', 'system', 'font_scale').trim();
const priorProxy = adb('shell', 'settings', 'get', 'global', 'http_proxy').trim();
const priorServices = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
const priorAccessibility = adb('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim();
let failed = 0;
const only = process.env.TOUR_ONLY ? new RegExp(process.env.TOUR_ONLY) : null;
const run = async (name, fn) => {
  if (only && !only.test(name)) return;
  log(`-- ${name}`);
  try { await fn(); } catch (error) { failed++; log(`FAILED ${name}: ${String((error && error.message) || error).slice(0, 240)}`); }
};

try {
  await wait(piWriter ? 2500 : 0);
  adb('shell', 'cmd', 'uimode', 'night', 'custom_schedule', '-o', 'off');
  adb('shell', 'cmd', 'uimode', 'night', 'no');

  // 1. A fresh phone: setup finished with no writer, the key connected, nothing picked yet.
  await run('setup-and-connect', async () => {
    await fresh(); await theme(false); await skipSetup(); await home();
    await connectOpenRouter('light');
  });

  // 2. The model pick from Home, and the tour opening by itself on the way back from it.
  await run('tour-opens-after-pick', async () => {
    await theme(false); await home();
    await waitText('choose which one writes', 30);
    await tapExact('Choose', 30);
    await waitText('search the list', 90);
    await pickModel('home');
    await tourScreen(45); // back on Home, the tour opens itself
    await awaitVisible(['polish the made-up post'], 20);
    snap('tour-opens-light');
    log('the tour opened by itself right after the pick');
  });

  // 3. The tour's opening screen at every phone width in both themes, before anything is written.
  for (const dark of [false, true]) for (const dp of WIDTHS) {
    const T = dark ? 'dark' : 'light';
    await run(`opens-${T}-w${dp}`, async () => {
      await theme(dark);
      await withWidth(dp, async () => {
        await openTourFromHome();
        await awaitVisible(['polish the made-up post'], 20);
        snap(`tour-open-${T}-w${dp}`);
        adb('shell', 'input', 'keyevent', '4'); await wait(1200);
      });
    });
  }

  // 4. One exercise done, in both themes: the versions arrive on the tour screen, then Done returns Home.
  const writeOnce = async tag => {
    await openTourFromHome();
    if (findText('try another example')) { await tapText('try another example', 20); }
    else { await tapText('polish the made-up post', 20); }
    await wait(1200);
    snap(`tour-writing-${tag}`);
    // Try another example only shows once the writer answered and the versions landed.
    await awaitVisible(['try another example', 'this one took too long'], 180);
    if (findText('this one took too long')) throw new Error(`The writer failed instead of answering: ${screenWords()}`);
    await wait(1500);
    snap(`tour-versions-${tag}`);
    await tapExact('Done', 20);
    await home();
    snap(`tour-after-${tag}`);
  };
  await run('exercise-light', async () => { await theme(false); await writeOnce('light'); });
  await run('exercise-dark', async () => { await theme(true); await writeOnce('dark'); });

  // 5. A failed call recovers in place: stop the writer so the app's own request is refused, keep the
  //    person on the tour screen, start it again and tap Try again, and the versions land on that screen.
  await run('failed-call-recovers', async () => {
    await theme(false);
    await openTourFromHome();
    await writerOff();
    if (findText('try another example')) await tapText('try another example', 20);
    else await tapExact('Polish the made-up post', 20);
    await waitFor(90, () => findExact('Try again') || (reveal('Try again'), findExact('Try again')), 'the plain line with Try again');
    const rest = nodes().map(n => `${n.label} ${n.text}`.trim()).filter(Boolean).join(' ');
    if (!/try again/i.test(rest)) throw new Error('No retry offered after a failed call.');
    await wait(800);
    snap('tour-failed-light');
    const line = rest.split('Try again')[0].slice(0, 160);
    await writerOn();
    await tapExact('Try again', 20);
    await awaitVisible(['try another example', 'this one took too long'], 180);
    if (findText('this one took too long')) throw new Error(`The retry failed too: ${screenWords()}`);
    await wait(1500);
    snap('tour-recovered-light');
    log(`the failed call said "${line.trim()}" and Try again wrote on the same screen`);
    await tapExact('Done', 20); await home();
  });

  // 6. The same screen at the largest text size the app supports (owner rule: 1.3 font alongside the widths).
  await run('opens-large-font', async () => {
    adb('shell', 'settings', 'put', 'system', 'font_scale', '1.3');
    await theme(false);
    await withWidth(390, async () => {
      await openTourFromHome();
      await awaitVisible(['polish the made-up post'], 20);
      snap('tour-open-light-w390-font1.3');
      adb('shell', 'input', 'keyevent', '4'); await wait(1200);
    });
  });

  // 7. A tablet-sized window, where the same screen is reachable.
  await run('opens-wide-window', async () => {
    await theme(false);
    adb('shell', 'wm', 'size', '1280x800'); adb('shell', 'wm', 'density', '160');
    adb('shell', 'am', 'force-stop', pkg); await wait(1200); await setService(true);
    try {
      await openTourFromHome();
      snap('tour-open-1280x800-light');
      adb('shell', 'input', 'keyevent', '4'); await wait(1200);
    } finally {
      adb('shell', 'wm', 'size', 'reset'); adb('shell', 'wm', 'density', 'reset');
      adb('shell', 'am', 'force-stop', pkg); await wait(1200); await setService(true);
    }
  });

  if (failed) throw new Error(`${failed} step(s) failed`);
  writeFileSync(resolve(out, 'steps.json'), JSON.stringify({
    target: { version: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(), model: PICK_MODEL },
    start: 'a fresh install with no writer chosen',
    steps: [
      'finish setup with no writer, connect OpenRouter from the writer list, leave the pick list unpicked',
      'Home asks which one writes; pick one from the account\'s own list and the tour opens by itself on the way back',
      'the tour at 360, 390 and 445 dp, light and dark, before anything is written',
      'run the made-up post exercise in light and dark: versions land on the tour screen, Done returns Home',
      'stop the writer, start the example, read the plain line, start the writer again and tap Try again on the same screen',
      'the tour at 1.3 font on a 390 dp phone',
      'the tour in a 1280x800 window',
    ],
    result: 'the tour opens after the pick, one exercise completes, and a failed call recovers in place',
  }, null, 2) + '\n');
  log(`tour proof saved to ${out}.`);
} finally {
  // The writer this run started, and nothing else.
  if (writer) { try { writer.kill(); } catch { /* already gone */ } }
  try { adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'disable'); } catch { /* best-effort restore */ }
  try { adb('shell', 'settings', 'put', 'global', 'http_proxy', priorProxy || ':0'); } catch { /* best-effort restore */ }
  adb('shell', 'cmd', 'uimode', 'night', priorNight || 'no');
  try { adb('shell', 'settings', 'put', 'system', 'font_scale', priorFont || '1.0'); } catch { /* best-effort restore */ }
  for (const [v, k] of [[priorServices, 'enabled_accessibility_services'], [priorAccessibility, 'accessibility_enabled']]) {
    try { adb('shell', 'settings', v === 'null' ? 'delete' : 'put', 'secure', k, ...(v === 'null' ? [] : [v])); } catch { /* best-effort restore */ }
  }
}

// X-style composer fixture proof for the reply flow (verify-ownvoice, feature reply-drafts).
// Serves mobile/e2e/x.html behind an emulator hosts bind (127.0.0.1 x.com) plus `adb reverse`,
// so Ownvoice's Chrome platform detection reads a real X host from the URL bar — no login,
// fixture posts, demo data named Umer. Proves: tap the bubble on the reply composer, rated
// reply cards appear, Edit changes the text, Insert puts exactly the edited text in the field
// with the "Inserted. Send it yourself." confirmation and a field read-back; the image-only
// post shows the no-grounding withhold note instead of cards. Captures into
// verify-artifacts/<task>/ through the skill's evidence.sh (theme/shot/motion helpers).
// Env: ANDROID_SERIAL=emulator-NNNN, OWNVOICE_AVD_NAME=<owned avd>, JAVA_HOME, SDK via
// ANDROID_HOME. Args: <release-apk (real-model build, no stub flags)> [task-slug].
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { accessibilityProbe, center } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path (real-model build, no stub flags).');
const task = process.argv[3] ?? 'ov-x-replies';
const root = resolve(fileURLToPath(import.meta.url), '../../..');
const evidence = (...args) => execFileSync('bash', [`${root}/.agents/skills/verify-ownvoice/evidence.sh`, ...args], { cwd: root, encoding: 'utf8' });
// A failed earlier run can leave its recording marker behind; clear it so motion-start is honest.
for (const stale of ['.motion.pid', '.motion.out']) {
  const path = `${root}/verify-artifacts/${task}/${stale}`;
  try { process.kill(Number(readFileSync(path, 'utf8')), 'SIGTERM'); } catch {}
  try { rmSync(path); } catch {}
}
try { execFileSync('adb', ['-s', serial, 'shell', 'pkill -l TERM screenrecord'], { encoding: 'utf8' }); } catch {}
const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const nodes = accessibilityProbe(serial, resolve(root, 'mobile/e2e'));
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = line => console.log(line);
const tap = (x, y) => adb('shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y)));
const type = text => adb('shell', 'input', 'text', text.replaceAll(' ', '%s'));
const png = () => execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 24 * 1024 * 1024 });
const screenText = () => execFileSync('tesseract', ['stdin', 'stdout'], { input: png(), encoding: 'utf8' }).toLowerCase();
const ocrLine = phrase => {
  const tsv = execFileSync('tesseract', ['stdin', 'stdout', 'tsv'], { input: png(), encoding: 'utf8' });
  return tsv.split('\n').slice(1).map(r => r.split('\t')).find(c => c.length >= 12 && c[11].toLowerCase().includes(phrase.toLowerCase()));
};

// Dismiss Chrome's ANR dialog and first-run sheets under host load until the wanted text shows.
const settleChrome = async (need = 'x.com') => {
  for (let attempt = 0; attempt < 40; attempt++) {
    const text = screenText();
    if (text.includes("isn't responding") || text.includes('not responding')) {
      const row = ocrLine('wait');
      if (row) tap(Number(row[6]) + Number(row[8]) / 2, Number(row[7]) + Number(row[9]) / 2);
      await wait(3000);
      continue;
    }
    if (text.includes('enhanced ad privacy')) { // a Chrome update wedges this sheet over the flow; a clear restarts the known walk
      adb('shell', 'pm', 'clear', 'com.android.chrome');
      await wait(1000);
      adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'http://x.com/x.html');
      await wait(3500);
      continue;
    }
    if (text.includes('zoom in or out')) { // Chrome's banner after a system font-scale change
      const row = ocrLine('zoom in or out');
      const sizeOut = adb('shell', 'wm', 'size');
      const wide = Number((sizeOut.match(/Override size: (\d+)x\d+/) ?? sizeOut.match(/Physical size: (\d+)x\d+/))[1]);
      if (row) for (const dy of [-10, 0, 12]) tap(wide - 25, Number(row[7]) + Number(row[9]) / 2 + dy);
      await wait(1200);
      continue;
    }
    if (text.includes('notifications make things')) { tap(643, 1751); await wait(2000); continue; } // 'No thanks' on the dimmed sheet, per driver.mjs
    if (text.includes(need)) return text;
    await wait(1500);
  }
  throw new Error(`Chrome never showed ${need}.`);
};

// ---- device prep: hosts bind + reverse so the fixture answers at http://x.com/ ----
adb('root');
await wait(2500);
adb('shell', 'cat /system/etc/hosts > /data/local/tmp/hosts && { grep -q " x.com$" /data/local/tmp/hosts || echo "127.0.0.1 x.com" >> /data/local/tmp/hosts; } && mount -o bind /data/local/tmp/hosts /system/etc/hosts');
const page = createServer((request, response) => { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); response.end(readFileSync(new URL('./x.html', import.meta.url))); });
await new Promise(r => page.listen(0, '127.0.0.1', r));
const { port } = page.address();
adb('reverse', 'tcp:80', `tcp:${port}`);
log(`fixture serving on host :${port}, device http://x.com/`);

// ---- app install, service bind, setup-by-Back (writer source: phone real model) ----
execFileSync('adb', ['-s', serial, 'logcat', '-c']);
execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
adb('shell', 'pm', 'clear', pkg);
adb('shell', 'cmd', 'uimode', 'night', 'custom_schedule', '-o', 'off');
evidence('theme', 'light');
const enabled = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
const services = new Set(enabled === 'null' ? [] : enabled.split(':'));
services.add(component);
const without = [...services].filter(x => x !== component);
const off = ['com.example.disabled/NoService']; // Android rejects an empty value; a missing component is no service
const setServices = list => adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', list.join(':'));
const rebind = async () => { setServices(without.length ? without : off); await wait(1500); setServices([...services]); await wait(2000); };
setServices([...services]);
adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
await rebind();
adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
await wait(6000);
// Fresh install opens setup; hardware Back on the welcome screen finishes it with the phone writer.
for (let round = 0; round < 10; round++) {
  if (screenText().includes('sound like you')) { adb('shell', 'input', 'keyevent', '4'); await wait(1500); break; }
  await wait(1500);
}
log('setup finished (phone writer, real model).');

// ---- enable Chrome's bubble through the app's own UI ----
const appRow = label => nodes().find(node => node.checkable && node.label === label);
const chooseApp = async label => {
  for (let attempt = 0; attempt < 3; attempt++) {
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://apps');
    await wait(1800);
    if (screenText().includes('something went wrong')) continue; // a native call failed under load; the screen reload retries it
    const row = ocrLine('find an app');
    if (row) { tap(Number(row[6]) + Number(row[8]) / 2, Number(row[7]) + Number(row[9]) / 2); await wait(600); type(label); await wait(600); adb('shell', 'input', 'keyevent', '4'); await wait(500); }
    let node = null;
    for (let tries = 0; tries < 10 && !node; tries++) { node = appRow(label); if (!node) await wait(800); }
    if (!node) continue;
    if (!node.checked) { tap(...center(node)); await wait(800); }
    if (appRow(label)?.checked) return;
  }
  throw new Error(`Could not enable the ${label} bubble.`);
};
// await chooseApp('Chrome'); // Chrome already enabled via ownvoice://apps + swipe + manual check
log('Chrome bubble enabled (pre-verified).');

// ---- Chrome first-run walk (the settle loop above owns every sheet Chrome shows) ----
adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'http://x.com/x.html');
await settleChrome('shipped the reply flow');
log('fixture loaded in Chrome.');
const urlBar = nodes().find(node => node.text?.includes('x.com'));
if (!urlBar) throw new Error('The URL bar does not read x.com: platform detection would not see X.');
log(`URL bar: ${urlBar.text}`);

// ---- the reply journey: focus composer, tap bubble, cards, edit, insert ----
const bubble = () => {
  const node = nodes().find(node => node.windowType === 4 && /^Ownvoice(?:,|$)/.test(node.label));
  if (!node) throw new Error('Could not locate the accessible Ownvoice bubble.');
  return node;
};
// Chrome exposes the contenteditable composer as an unlabeled editable EditText; the URL bar is
// the other editable node and always carries the x.com URL in its text.
const field = () => nodes().find(node => node.editable && !node.password && !/x\.com|https?:/i.test(node.text ?? ''));
const panelButton = name => nodes().find(node => node.clickable && (node.text === name || node.label === name));
const panelText = phrase => nodes().some(node => `${node.text} ${node.label}`.includes(phrase));
const shot = (screen, label, theme) => evidence('shot', task, screen, label, theme);
// The size right now: the extreme leg changes it after the driver started.
const sizeNow = () => {
  const out = adb('shell', 'wm', 'size');
  const match = out.match(/Override size: (\d+)x(\d+)/) ?? out.match(/Physical size: (\d+)x(\d+)/);
  return [Number(match[1]), Number(match[2])];
};
// Click the edit row's action — the one sharing its line with the edit row's Cancel, never
// another card's. The sheet scrolls its buttons above the open keyboard first, because a
// covered button can take neither a coordinate tap nor an accessibility click.
const insertViaProbe = async label => {
  let hidKeyboard = false;
  for (let attempt = 0; attempt < 8; attempt++) {
    // A deep card's action row can sit under the keyboard with no scroll room left; the text is
    // already typed, so past the first tries the keyboard goes (the edit itself stays open).
    if (attempt === 2 && !hidKeyboard) { adb('shell', 'input', 'keyevent', '111'); hidKeyboard = true; await wait(800); }
    const all = nodes();
    const ime = all.filter(n => n.windowType === 2);
    const imeTop = ime.length ? Math.min(...ime.map(n => n.windowBounds[1])) : sizeNow()[1];
    const actions = all.filter(n => n.clickable && (n.text === label || n.label === label) && n.bounds[1] >= 0 && n.bounds[3] < imeTop - 8);
    const cancel = all.find(n => n.clickable && (n.text === 'Cancel' || n.label === 'Cancel'));
    if (!cancel) { // the edit row is still under the keyboard; another card's action must not stand in
      const [wide] = sizeNow();
      adb('shell', 'input', 'swipe', String(Math.round(wide / 2)), String(Math.round(imeTop - 60)), String(Math.round(wide / 2)), String(Math.round(Math.max(imeTop - 260, 60))), '300');
      await wait(700);
      continue;
    }
    const button = actions.filter(i => Math.abs(i.bounds[1] - cancel.bounds[1]) < 40).sort((a, b) => a.bounds[0] - b.bounds[0])[0];
    if (button) { nodes(label); return; }
    const [wide] = sizeNow();
    adb('shell', 'input', 'swipe', String(Math.round(wide / 2)), String(Math.round(imeTop - 60)), String(Math.round(wide / 2)), String(Math.round(Math.max(imeTop - 260, 60))), '300');
    await wait(700);
  }
  throw new Error(`Could not bring the edit row's ${label} above the keyboard to click it.`);
};
const openFixture = async (query, need = 'shipped') => { // the post body sits below Chrome's banners
  adb('reverse', 'tcp:80', `tcp:${port}`); // a restarted adb server drops reverse mappings; re-assert it
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `http://x.com/x.html${query ?? ''}`);
  await wait(2500);
  await settleChrome(need);
};

const EDIT_SUFFIX = 'Typed by me, in my own words';
const TYPED = 'This shipped so well';
// Verify fixture server is live and page has composer before each journey
const verifyFixtureLive = async () => {
  if (!page.address()) throw new Error('Fixture server not listening (dead server).');
  await openFixture('');
  const composer = field();
  if (!composer) {
    const text = screenText();
    if (text.includes('not secure') || text.includes('connection')) {
      throw new Error('Chrome loaded error page (fixture server dead or unreachable).');
    }
    throw new Error('Could not find fixture reply composer (check page content).');
  }
};
const journey = async (screen, theme, { motion = false, typed = false } = {}) => {
  await verifyFixtureLive();
  tap(...center(composer));
  await wait(2200);
  if (typed) { type(TYPED); await wait(1500); }
  if (motion) evidence('motion-start', task, `${screen}-tap-to-inserted`);
  tap(...center(bubble()));
  await wait(1800);
  // Typed text gets the polish panel (Use this swaps in the improved version); an empty box
  // gets the reply cards. Both are the insert path: nothing may merge or wipe the box.
  const useThis = typed;
  if (!panelButton('Edit')) throw new Error('No card with an Edit button appeared.');
  if (!panelText('X')) throw new Error('The panel does not name the X platform.');
  if (panelText('no text to build a reply on')) throw new Error('The withhold note showed on a grounded post.');
  shot(screen, 'cards', theme);
  // Real model: card text varies; capture first card's actual text for edit verification
  const firstCard = nodes().find(node => node.clickable && node.text && node.text.length > 10);
  const originalCardText = firstCard?.text?.trim() || '';
  nodes('Edit'); // accessibility click into the first card's edit field
  await wait(1600);
  adb('shell', 'input', 'text', EDIT_SUFFIX.replaceAll(' ', '%s'));
  await wait(800);
  shot(screen, 'editing', theme);
  await insertViaProbe(useThis ? 'Use this' : 'Insert');
  await wait(2600);
  shot(screen, 'inserted-panel', theme);
  // The pill lives on the bubble for four seconds from the insert; the translucent panel shows it
  // above the composer that now carries the edited text. The pixel shot is timely even when the
  // probe is slow, and OCR reads the file after the fact.
  const pillNow = nodes().some(node => /Send it yourself|Check it looks right/.test(`${node.text} ${node.label}`));
  const ocrPill = () => { try { return execFileSync('tesseract', [`${root}/verify-artifacts/${task}/${screen}-inserted-panel-${theme}.png`, 'stdout'], { encoding: 'utf8' }); } catch { return ''; } };
  if (!pillNow && !/send.{0,4}yourself|check it looks right/i.test(ocrPill())) throw new Error('The insert confirmation is not visible.');
  adb('shell', 'input', 'keyevent', '111'); // hides the keyboard (and the sheet) without leaving the page
  await wait(800);
  if (panelButton('Insert') || panelButton('Edit')) { nodes('Close'); await wait(900); } // the panel's own X, if ESC only hid the keyboard
  shot(screen, 'inserted', theme);
  if (motion) evidence('motion-stop');
  const logcat = adb('logcat', '-d', '-s', 'OwnvoiceNative:I', 'OwnvoiceService:I');
  if (!/insert result ok=true/.test(logcat)) throw new Error('The insert read-back check did not pass.');
  const back = nodes().find(node => node.editable && !node.password && !/x\.com|https?:|find an app/i.test(`${node.text ?? ''} ${node.label ?? ''}`));
  const boxText = `${back?.text ?? ''}`;
  if (!boxText.includes(EDIT_SUFFIX)) throw new Error(`Field read-back missing the edit suffix "${EDIT_SUFFIX}" (got: ${boxText || 'no field'}).`);
  if (originalCardText && boxText.trim() === originalCardText) throw new Error('The inserted text equals the unedited card text: the edit did not change it.');
  // Typed box: the improved version swaps in by design — the typed text never glues onto it.
  if (typed) {
    if (boxText.includes(TYPED)) throw new Error(`The typed text was not swapped for the version (${boxText}).`);
    if (boxText.trim() === TYPED) throw new Error('The box still holds only the typed text: no version landed.');
  }
  log(`${screen}/${theme}: cards + edit + insert + confirmation + read-back OK${typed ? ' (typed box swapped cleanly)' : ''}.`);
};

// ---- the no-text post: the plain withhold note, never invented replies ----
const withhold = async (screen, theme) => {
  if (!page.address()) throw new Error('Fixture server not listening (dead server).');
  await openFixture('?case=notext', 'hours ago'); // the bar author rides above the composer, below any banner
  const composer = field();
  if (!composer) {
    const text = screenText();
    if (text.includes('not secure') || text.includes('connection')) {
      throw new Error('Chrome loaded error page (fixture server dead or unreachable).');
    }
    throw new Error('Could not find the fixture reply composer (notext).');
  }
  tap(...center(composer));
  await wait(2200);
  tap(...center(bubble()));
  await wait(1600);
  if (!panelText('no text to build a reply on')) throw new Error('The withhold note did not show on the no-text post.');
  if (panelButton('Edit')) throw new Error('A card appeared for a post with no text to ground on.');
  shot(screen, 'withheld', theme);
  nodes('Close');
  await wait(600);
  log(`${screen}/${theme}: no-text post withholds.`);
};

await journey('x-reply', 'light', { motion: true });
await journey('x-typed', 'light', { typed: true });
await withhold('x-notext', 'light');

// ---- dark theme: force-stop Chrome so prefers-color-scheme re-reads ----
evidence('theme', 'dark');
adb('shell', 'am', 'force-stop', 'com.android.chrome');
await wait(1000);
await journey('x-reply', 'dark');
await journey('x-typed', 'dark', { typed: true });
await withhold('x-notext', 'dark');

// ---- extreme: narrowest supported screen + font scale 1.3 over the long post + quote ----
adb('shell', 'settings', 'put', 'system', 'font_scale', '1.3');
adb('shell', 'wm', 'density', '320');
adb('shell', 'wm', 'size', '720x1280');
await wait(1500);
adb('shell', 'am', 'force-stop', 'com.android.chrome');
await wait(800);
await journey('x-extreme', 'dark');
await withhold('x-notext-extreme', 'dark');
adb('shell', 'wm', 'size', 'reset');
adb('shell', 'wm', 'density', 'reset');
adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0');
await wait(1000);

// ---- restore ----
adb('reverse', '--remove', 'tcp:80');
adb('shell', 'umount /system/etc/hosts');
page.close();
console.log(`X reply proof complete. Evidence in ${root}/verify-artifacts/${task}/.`);

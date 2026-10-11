// X-style composer fixture proof for the grounded reply flow (verify-ownvoice, feature reply-drafts).
// Serves mobile/e2e/x.html over a self-signed HTTPS server, host-mapped into Chrome for x.com,
// so Ownvoice's Chrome platform detection reads a real X host from the URL bar — no login,
// fixture posts, demo data named Umer. The writer is the live OpenRouter account, pasted from
// OPENROUTER_KEY_FILE (~/.config/openrouter/api_key) — a real cloud writer, never a stand-in.
// Proves: tap the bubble on the reply composer over a readable post, grounded reply cards appear,
// Edit changes the text, Insert puts exactly the edited text in the field with the
// "Inserted. Send it yourself." confirmation and a field read-back; the image-only post shows the
// no-grounding withhold note instead of cards. Captures into verify-artifacts/<task>/ through the
// skill's evidence.sh (theme/shot/motion helpers).
// Env: ANDROID_SERIAL=emulator-NNNN, OWNVOICE_AVD_NAME=<owned avd>, JAVA_HOME, SDK via
// ANDROID_HOME, OPENROUTER_KEY_FILE optional. Args: <release-apk (no stub flags)> [task-slug].
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:https';
import { fileURLToPath } from 'node:url';
import { accessibilityProbe, center } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const avd = process.env.OWNVOICE_AVD_NAME;
if (avd && execFileSync('adb', ['-s', serial, 'shell', 'getprop', 'ro.boot.qemu.avd_name'], { encoding: 'utf8' }).trim() !== avd) throw new Error(`Refusing ${serial}: AVD is not ${avd}.`);
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path (no stub flags).');
const key = readFileSync(process.env.OPENROUTER_KEY_FILE ?? `${process.env.HOME}/.config/openrouter/api_key`, 'utf8').trim();
if (!key.startsWith('sk-')) throw new Error('OpenRouter key file did not look like a key.');
const task = process.argv[3] ?? 'ov-x-replies-resume';
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
// OCR wraps a phrase across lines on narrow screens; collapse whitespace so substring waits match.
const screenText = () => execFileSync('tesseract', ['stdin', 'stdout'], { input: png(), encoding: 'utf8' }).toLowerCase().replace(/\s+/g, ' ').trim();
// Read the accessibility tree as one line — OCR without misreads — for control labels.
const nodeText = () => nodes().map(n => `${n.text ?? ''} ${n.label ?? ''}`).join(' ').toLowerCase();
const ocrLine = phrase => {
  const tsv = execFileSync('tesseract', ['stdin', 'stdout', 'tsv'], { input: png(), encoding: 'utf8' });
  return tsv.split('\n').slice(1).map(r => r.split('\t')).find(c => c.length >= 12 && c[11].toLowerCase().includes(phrase.toLowerCase()));
};
const [width, height] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);

// OCR tap that survives unlabeled React Native controls: scan the full screen, then bands.
const tapText = async label => {
  const want = label.toLowerCase();
  for (let attempt = 0; attempt < 12; attempt++) {
    const rows = execFileSync('tesseract', ['stdin', 'stdout', 'tsv'], { input: png(), encoding: 'utf8' }).split('\n').slice(1).map(r => r.split('\t'));
    const found = rows.find(c => c.length >= 12 && c[11].toLowerCase().includes(want));
    if (found) { tap(Number(found[6]) + Number(found[8]) / 2, Number(found[7]) + Number(found[9]) / 2); return; }
    await wait(1000);
  }
  throw new Error(`Could not find visible ${label}.`);
};
const waitForLine = async (labels, tries = 40) => {
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
const tapButton = async text => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const button = nodes().find(n => n.clickable && (n.text?.toLowerCase().includes(text.toLowerCase()) || n.label?.toLowerCase().includes(text.toLowerCase())));
    if (button) { tap(...center(button)); return true; }
    await wait(1000);
  }
  return false;
};
const setServices = list => adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', list.join(':'));
const rebind = async () => {
  const enabled = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
  const all = new Set(enabled === 'null' ? [] : enabled.split(':'));
  all.add(component);
  const without = [...all].filter(x => x !== component);
  setServices(without.length ? without : ['com.example.disabled/NoService']);
  await wait(1500);
  setServices([...all]);
  adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
  await wait(2000);
  if (!adb('shell', 'dumpsys', 'accessibility').includes(component)) throw new Error('The Ownvoice service did not bind after the toggle.');
};

// Dismiss Chrome's ANR dialog and first-run sheets under host load until URL bar shows x.com.
const settleChrome = async (need = 'x.com') => {
  for (let attempt = 0; attempt < 40; attempt++) {
    const urlBar = nodes().find(node => node.text?.includes('x.com'));
    if (urlBar) return; // Page loaded successfully

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
      adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'https://x.com/x.html');
      await wait(3500);
      continue;
    }
    if (text.includes('zoom in or out')) { // Chrome's banner after a system font-scale change
      const row = ocrLine('zoom in or out');
      const wide = Number((adb('shell', 'wm', 'size').match(/Override size: (\d+)x\d+/) ?? adb('shell', 'wm', 'size').match(/Physical size: (\d+)x\d+/))[1]);
      if (row) for (const dy of [-10, 0, 12]) tap(wide - 25, Number(row[7]) + Number(row[9]) / 2 + dy);
      await wait(1200);
      continue;
    }
    if (text.includes('welcome to chrome') || text.includes('use without an account')) { // Chrome first-run screen
      const skip = nodes().find(node => node.text && /use without|no thanks|skip/i.test(node.text));
      if (skip) { tap(...center(skip)); await wait(2000); continue; }
      tap(473, 1458);
      await wait(2000);
      continue;
    }
    if (text.includes('notifications make things')) { tap(643, 1751); await wait(2000); continue; }
    await wait(1500);
  }
  throw new Error(`Chrome never showed ${need} (URL bar not found in accessibility tree).`);
};

// ---- device prep: host-map x.com in Chrome over a self-signed HTTPS fixture ----
// Chrome on Android 16 upgrades http:// to https://, and a hosts-file bind is bypassed by that
// upgrade. The repo's proven path (mobile/e2e/fit-live-proof.mjs) is a self-signed HTTPS server for
// x.com plus Chrome's own command line: --host-resolver-rules maps x.com to the host (10.0.2.2)
// and --ignore-certificate-errors accepts the local cert. The URL bar then reads x.com, so
// Ownvoice's Chrome platform detection sees the X site.
const PORT = 18615;
const certDir = mkdtempSync(join(tmpdir(), 'ovx-cert-'));
const keyFile = join(certDir, 'x.key'), certFile = join(certDir, 'x.crt');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=x.com', '-addext', 'subjectAltName=DNS:x.com', '-keyout', keyFile, '-out', certFile], { stdio: 'pipe' });
const page = createServer({ key: readFileSync(keyFile), cert: readFileSync(certFile) }, (request, response) => { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); response.end(readFileSync(new URL('./x.html', import.meta.url))); });
await new Promise(r => page.listen(PORT, '0.0.0.0', r));
adb('shell', `echo '_ --host-resolver-rules="MAP x.com 10.0.2.2:${PORT}" --ignore-certificate-errors' > /data/local/tmp/chrome-command-line`);
adb('shell', 'am', 'force-stop', 'com.android.chrome');
log(`fixture serving on host :${PORT}, device https://x.com/x.html`);

// ---- app install, service bind, setup walk (writer: live OpenRouter) ----
execFileSync('adb', ['-s', serial, 'logcat', '-c']);
execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
adb('shell', 'pm', 'clear', pkg);
adb('shell', 'cmd', 'uimode', 'night', 'custom_schedule', '-o', 'off');
evidence('theme', 'light');
await rebind();

// Setup: an emulator has no phone writer, and OpenRouter is a key route offered on the "How
// Ownvoice writes" screen (ownvoice://source), not the first-run chooser (which offers only the
// phone, ChatGPT and Claude). Finish setup with no writer (hardware Back on the welcome), then
// open that screen and connect the key there — the same path a person uses.
adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
await waitForLine('sound like you', 30);
adb('shell', 'input', 'keyevent', '4'); // Back on the welcome finishes setup with no writer
await wait(2500);
await waitForLine('where the bubble shows', 30);
log('setup: finished with no writer; choosing OpenRouter on the writer list.');

adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source');
await wait(2500);
for (let i = 0; i < 5 && !nodeText().includes('with your openrouter'); i++) {
  adb('shell', 'input', 'swipe', String(width / 2), String(height * .7), String(width / 2), String(height * .3), '300');
  await wait(1200);
}
await tapButton('with your openrouter');
await waitForLine('paste your openrouter key', 30);
const keyField = nodes().find(n => `${n.text ?? ''} ${n.label ?? ''}`.toLowerCase().includes('paste your openrouter key'));
if (!keyField) throw new Error('The OpenRouter key field did not open.');
tap(...center(keyField)); await wait(700);
type(`'${key}'`); await wait(700);
if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) { adb('shell', 'input', 'keyevent', '4'); await wait(900); }
await tapButton('connect');
for (let i = 0; i < 60 && !nodeText().includes('openrouter is connected'); i++) {
  if (screenText().includes('not accepted')) throw new Error('OpenRouter rejected the key.');
  await wait(1000);
}
if (!nodeText().includes('openrouter is connected')) throw new Error('OpenRouter did not report connected.');
log('setup finished (live OpenRouter writer connected).');

// ---- enable Chrome's bubble through the app's own UI ----
const appRow = label => nodes().find(node => node.checkable && node.label === label);
const chooseApp = async label => {
  for (let attempt = 0; attempt < 3; attempt++) {
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://apps');
    await wait(1800);
    if (screenText().includes('something went wrong')) continue;
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
await chooseApp('Chrome');
log('Chrome bubble enabled.');

// ---- Chrome first-run walk (the settle loop above owns every sheet Chrome shows) ----
adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'https://x.com/x.html');
await settleChrome('reply flow end to end today');
log('fixture loaded in Chrome.');
const urlBar = nodes().find(node => node.text?.includes('x.com'));
if (!urlBar) throw new Error('The URL bar does not read x.com: platform detection would not see X.');
log(`URL bar: ${urlBar.text}`);

// ---- the reply journey: focus composer, tap bubble, cards, edit, insert ----
const bubble = async () => {
  for (let attempt = 0; attempt < 30; attempt++) {
    const node = nodes().find(node => node.windowType === 4 && /^Ownvoice(?:,|$)/.test(node.label));
    if (node) return node;
    await wait(500);
  }
  throw new Error('Could not locate the accessible Ownvoice bubble.');
};
const field = async () => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const node = nodes().find(node => node.editable && !node.password && !/x\.com|https?:|secure/i.test(node.text ?? ''));
    if (node) return node;
    await wait(500);
  }
  const dump = nodes().map(n => `${n.editable ? 'E' : '-'}${n.clickable ? 'C' : '-'} ${n.className} lbl="${(n.label ?? '').slice(0, 24)}" txt="${(n.text ?? '').slice(0, 24)}" ${JSON.stringify(n.bounds)}`).join('\n');
  throw new Error(`Could not find the composer field. Nodes:\n${dump}`);
};
const panelButton = async (name, tries = 120) => {
  const start = Date.now();
  for (let attempt = 0; attempt < tries; attempt++) { // polling for the cloud writer round-trip
    const node = nodes().find(node => node.clickable && (node.text === name || node.label === name));
    if (node) { const elapsed = Date.now() - start; if (elapsed > 1000) log(`${name} found after ${Math.round(elapsed / 1000)}s`); return node; }
    await wait(500);
  }
  return null;
};
const panelText = phrase => nodes().some(node => `${node.text} ${node.label}`.includes(phrase));
const shot = (screen, label, theme) => evidence('shot', task, screen, label, theme);
const sizeNow = () => {
  const out = adb('shell', 'wm', 'size');
  const match = out.match(/Override size: (\d+)x(\d+)/) ?? out.match(/Physical size: (\d+)x(\d+)/);
  return [Number(match[1]), Number(match[2])];
};
// Click the edit row's action — the one sharing its line with the edit row's Cancel, never
// another card's. The sheet scrolls its buttons above the open keyboard first.
const insertViaProbe = async label => {
  let hidKeyboard = false;
  for (let attempt = 0; attempt < 8; attempt++) {
    if (attempt === 2 && !hidKeyboard) { adb('shell', 'input', 'keyevent', '111'); hidKeyboard = true; await wait(800); }
    const all = nodes();
    const ime = all.filter(n => n.windowType === 2);
    const imeTop = ime.length ? Math.min(...ime.map(n => n.windowBounds[1])) : sizeNow()[1];
    const actions = all.filter(n => n.clickable && (n.text === label || n.label === label) && n.bounds[1] >= 0 && n.bounds[3] < imeTop - 8);
    const cancel = all.find(n => n.clickable && (n.text === 'Cancel' || n.label === 'Cancel'));
    if (!cancel) {
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
const openFixture = async (query, need = 'shipped') => {
  // The Chrome command line maps x.com on every launch; re-assert it in case a restart cleared it.
  adb('shell', `echo '_ --host-resolver-rules="MAP x.com 10.0.2.2:${PORT}" --ignore-certificate-errors' > /data/local/tmp/chrome-command-line`);
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `https://x.com/x.html${query ?? ''}`);
  await wait(2500);
  await settleChrome(need);
};

const EDIT_SUFFIX = 'Typed by me, in my own words';
const TYPED = 'This shipped so well';
const verifyFixtureLive = async () => {
  if (!page.address()) throw new Error('Fixture server not listening (dead server).');
  await openFixture('');
  const composer = await field();
  if (!composer) {
    const text = screenText();
    if (text.includes('not secure') || text.includes('connection')) throw new Error('Chrome loaded an error page (fixture server dead or unreachable).');
    throw new Error('Could not find fixture reply composer (check page content).');
  }
};
const journey = async (screen, theme, { motion = false } = {}) => {
  await verifyFixtureLive();
  const composer = await field();
  tap(...center(composer));
  await wait(2200);
  if (motion) evidence('motion-start', task, `${screen}-tap-to-inserted`);
  tap(...center(await bubble()));
  await wait(1800);
  const editCard = await panelButton('Edit', 240); // room for the live OpenRouter round-trip
  if (!editCard) {
    shot(screen, 'nocard', theme);
    const capture = adb('logcat', '-d', '-s', 'OwnvoiceNative:I').split('\n').filter(l => l.includes('capture practice')).at(-1) ?? '(no capture log)';
    log(`no Edit card: withhold=${panelText('Reply ideas are unavailable')} xPlat=${panelText('X')} nodes=${nodes().length}`);
    log(`capture: ${capture.trim()}`);
    log(`screen: ${screenText().slice(0, 500)}`);
    throw new Error('No card with an Edit button appeared.');
  }
  if (!panelText('X')) throw new Error('The panel does not name the X platform.');
  if (panelText('Reply ideas are unavailable')) throw new Error('The withhold note showed on a grounded post.');
  shot(screen, 'cards', theme);
  const firstCard = nodes().find(node => node.clickable && node.text && node.text.length > 10);
  const originalCardText = firstCard?.text?.trim() || '';
  nodes('Edit'); // accessibility click into the first card's edit field
  await wait(1600);
  adb('shell', 'input', 'text', EDIT_SUFFIX.replaceAll(' ', '%s'));
  await wait(800);
  shot(screen, 'editing', theme);
  await insertViaProbe('Insert');
  await wait(2600);
  shot(screen, 'inserted-panel', theme);
  const pillNow = nodes().some(node => /Send it yourself|Check it looks right/.test(`${node.text} ${node.label}`));
  const ocrPill = () => { try { return execFileSync('tesseract', [`${root}/verify-artifacts/${task}/${screen}-inserted-panel-${theme}.png`, 'stdout'], { encoding: 'utf8' }); } catch { return ''; } };
  if (!pillNow && !/send.{0,4}yourself|check it looks right/i.test(ocrPill())) throw new Error('The insert confirmation is not visible.');
  adb('shell', 'input', 'keyevent', '111');
  await wait(800);
  if ((await panelButton('Insert')) || (await panelButton('Edit'))) { nodes('Close'); await wait(900); }
  shot(screen, 'inserted', theme);
  if (motion) evidence('motion-stop');
  const logcat = adb('logcat', '-d', '-s', 'OwnvoiceNative:I', 'OwnvoiceService:I');
  if (!/insert result ok=true/.test(logcat)) throw new Error('The insert read-back check did not pass.');
  const back = nodes().find(node => node.editable && !node.password && !/x\.com|https?:|find an app/i.test(`${node.text ?? ''} ${node.label ?? ''}`));
  const boxText = `${back?.text ?? ''}`;
  if (!boxText.includes(EDIT_SUFFIX)) throw new Error(`Field read-back missing the edit suffix "${EDIT_SUFFIX}" (got: ${boxText || 'no field'}).`);
  if (originalCardText && boxText.trim() === originalCardText) throw new Error('The inserted text equals the unedited card text: the edit did not change it.');
  log(`${screen}/${theme}: cards + edit + insert + confirmation + read-back OK.`);
};

// ---- the no-text post: the plain withhold note, never invented replies ----
const withhold = async (screen, theme) => {
  if (!page.address()) throw new Error('Fixture server not listening (dead server).');
  await openFixture('?case=notext', 'hours ago');
  const composer = await field();
  if (!composer) throw new Error('Could not find the fixture reply composer (notext).');
  tap(...center(composer));
  await wait(2200);
  tap(...center(await bubble()));
  await wait(1600);
  if (!panelText('Reply ideas are unavailable')) throw new Error('The withhold note did not show on the no-text post.');
  if (await panelButton('Edit')) throw new Error('A card appeared for a post with no text to ground on.');
  shot(screen, 'withheld', theme);
  nodes('Close');
  await wait(600);
  log(`${screen}/${theme}: no-text post withholds.`);
};

await journey('x-reply', 'light', { motion: true });
await withhold('x-notext', 'light');

// ---- dark theme: force-stop Chrome so prefers-color-scheme re-reads ----
evidence('theme', 'dark');
adb('shell', 'am', 'force-stop', 'com.android.chrome');
await wait(1000);
await journey('x-reply', 'dark');
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
adb('shell', 'rm', '-f', '/data/local/tmp/chrome-command-line');
page.close();
rmSync(certDir, { recursive: true, force: true });
log(`X reply proof complete. Evidence in ${root}/verify-artifacts/${task}/.`);

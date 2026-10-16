// X-style composer fixture proof for the grounded reply flow (done-done journey reply-drafts).
// Serves mobile/e2e/x.html over a self-signed HTTPS server, host-mapped into Chrome for x.com,
// so Ownvoice's Chrome platform detection reads a real X host from the URL bar — no login,
// fixture posts, demo data named Umer. The writer is a real cloud writer, never a stand-in:
// OpenRouter (a key pasted from OPENROUTER_KEY_FILE) or the OpenCode Go plan-key route
// (X_REPLIES_WRITER=opencode, key from OC_KEY, pasted through the same connect field a person uses).
// Proves: tap the bubble on the reply composer over a readable post, grounded reply cards appear,
// Edit changes the text, Insert puts exactly the edited text in the field with the
// "Inserted. Send it yourself." confirmation and a field read-back; the card's Copy control copies
// without writing the box (copy-only); the refusal screens (an image-only post, a compose screen
// showing only labels) show a plain note instead of cards and make no writer request. Captures into
// verify-artifacts/<task>/ through mobile/e2e/evidence.sh (theme/shot/motion helpers).
// Env: ANDROID_SERIAL=emulator-NNNN, OWNVOICE_AVD_NAME=<owned avd>, JAVA_HOME, SDK via
// ANDROID_HOME, OPENROUTER_KEY_FILE optional, X_REPLIES_WRITER=openrouter|opencode (default
// openrouter), OC_KEY (the OpenCode Go plan key, never printed or written), X_REPLIES_MOTION=1 to
// record the tap-to-inserted motion, OPENCODE_WORKSPACE (default Working2) for a key with several workspaces, X_REPLIES_LEGS=refusal to run only the refusal legs (no writer
// request anywhere, so it needs no funded account). Args: <release-apk (no stub flags)> [task-slug].
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const writer = process.env.X_REPLIES_WRITER ?? 'openrouter';
if (!['openrouter', 'opencode'].includes(writer)) throw new Error(`Unknown X_REPLIES_WRITER "${writer}" (openrouter|opencode).`);
const key = writer === 'opencode'
  ? (process.env.OC_KEY ?? '')
  : readFileSync(process.env.OPENROUTER_KEY_FILE ?? `${process.env.HOME}/.config/openrouter/api_key`, 'utf8').trim();
if (writer === 'openrouter' && !key.startsWith('sk-')) throw new Error('OpenRouter key file did not look like a key.');
if (writer === 'opencode' && key.length < 20) throw new Error('OC_KEY is not set to the OpenCode Go plan key.');
const motion = process.env.X_REPLIES_MOTION === '1';
const goWorkspace = process.env.OPENCODE_WORKSPACE ?? 'Working2';
const task = process.argv[3] ?? 'ov-x-replies-resume';
const root = resolve(fileURLToPath(import.meta.url), '../../..');
const evidence = (...args) => execFileSync('bash', [`${root}/mobile/e2e/evidence.sh`, ...args], { cwd: root, encoding: 'utf8' });
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
// An emulator under load throws a "System UI isn't responding" dialog over the app; tap Wait and let
// the caller re-open its screen. Returns whether it dismissed one.
const dismissAnr = () => {
  const text = screenText();
  if (!/isn't responding|not responding|keeps stopping/i.test(text)) return false;
  const row = ocrLine('wait') ?? ocrLine('close app');
  if (row) tap(Number(row[6]) + Number(row[8]) / 2, Number(row[7]) + Number(row[9]) / 2);
  return true;
};
// Re-open MainActivity until the named screen shows, clearing any ANR dialog in the way.
const openUntil = async (phrase, tries = 40) => {
  for (let i = 0; i < tries; i++) {
    if (screenText().includes(phrase.toLowerCase())) return;
    adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
    await wait(1500);
    if (dismissAnr()) { await wait(2500); continue; }
  }
  throw new Error(`The "${phrase}" screen never showed.`);
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
// Take the component out of the enabled list (keeping any other service): MainActivity skips the
// first-run setup whenever the Ownvoice service is bound, so the setup walk needs it unbound.
const serviceOff = async () => {
  const enabled = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
  const rest = (enabled === 'null' ? [] : enabled.split(':')).filter(x => x !== component);
  setServices(rest.length ? rest : ['com.example.disabled/NoService']);
  await wait(2500);
};
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
  try { shot('chrome', `unsettled-${need.replace(/\W+/g, '-')}`, 'stuck'); } catch { /* the error below still names the screen */ }
  const focus = adb('shell', 'dumpsys', 'window').match(/mCurrentFocus=.*/)?.[0] ?? 'unknown focus';
  const seen = nodes().map(n => (n.text || n.label || '').trim()).filter(Boolean).join(' | ').slice(0, 300);
  throw new Error(`Chrome never showed ${need} (URL bar not found in accessibility tree; ${focus}; nodes: ${seen}).`);
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

// ---- app install, service bind, setup walk (writer: a live cloud writer, OpenRouter or OpenCode Go) ----
execFileSync('adb', ['-s', serial, 'logcat', '-c']);
execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
adb('shell', 'pm', 'clear', pkg);
adb('shell', 'cmd', 'uimode', 'night', 'custom_schedule', '-o', 'off');
evidence('theme', 'light');
await serviceOff();

// Setup: an emulator has no phone writer, and the cloud key routes are offered on the "How
// Ownvoice writes" screen (ownvoice://source), not the first-run chooser (which offers only the
// phone, ChatGPT and Claude). Finish setup with no writer (hardware Back on the welcome), then
// open that screen and connect the key there — the same path a person uses.
await openUntil('sound like you');
adb('shell', 'input', 'keyevent', '4'); // Back on the welcome finishes setup with no writer
await wait(2500);
await openUntil('where the bubble shows');
log(`setup: finished with no writer; choosing ${writer === 'opencode' ? 'OpenCode Go' : 'OpenRouter'} on the writer list.`);

const onScreen = phrase => nodeText().includes(phrase.toLowerCase());
const scrollWriterList = async phrase => {
  for (let i = 0; i < 8 && !onScreen(phrase); i++) {
    adb('shell', 'input', 'swipe', String(width / 2), String(height * .7), String(width / 2), String(height * .3), '300');
    await wait(1200);
  }
};
const pasteKey = async label => {
  const field = nodes().find(n => n.editable && `${n.text ?? ''} ${n.label ?? ''}`.toLowerCase().includes(label.toLowerCase()));
  if (!field) throw new Error(`The ${label} field did not open.`);
  tap(...center(field)); await wait(700);
  type(`'${key}'`); await wait(700);
  if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) { adb('shell', 'input', 'keyevent', '4'); await wait(900); }
};
const skipSetup = async () => {
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source');
  await wait(2500);
};
// OpenRouter: the key route the first proof used, kept so the driver still runs without a change.
const connectOpenRouter = async () => {
  await skipSetup();
  await scrollWriterList('with your openrouter');
  await tapButton('with your openrouter');
  await waitForLine('paste your openrouter key', 30);
  await pasteKey('paste your openrouter key');
  await tapButton('connect');
  for (let i = 0; i < 60 && !onScreen('openrouter is connected'); i++) {
    if (screenText().includes('not accepted')) throw new Error('OpenRouter rejected the key.');
    await wait(1000);
  }
  if (!onScreen('openrouter is connected')) throw new Error('OpenRouter did not report connected.');
};
// OpenCode Go: the plan-key route from PR 209, connected with the desktop login's own key through
// the app's connect field. The key is never printed, logged or written; the app masks it and keeps
// it only in its secure store.
const connectOpenCode = async () => {
  await skipSetup();
  await scrollWriterList('with your opencode go');
  await tapButton('with your opencode go');
  await waitForLine('paste your opencode go key', 30);
  await pasteKey('paste your opencode go key');
  await tapButton('connect');
  for (let i = 0; i < 60; i++) {
    if (onScreen('opencode go is connected')) break;
    if (onScreen('that key was not accepted')) throw new Error('OpenCode Go rejected the key.');
    // A login key for several workspaces shows the kit's pick: tap the plan's workspace.
    const pick = onScreen('more than one workspace') && nodes().find(n => (n.text || n.label || '').trim() === goWorkspace);
    if (pick) { tap(...center(pick)); await wait(2500); continue; }
    const yes = nodes().find(n => n.clickable && /switch to opencode go/i.test(`${n.label ?? ''} ${n.text ?? ''}`));
    if (yes) { tap(...center(yes)); await wait(2500); }
    await wait(1000);
  }
  if (!onScreen('opencode go is connected')) throw new Error('OpenCode Go did not report connected.');
};
// A refusal leg makes no writer call, so the refusal-only run skips connecting a writer entirely.
const refusalOnly = process.env.X_REPLIES_LEGS === 'refusal';
if (!refusalOnly && writer === 'opencode') await connectOpenCode();
else if (!refusalOnly) await connectOpenRouter();
log(`setup finished (${refusalOnly ? 'no writer connected (refusal legs)' : `live ${writer === 'opencode' ? 'OpenCode Go' : 'OpenRouter'} writer connected`}).`);

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
await rebind(); // the bubble needs the service; bind it only now so the setup walk above stays first-run
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
  for (let attempt = 0; attempt < 70; attempt++) {
    const node = nodes().find(node => node.windowType === 4 && /^Ownvoice(?:,|$)/.test(node.label));
    if (node) return node;
    if (attempt % 4 === 3) dismissAnr();
    await wait(500);
  }
  throw new Error('Could not locate the accessible Ownvoice bubble.');
};
const field = async () => {
  for (let attempt = 0; attempt < 40; attempt++) {
    const node = nodes().find(node => node.editable && !node.password && !/x\.com|https?:|secure/i.test(node.text ?? ''));
    if (node) return node;
    if (attempt % 4 === 3) dismissAnr();
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
// Wait for a reply card's Edit control, but stop early the moment the panel plainly says the writer
// could not write — a refusal should not cost the full card wait on every leg.
const waitEditOrRefusal = async (tries = 120) => {
  for (let attempt = 0; attempt < tries; attempt++) {
    const node = nodes().find(n => n.clickable && (n.text === 'Edit' || n.label === 'Edit'));
    if (node) return node;
    const panel = nodes().map(n => (n.text || n.label || '').trim()).filter(Boolean).join(' | ');
    if (attempt > 8 && (WRITER_REFUSAL.test(panel) || panel.includes('Reply ideas are unavailable'))) return null;
    await wait(500);
  }
  return null;
};
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
// The composer's own text, read without throwing (used by the copy leg to prove it stays put).
const fieldNow = () => {
  const node = nodes().find(n => n.editable && !n.password && !/x\.com|https?:|secure/i.test(n.text ?? ''));
  return `${node?.text ?? ''}`;
};
// The card's Copy control is copy-only: it puts the card on the clipboard and never writes the
// composer. Proven by the Copied tick, an unchanged box, and the best clipboard read adbd allows.
const clipboardNow = () => {
  for (const cmd of [['shell', 'cmd', 'clipboard', 'get-text'], ['shell', 'dumpsys', 'clipboard'], ['shell', 'service', 'call', 'clipboard', '2']]) {
    try {
      const out = adb(...cmd).replace(/\s+/g, ' ').trim();
      if (out) return `${cmd.join(' ')} -> ${out.slice(0, 400)}`;
    } catch { /* adbd cannot read the clipboard here; try the next reader */ }
  }
  return 'no clipboard reader worked from adbd';
};
const copyLeg = async (screen, theme) => {
  const boxBefore = fieldNow();
  const cardNode = nodes().find(n => n.clickable && n.text && n.text.length > 10);
  const cardText = cardNode?.text?.trim() || '';
  const copyButton = nodes().find(n => n.clickable && /^(copy|copied)$/i.test((n.label ?? n.text ?? '').trim()));
  if (!copyButton) throw new Error('The card row has no Copy control.');
  tap(...center(copyButton));
  await wait(1400);
  const tick = nodes().some(n => /copied/i.test(`${n.label ?? ''} ${n.text ?? ''}`));
  shot(screen, 'copied', theme);
  const boxAfter = fieldNow();
  const clip = clipboardNow();
  const changed = boxAfter.trim() !== boxBefore.trim();
  mkdirSync(`${root}/verify-artifacts/${task}`, { recursive: true });
  writeFileSync(`${root}/verify-artifacts/${task}/${screen}-copy-${theme}.txt`, [
    `copy control: ${(copyButton.label ?? copyButton.text ?? '').trim()}`,
    `copied tick shown: ${tick}`,
    `first card text: ${cardText || '(none read)'}`,
    `composer before copy: ${JSON.stringify(boxBefore)}`,
    `composer after copy:  ${JSON.stringify(boxAfter)}  (copy-only: must not change)`,
    `clipboard read: ${clip}`,
  ].join('\n') + '\n');
  log(`${screen}/${theme}: Copy control -> tick=${tick} boxChanged=${changed}`);
  if (!tick) throw new Error('The Copy control did not confirm the copy.');
  if (changed) throw new Error('Copy wrote into the composer (not copy-only).');
  return { cardText, tick, clip };
};
// The plain sentences the panel shows when the cloud writer could not answer; a grounded journey is
// never expected to show these, so their presence means the writer refused (limit, auth, fallback).
const WRITER_REFUSAL = /didn't answer|turned off|get this phone ready|limit reached|can't write|could not be reached|couldn't be reached|not accepted/i;
const journey = async (screen, theme, { motion = false, copy = false, postShot = false } = {}) => {
  await verifyFixtureLive();
  if (postShot) shot(screen, 'post', theme); // the longest text the screen shows, before any panel
  const composer = await field();
  tap(...center(composer));
  await wait(2200);
  const record = motion ? `${screen}-tap-to-inserted` : null;
  if (motion) evidence('motion-start', task, record);
  try {
    tap(...center(await bubble()));
    await wait(1800);
    const editCard = await waitEditOrRefusal(240); // room for the live cloud writer round-trip
    if (!editCard) {
      shot(screen, 'nocard', theme);
      const panel = nodes().map(n => (n.text || n.label || '').trim()).filter(Boolean).join(' | ').slice(0, 600);
      log(`no Edit card: withhold=${panelText('Reply ideas are unavailable')} xPlat=${panelText('X')} nodes=${nodes().length}`);
      log(`panel text: ${panel}`);
      log(`screen: ${screenText().slice(0, 300)}`);
      mkdirSync(`${root}/verify-artifacts/${task}`, { recursive: true });
      writeFileSync(`${root}/verify-artifacts/${task}/${screen}-logcat-${theme}.txt`, adb('logcat', '-d'));
      log(`logcat saved: ${root}/verify-artifacts/${task}/${screen}-logcat-${theme}.txt`);
      if (WRITER_REFUSAL.test(panel)) {
        const refusal = new Error(`The writer did not answer on ${screen}/${theme}: ${panel.slice(0, 200)}`);
        refusal.writerRefused = true;
        throw refusal;
      }
      throw new Error('No card with an Edit button appeared.');
    }
    if (!panelText('X')) throw new Error('The panel does not name the X platform.');
    if (panelText('Reply ideas are unavailable')) throw new Error('The withhold note showed on a grounded post.');
    shot(screen, 'cards', theme);
    if (copy) {
      await copyLeg(screen, theme);
      // Copy closes the panel (the native copy finishes it), so reopen it from the bubble for the edit.
      tap(...center(await bubble()));
      await wait(1800);
      if (!(await waitEditOrRefusal(240))) throw new Error('No card with an Edit button after reopening the panel.');
    }
    const firstCard = nodes().find(node => node.clickable && node.text && node.text.length > 10);
    const originalCardText = firstCard?.text?.trim() || '';
    nodes('Edit'); // accessibility click into the first card's edit field
    await wait(1600);
    adb('shell', 'input', 'text', EDIT_SUFFIX.replaceAll(' ', '%s'));
    await wait(800);
    shot(screen, 'editing', theme);
    await insertViaProbe('Insert');
    // The pill lives on the bubble for four seconds from the insert, but the native insert-verify can
    // run a few seconds first, so watch the screen and shoot the moment it appears (the pixel shot is
    // timely; OCR reads the file after the fact).
    let pillSeen = false;
    for (let i = 0; i < 24 && !pillSeen; i++) {
      pillSeen = /send.{0,4}yourself|check it looks right/i.test(screenText());
      if (!pillSeen) await wait(500);
    }
    shot(screen, 'inserted-panel', theme);
    const pillNow = pillSeen || nodes().some(node => /Send it yourself|Check it looks right/.test(`${node.text} ${node.label}`));
    const ocrPill = () => { try { return execFileSync('tesseract', [`${root}/verify-artifacts/${task}/${screen}-inserted-panel-${theme}.png`, 'stdout'], { encoding: 'utf8' }); } catch { return ''; } };
    if (!pillNow && !/send.{0,4}yourself|check it looks right/i.test(ocrPill())) throw new Error('The insert confirmation is not visible.');
    // Read the insert result now, before the logcat ring buffer can rotate it out.
    const logcat = adb('logcat', '-d', '-s', 'OwnvoiceNative:I', 'OwnvoiceService:I');
    adb('shell', 'input', 'keyevent', '111');
    await wait(800);
    if ((await panelButton('Insert', 4)) || (await panelButton('Edit', 4))) { nodes('Close'); await wait(900); }
    shot(screen, 'inserted', theme);
    if (!/insert result ok=true/.test(logcat)) throw new Error('The insert read-back check did not pass.');
    const back = nodes().find(node => node.editable && !node.password && !/x\.com|https?:|find an app/i.test(`${node.text ?? ''} ${node.label ?? ''}`));
    const boxText = `${back?.text ?? ''}`;
    if (!boxText.includes(EDIT_SUFFIX)) throw new Error(`Field read-back missing the edit suffix "${EDIT_SUFFIX}" (got: ${boxText || 'no field'}).`);
    if (originalCardText && boxText.trim() === originalCardText) throw new Error('The inserted text equals the unedited card text: the edit did not change it.');
    log(`${screen}/${theme}: cards + edit + insert + confirmation + read-back OK.`);
  } finally {
    if (motion) { try { evidence('motion-stop'); } catch (error) { log(`motion-stop: ${error.message}`); } }
  }
};

// ---- the refusal legs: a plain note, no card, and no writer request on the way ----
// The app's own read list ("What Ownvoice read", ownvoice://reads) is where it records what each
// tap did: the newest Chrome row carries "Sent to your AI account" only once a cloud writer
// answered, so a refusal leg must show that row without the mark. Rows are newest first.
const newestReadBlock = async () => {
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://reads');
  for (let attempt = 0; attempt < 10; attempt++) {
    await wait(1500);
    const texts = nodes().map(n => `${n.text ?? ''}\n${n.label ?? ''}`.trim()).filter(Boolean);
    const first = texts.findIndex(text => /in Chrome\b/i.test(text));
    if (first >= 0) return texts.slice(first, first + 3).join(' | ');
  }
  throw new Error('The read list did not show a Chrome row.');
};
// Every refusal surface shows a plain note and no card. `note` is the exact sentence the shipped
// panel shows there; the leg prints it into its own evidence file, never only into this log.
const withhold = async (screen, theme, { query, need, note }) => {
  if (!page.address()) throw new Error('Fixture server not listening (dead server).');
  await openFixture(query, need);
  const composer = await field();
  if (!composer) throw new Error(`Could not find the fixture composer (${screen}).`);
  // The fixture composer is in the accessibility tree first; give Chrome's compositor a beat so the
  // fixture shot shows the screen a person saw (the dark pass otherwise caught an unpainted page).
  await wait(2500);
  shot(screen, 'fixture', theme); // what the screen shows before the tap: nothing readable above the box
  adb('shell', 'logcat', '-c');
  tap(...center(composer));
  await wait(2200);
  tap(...center(await bubble()));
  await wait(1600);
  if (!panelText(note)) {
    const seen = nodes().map(n => (n.text || n.label || '').trim()).filter(Boolean).join(' | ').slice(0, 600);
    throw new Error(`The plain note "${note}" did not show on ${screen}/${theme}. Panel: ${seen}`);
  }
  if (await panelButton('Edit', 8)) throw new Error(`A card appeared on ${screen}/${theme}.`);
  for (const action of ['Insert', 'Use this', 'Write new ones', 'Why?']) {
    if (await panelButton(action, 1)) throw new Error(`The card action "${action}" appeared on ${screen}/${theme}.`);
  }
  shot(screen, 'withheld', theme);
  const panel = nodes().map(n => (n.text || n.label || '').trim()).filter(Boolean).join(' | ').slice(0, 1200);
  nodes('Close');
  await wait(600);
  const read = await newestReadBlock();
  shot(screen, 'read-list', theme);
  const sent = /sent to your ai account/i.test(read);
  const dir = `${root}/verify-artifacts/${task}/refusal/${screen}-${theme}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/logcat.txt`, adb('logcat', '-d'));
  writeFileSync(`${dir}/panel.txt`, `${panel}\n`);
  writeFileSync(`${dir}/read-list-row.txt`, `${read}\n`);
  writeFileSync(`${dir}/leg.txt`, [
    `leg: ${screen} (https://x.com/x.html${query}, theme ${theme})`,
    `fixture shot: verify-artifacts/${task}/${screen}-fixture-${theme}.png`,
    `panel shot: verify-artifacts/${task}/${screen}-withheld-${theme}.png`,
    `read list shot: verify-artifacts/${task}/${screen}-read-list-${theme}.png`,
    `note shown: ${note}`,
    'cards: none (no Edit, Insert, Use this, Write new ones or Why? action on the panel)',
    `read list newest Chrome row: ${read}`,
    `writer request recorded (Sent mark): ${sent}`,
    'logcat: this leg only, from its own clear before the tap',
    '',
  ].join('\n'));
  if (sent) throw new Error(`The read list marks the ${screen}/${theme} tap as sent: a writer request went out.`);
  log(`${screen}/${theme}: plain note, no card, no writer request (read row: ${read})`);
};

// X_REPLIES_LEGS=refusal: only the legs that must make no writer request, so the run is
// credit-free; the default keeps the full writer-dependent journey.
const IMAGE_ONLY = { query: '?case=notext', need: 'hours ago', note: 'Reply ideas are unavailable' };
const LABELS_ONLY = { query: '?case=labels', need: 'post text', note: 'Write one line about what your post is about' };

// A failed earlier run can leave its recording marker behind; clear it so motion-start is honest.
for (const stale of ['.motion.pid', '.motion.out']) rmSync(`${root}/verify-artifacts/${task}/${stale}`, { force: true });

// Each leg is guarded so one failure is recorded rather than losing the rest of the run. A leg that
// needs the writer is skipped once the writer has refused (more calls would only repeat the refusal),
// while the refusal legs — which make no writer request — keep running.
const summary = [];
let writerRefused = false;
const summarize = line => {
  summary.push(line);
  try {
    mkdirSync(`${root}/verify-artifacts/${task}`, { recursive: true });
    writeFileSync(`${root}/verify-artifacts/${task}/leg-summary.txt`, summary.join('\n') + '\n');
  } catch { /* the run keeps its own outcome */ }
};
const leg = async (name, fn, { needsWriter = false } = {}) => {
  if (writerRefused && needsWriter) { summarize(`${name}: SKIP (the writer refused before this leg)`); return; }
  try { await fn(); summarize(`${name}: PASS`); log(`${name}: PASS`); }
  catch (error) {
    summarize(`${name}: FAIL ${String(error.message).slice(0, 220)}`);
    log(`${name}: FAIL ${error.message}`);
    if (error.writerRefused) writerRefused = true;
  }
};
const setExtreme = on => {
  adb('shell', 'settings', 'put', 'system', 'font_scale', on ? '1.3' : '1.0');
  adb('shell', 'wm', 'density', on ? '320' : 'reset');
  adb('shell', 'wm', 'size', on ? '720x1280' : 'reset');
};

try {
  // Phase 1 (light): the refusal legs first, because they prove the withhold without any writer call
  // and must survive a later writer refusal.
  await leg('refusal-notext-light', () => withhold('x-notext', 'light', IMAGE_ONLY));
  await leg('refusal-labels-light', () => withhold('x-labels', 'light', LABELS_ONLY));
  if (!refusalOnly) {
    // The light leg uses the fixture's longest text (the long post + quote); postShot captures the
    // screen that grounding came from before any panel covers it.
    await leg('light', () => journey('x-reply', 'light', { copy: true, motion, postShot: true }), { needsWriter: true });
  }

  // ---- dark theme: the app process reads the colour scheme at start, Chrome at page load ----
  evidence('theme', 'dark');
  adb('shell', 'am', 'force-stop', 'com.android.chrome');
  if (refusalOnly) { adb('shell', 'am', 'force-stop', pkg); await wait(1000); await rebind(); }
  await wait(1000);
  await leg('refusal-notext-dark', () => withhold('x-notext', 'dark', IMAGE_ONLY));
  await leg('refusal-labels-dark', () => withhold('x-labels', 'dark', LABELS_ONLY));
  if (!refusalOnly) await leg('dark', () => journey('x-reply', 'dark', {}), { needsWriter: true });

  // ---- extreme: narrowest supported screen + font scale 1.3 over the long post + quote ----
  if (!refusalOnly) {
    setExtreme(true);
    await wait(1500);
    await leg('refusal-notext-extreme', () => withhold('x-notext-extreme', 'dark', IMAGE_ONLY));
    adb('shell', 'am', 'force-stop', 'com.android.chrome');
    await wait(800);
    await leg('font-1.3', () => journey('x-extreme', 'dark', {}), { needsWriter: true });
    setExtreme(false);
    await wait(1000);
  }
} finally {
  // ---- restore ----
  try { writeFileSync(`${root}/verify-artifacts/${task}/leg-summary.txt`, summary.join('\n') + '\n'); } catch { /* keep the run's own error */ }
  adb('shell', 'rm', '-f', '/data/local/tmp/chrome-command-line');
  page.close();
  rmSync(certDir, { recursive: true, force: true });
}

const failed = summary.filter(line => line.includes(': FAIL'));
log(`X reply proof complete. Evidence in ${root}/verify-artifacts/${task}/. Failed legs: ${failed.length}${writerRefused ? ' (writer refused)' : ''}`);
if (writerRefused) process.exitCode = 7;
else if (failed.length) process.exitCode = 1;

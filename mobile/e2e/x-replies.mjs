// X-style composer fixture proof for the grounded reply flow (done-done journey reply-drafts).
// Serves mobile/e2e/x.html over a self-signed HTTPS server, host-mapped into Chrome for x.com,
// so Ownvoice's Chrome platform detection reads a real X host from the URL bar — no login,
// fixture posts, demo data named Umer. The writer is a real model, never a stand-in:
// OpenRouter (a key pasted from OPENROUTER_KEY_FILE), the OpenCode Go plan-key route
// (X_REPLIES_WRITER=opencode, key from OC_KEY, pasted through the same connect field a person uses), or
// the host's `e2e/pi-writer.mjs` on @byokit/decide's pi backend (X_REPLIES_WRITER=pi: DeepSeek Flash
// with Haiku as its fallback, no provider key and no sign-in) through the same connect field.
// Proves: tap the bubble on the reply composer over a readable post, grounded reply cards appear,
// every card's wording matches its own F6a label (Agree / Push back, kindly / Ask a question),
// Edit changes the text, Insert puts exactly the edited text in the field with the
// "Inserted. Send it yourself." confirmation, a field read-back, and the outcome record that
// insertion wrote, read back from the app's own store and its "Replies you inserted" screen; the card's Copy control copies
// without writing the box (copy-only); the refusal screens (an image-only post, a compose screen
// showing only labels) show a plain note instead of cards and make no writer request. Captures into
// verify-artifacts/<task>/ through mobile/e2e/evidence.sh (theme/shot/motion helpers).
// Env: ANDROID_SERIAL=emulator-NNNN, OWNVOICE_AVD_NAME=<owned avd>, JAVA_HOME, SDK via
// ANDROID_HOME, OPENROUTER_KEY_FILE optional, X_REPLIES_WRITER=openrouter|opencode (default
// openrouter), OC_KEY (the OpenCode Go plan key, never printed or written), X_REPLIES_WRITER=pi to run
// against the host's e2e/pi-writer.mjs (PI_WRITER_PORT, PI_MODEL, PI_FALLBACK_MODEL passed through),
// X_REPLIES_MOTION=1 to
// record the tap-to-inserted motion, OPENCODE_WORKSPACE (default Working2) for a key with several workspaces, X_REPLIES_LEGS=refusal to run only the refusal legs, extreme one
// included (a live writer is still connected, but no leg makes a writer request), X_REPLIES_LEGS=preflight to connect the writer and
// prove one grounded, label-true generation answers, then stop. Args: <release-apk (no stub flags)> [task-slug].
import { execFileSync, spawn } from 'node:child_process';
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
if (!['openrouter', 'opencode', 'pi'].includes(writer)) throw new Error(`Unknown X_REPLIES_WRITER "${writer}" (openrouter|opencode|pi).`);
// The pi route needs no provider key of its own: the app still pastes a key into its OpenRouter field
// (the same field a person uses), and the build's EXPO_PUBLIC_E2E_OPENROUTER_BASE points that route at
// the host, which answers through @byokit/decide's pi backend with the installed pi's own keys.
const key = writer === 'pi' ? 'sk-or-standin-pi-writer'
  : writer === 'opencode'
  ? (process.env.OC_KEY ?? '')
  : readFileSync(process.env.OPENROUTER_KEY_FILE ?? `${process.env.HOME}/.config/openrouter/api_key`, 'utf8').trim();
if (writer === 'openrouter' && !key.startsWith('sk-')) throw new Error('OpenRouter key file did not look like a key.');
if (writer === 'opencode' && key.length < 20) throw new Error('OC_KEY is not set to the OpenCode Go plan key.');
const motion = process.env.X_REPLIES_MOTION === '1';
const goWorkspace = process.env.OPENCODE_WORKSPACE ?? 'Working2';
const task = process.argv[3] ?? 'ov-x-replies-resume';
const root = resolve(fileURLToPath(import.meta.url), '../../..');
const evidence = (...args) => execFileSync('bash', [`${root}/mobile/e2e/evidence.sh`, ...args], { cwd: root, encoding: 'utf8' });
// X_REPLIES_WRITER=pi: the host serves the real writer route (DeepSeek Flash through @byokit/decide's pi
// backend, Haiku as its fallback) on the OpenAI wire the app's OpenRouter route already speaks. Its own
// log is the proof that a card on screen came from a real model answer, so the run keeps it with the
// captures and names every answer's model.
const piPort = Number(process.env.PI_WRITER_PORT ?? 18761);
let piWriter = null;
const startPiWriter = async () => {
  const logFile = `${root}/verify-artifacts/${task}/pi-writer.log`;
  mkdirSync(`${root}/verify-artifacts/${task}`, { recursive: true });
  piWriter = spawn('node', [`${root}/mobile/e2e/pi-writer.mjs`, 'serve', String(piPort), logFile], { cwd: root, stdio: 'inherit', env: process.env });
  await until(`the host pi writer on :${piPort}`, async () => {
    try { return (await fetch(`http://127.0.0.1:${piPort}/api/v1/models`, { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; }
  }, { seconds: 20, every: 500 });
  log(`real writer route on the host: decide pi backend on :${piPort} (the app reaches it at 10.0.2.2:${piPort})`);
  return logFile;
};
/** Every card leg needs its wording from a real model answer: read the host writer's own log. */
const checkPiAnswers = logFile => {
  const lines = readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
  const answered = lines.filter(line => line.includes('answered model='));
  const primary = answered.filter(line => line.includes(`model=${process.env.PI_MODEL || 'deepseek/deepseek-flash'}`));
  const asked = lines.filter(line => line.includes(' ask model='));
  writeFileSync(`${root}/verify-artifacts/${task}/pi-writer-summary.txt`, [
    `asks: ${asked.length}`, `answers: ${answered.length}`, `primary answers: ${primary.length}`, '', ...lines,
  ].join('\n') + '\n');
  if (!primary.length) throw new Error(`The host writer answered no ask with DeepSeek Flash (${answered.length} answers).`);
  log(`real writer route: ${asked.length} asks, ${answered.length} answers, ${primary.length} on DeepSeek Flash`);
};
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
const shot = (screen, label, theme) => evidence('shot', task, screen, label, theme);
// On a failed wait, keep the screen and its accessible text (the key masked) under failures/.
let failures = 0;
const screenDump = what => {
  const dir = `${root}/verify-artifacts/${task}/failures`;
  const name = `${++failures}-${what.replace(/\W+/g, '-').slice(0, 48)}`;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${name}.png`, png());
    const focus = adb('shell', 'dumpsys', 'window').match(/mCurrentFocus=.*/)?.[0] ?? 'unknown focus';
    const seen = nodes().map(n => `${n.editable ? 'E' : '-'}${n.clickable ? 'C' : '-'}${n.focused ? 'F' : '-'} ${n.app} lbl="${n.label ?? ''}" txt="${n.text ?? ''}" ${JSON.stringify(n.bounds)}`).join('\n');
    writeFileSync(`${dir}/${name}.txt`, `${focus}\n${seen}\n`.replaceAll(key, '<key>'));
    return `Screen: ${dir}/${name}.png`;
  } catch (error) { return `Screen dump failed: ${String(error.message).slice(0, 120)}`; }
};
// Every screen read waits on its condition: poll `read` until it returns something truthy (a read
// that throws, such as a probe caught mid-transition, counts as not yet), and on timeout dump the
// screen and name what never showed.
const until = async (what, read, { seconds = 30, every = 600 } = {}) => {
  const end = Date.now() + seconds * 1000;
  let last = '';
  for (;;) {
    try { const value = await read(); if (value) return value; } catch (error) { last = String(error.message).replaceAll(key, '<key>').slice(0, 200); }
    if (Date.now() >= end) break;
    await wait(every);
  }
  throw new Error(`Timed out after ${seconds}s waiting for ${what}${last ? ` (last read error: ${last})` : ''}. ${screenDump(what)}`);
};
// An accessibility click by exact label, retried until the probe reports the click landed.
const click = (label, seconds = 20) => until(`a clickable "${label}"`, () => { nodes(label); return true; }, { seconds });
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
const sizeNow = () => {
  const out = adb('shell', 'wm', 'size');
  const match = out.match(/Override size: (\d+)x(\d+)/) ?? out.match(/Physical size: (\d+)x(\d+)/);
  return [Number(match[1]), Number(match[2])];
};

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
// Stop the app with kill -9, never am force-stop; rebind() then brings the service (and its process) back.
const pidOf = () => { try { return adb('shell', 'pidof', pkg).trim(); } catch { return ''; } };
const killApp = async () => {
  const pids = pidOf().split(/\s+/).filter(Boolean);
  // am force-stop ends the app's processes without root (the Play image has no su); rebind then restores the service.
  if (pids.length) adb('shell', 'am', 'force-stop', pkg);
  // The system may start a fresh process for the service at once; only the killed ones must be gone.
  await until('the killed Ownvoice process to end', () => !pidOf().split(/\s+/).some(pid => pids.includes(pid)), { seconds: 10, every: 300 });
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
  await until('the Ownvoice service to bind after the toggle', () => adb('shell', 'dumpsys', 'accessibility').includes(component), { seconds: 20 });
};

// Dismiss Chrome's ANR dialog and first-run sheets under host load until the URL bar shows x.com
// and the page shows `need` (each fixture case has its own phrase, so the last leg's page never
// passes). Chrome can drop the VIEW intent across a display-size change, so ask for the page again
// now and then.
const settleChrome = async (need, url = 'https://x.com/x.html') => {
  let polls = 0;
  await until(`Chrome to show "${need}" with x.com in its URL bar`, async () => {
    const all = nodes();
    const text = screenText();
    if (all.some(node => node.text?.includes('x.com')) && (text.includes(need) || all.some(n => `${n.text ?? ''} ${n.label ?? ''}`.toLowerCase().includes(need)))) return true;
    const [wide, high] = sizeNow();
    if (text.includes("isn't responding") || text.includes('not responding')) {
      const row = ocrLine('wait');
      if (row) tap(Number(row[6]) + Number(row[8]) / 2, Number(row[7]) + Number(row[9]) / 2);
    } else if (text.includes('enhanced ad privacy')) { // a Chrome update wedges this sheet over the flow; a clear restarts the known walk
      adb('shell', 'pm', 'clear', 'com.android.chrome');
      await wait(1000);
      adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url);
    } else if (text.includes('zoom in or out')) { // Chrome's banner after a system font-scale change
      const row = ocrLine('zoom in or out');
      if (row) for (const dy of [-10, 0, 12]) tap(wide - 25, Number(row[7]) + Number(row[9]) / 2 + dy);
    } else if (text.includes('welcome to chrome') || text.includes('use without an account')) { // Chrome first-run screen
      const skip = nodes().find(node => node.text && /use without|no thanks|skip/i.test(node.text));
      tap(...(skip ? center(skip) : [wide * 473 / 1080, high * 1458 / 2400]));
    } else if (text.includes('notifications make things')) {
      const no = nodes().find(node => node.clickable && /no thanks|not now|don.t allow/i.test(`${node.text ?? ''} ${node.label ?? ''}`));
      tap(...(no ? center(no) : [wide * 643 / 1080, high * 1751 / 2400]));
    } else if (++polls % 15 === 0) {
      // Chrome with no accessible nodes at all has lost its tree: restart it on the page.
      if (!all.some(n => n.app === 'com.android.chrome')) adb('shell', 'am', 'force-stop', 'com.android.chrome');
      adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url);
    }
    return false;
  }, { seconds: 180, every: 1500 });
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
// The emulator and its AVD are shared: a sibling run that died inside the extreme leg leaves
// 720x1280 at density 320 and font scale 1.3 behind, and at that size the welcome title sits
// below the fold, where the OCR wait can never see it. Normalize before the setup walk.
setExtreme(false);
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
log(`setup: finished with no writer; choosing ${writer === 'opencode' ? 'OpenCode Go' : writer === 'pi' ? 'OpenRouter (host pi writer)' : 'OpenRouter'} on the writer list.`);

const onScreen = phrase => nodeText().includes(phrase.toLowerCase());
const scrollWriterList = async phrase => {
  for (let i = 0; i < 8 && !onScreen(phrase); i++) {
    adb('shell', 'input', 'swipe', String(width / 2), String(height * .7), String(width / 2), String(height * .3), '300');
    await wait(1200);
  }
};
// The key field shows its label as a placeholder: tap the editable carrying it (or the label over
// it), wait until the keyboard opens on it, then type. The field masks the key, so it is never read back.
const pasteKey = async label => {
  const want = label.toLowerCase();
  const target = await until(`the "${label}" field`, () => {
    const all = nodes();
    return all.find(n => n.editable && `${n.text ?? ''} ${n.label ?? ''}`.toLowerCase().includes(want)) ?? all.find(n => `${n.text ?? ''} ${n.label ?? ''}`.toLowerCase().includes(want));
  });
  tap(...center(target));
  // The probe can read no nodes while the keyboard is up, so the system's own keyboard state is the focus signal.
  await until(`the keyboard on the "${label}" field`, () => /mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method')), { seconds: 15 });
  type(`'${key}'`);
  if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) adb('shell', 'input', 'keyevent', '4');
  await until('the keyboard to close after the key', () => !/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method')), { seconds: 10 });
};
// The app asks which one writes right after an account connects: search that account's own list for PICK_MODEL
// (an explicit model id, never openrouter/auto) and tap the row.
const pickModel = async () => {
  const want = process.env.PICK_MODEL;
  if (!want || /^openrouter\/auto$/.test(want)) throw new Error('Set PICK_MODEL to the explicit model id to pick from the list.');
  await waitForLine('search the list', 90);
  const field = await until('the model search field', () => nodes().find(n => `${n.text ?? ''} ${n.label ?? ''}`.toLowerCase().includes('search the list')));
  tap(...center(field));
  await until('the keyboard on the model search', () => /mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method')), { seconds: 15 });
  type(`'${want.replace(/ /g, '%s')}'`);
  if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) adb('shell', 'input', 'keyevent', '4');
  await until('the keyboard to close', () => !/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method')), { seconds: 10 });
  if (!(await tapButton(want.toLowerCase()))) throw new Error(`No row for ${want} in the list.`);
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
  if (!(await tapButton('connect'))) log('the Connect control did not read as clickable; waiting for the result anyway');
  await pickModel();
  // The kit saves the key and the app redraws the card: wait on that line as a condition, not a fixed count.
  await until('the OpenRouter connect result', () => {
    const text = nodeText();
    if (/openrouter is connected/.test(text)) return true;
    if (/not accepted/.test(text)) return 'refused';
    return false;
  }, { seconds: 120, every: 1000 });
  if (/not accepted/.test(nodeText())) throw new Error('OpenRouter rejected the key.');
};
// OpenCode Go: the plan-key route from PR 209, connected with the desktop login's own key through
// the app's connect field. The key is never printed, logged or written; the app masks it and keeps
// it only in its secure store.
const connectOpenCode = async () => {
  // The same walk as the live-proven e2e/opencode-proof.mjs: card, key field, Connect, workspace pick.
  const findText = label => nodes().find(n => `${n.label} ${n.text}`.toLowerCase().includes(label));
  const words = () => nodes().map(n => n.text || n.label).filter(Boolean).join(' | ').replaceAll(key, '<key>').slice(0, 600);
  const waitText = (labels, seconds = 40) => until(`"${labels.join('" or "')}" on the OpenCode Go connect screen`, () => labels.map(findText).find(Boolean), { seconds });
  const tapText = async (label, seconds = 20) => tap(...center(await waitText([label], seconds)));
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source', pkg);
  await waitText(['how ownvoice writes'], 30);
  for (let i = 0; i < 5 && !findText('with your opencode go'); i++) {
    adb('shell', 'input', 'swipe', String(width / 2), String(height * .7), String(width / 2), String(height * .3), '300');
    await wait(1200);
  }
  await tapText('with your opencode go');
  await pasteKey('paste your opencode go key');
  await tapText('connect', 20);
  // The connect result is read fresh: the connected line wins over any earlier read of the screen. A key that
  // works with several workspaces shows the kit's pick instead; only then is the workspace tapped. Either
  // wait fails after 20 s with a screenshot of what is on screen.
  const seen = await waitText(['more than one workspace', 'search the list', 'opencode go is connected', 'not accepted'], 40);
  if (`${seen.label} ${seen.text}`.toLowerCase().includes('not accepted')) throw new Error(`OpenCode Go rejected the key. On screen: ${words()}`);
  await wait(1500);
  if (findText('not accepted')) throw new Error(`OpenCode Go rejected the key. On screen: ${words()}`);
  if (!findText('opencode go is connected') && !findText('search the list')) {
    await until('the connected line, the model list or the workspace pick', () => findText('opencode go is connected') || findText('search the list') || findText('more than one workspace'), { seconds: 20, every: 1200 });
  }
  if (!findText('opencode go is connected') && !findText('search the list')) {
    const pick = await until(`the "${goWorkspace}" workspace in the pick`, () => {
      const node = nodes().find(n => (n.text || n.label || '').trim() === goWorkspace);
      if (!node) adb('shell', 'input', 'swipe', String(width / 2), String(height * .7), String(width / 2), String(height * .3), '300');
      return node;
    }, { seconds: 20, every: 1200 });
    log(`workspace pick: ${goWorkspace}`);
    tap(...center(pick));
    await waitText(['search the list'], 60);
  }
  // Connected, the app asks which one writes: pick from the plan's own list.
  await pickModel();
  await waitText(['opencode go is connected'], 60);
  log("openCode Go writer connected through the app's own connect field.");
};
// A refusal leg makes no writer call, but the run still connects the live writer first: the
// read-list check means something only when a writer could have answered and the newest row
// carries no "Sent to your AI account" mark.
const refusalOnly = process.env.X_REPLIES_LEGS === 'refusal';
const refusedOnly = process.env.X_REPLIES_LEGS === 'refused';
// X_REPLIES_LEGS=rewrite-refused: only the rewrite sheet's refusal, light and dark. The sheet opens on the same
// PROCESS_TEXT intent as the selection menu, so no page (and no X host) is needed; the reply cards need X.
const rewriteOnly = process.env.X_REPLIES_LEGS === 'rewrite-refused';
if (writer === 'opencode') await connectOpenCode();
else await connectOpenRouter();
log(`setup finished (live ${writer === 'opencode' ? 'OpenCode Go' : writer === 'pi' ? 'DeepSeek Flash through the host pi writer' : 'OpenRouter'} writer connected${refusalOnly ? '; refusal legs only, no writer call' : ''}).`);

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
// The rewrite-only refused mode opens no page: its sheet runs on the process-text intent, not Chrome.
if (process.env.X_REPLIES_LEGS !== 'rewrite-refused') {
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'https://x.com/x.html');
  await settleChrome('reply flow end to end today');
  log('fixture loaded in Chrome.');
  const urlBar = await until('the URL bar to read x.com (platform detection reads it)', () => nodes().find(node => node.text?.includes('x.com')), { seconds: 15 });
  log(`URL bar: ${urlBar.text}`);
}

// ---- the reply journey: focus composer, tap bubble, cards, edit, insert ----
// A poll that clears any ANR dialog every fourth try while it waits.
const clearingAnr = read => { let polls = 0; return () => read() || (++polls % 4 === 0 && dismissAnr() && null); };
const findBubble = clearingAnr(() => nodes().find(node => node.windowType === 4 && /^Ownvoice(?:,|$)/.test(node.label)));
// After a kill -9 the service may not come back from one toggle (see AGENTS.md on rebinding). Record
// the state that left the bubble missing, then toggle once more and say so, so the evidence shows it.
let missingBubbles = 0;
const bubble = async () => {
  try { return await until('the accessible Ownvoice bubble', findBubble, { seconds: 20, every: 500 }); }
  catch (error) {
    const n = ++missingBubbles;
    const dir = `${root}/verify-artifacts/${task}/missing-bubble-${n}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/state.txt`, [
      `pids: ${pidOf() || 'none'}`,
      `enabled: ${adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim()}`,
      `accessibility_enabled: ${adb('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim()}`,
      ...adb('shell', 'dumpsys', 'window').split('\n').filter(l => /mCurrentFocus|mFocusedApp/.test(l)).map(l => l.trim()),
      ...adb('shell', 'dumpsys', 'accessibility').split('\n').filter(l => /ownvoice|Bound services|Enabled services|Crashed/i.test(l)).map(l => l.trim().slice(0, 400)),
    ].join('\n') + '\n');
    writeFileSync(`${dir}/logcat.txt`, adb('logcat', '-d', '-s', 'OwnvoiceNative:V', 'AndroidRuntime:E', 'ActivityManager:I', 'AccessibilityManagerService:V'));
    log(`bubble missing after 20s (${error.message.split('.')[0]}); state saved in ${dir}; toggling the service once more`);
    await rebind();
    return until('the accessible Ownvoice bubble after a second toggle', findBubble, { seconds: 45, every: 500 });
  }
};
const composerNode = all => all.find(node => node.editable && !node.password && !/x\.com|https?:|secure|find an app/i.test(`${node.text ?? ''} ${node.label ?? ''}`));
const field = () => until('the composer field', clearingAnr(() => composerNode(nodes())), { seconds: 30, every: 500 });
// Tap the composer until Chrome reports it focused, so the bubble's tap reads this box.
const focusComposer = () => until('focus in the composer', () => {
  const box = composerNode(nodes());
  if (box?.focused) return true;
  if (box) tap(...center(box));
  return false;
}, { seconds: 20, every: 1200 });
const panelButton = async (name, tries = 120) => {
  const start = Date.now();
  let read = false; // a miss counts only from a screen that was actually read
  for (let attempt = 0; attempt < tries; attempt++) { // polling for the cloud writer round-trip
    let all = [];
    try { all = nodes(); read = true; } catch { /* a probe caught mid-transition: read again */ }
    const node = all.find(node => node.clickable && (node.text === name || node.label === name));
    if (node) { const elapsed = Date.now() - start; if (elapsed > 1000) log(`${name} found after ${Math.round(elapsed / 1000)}s`); return node; }
    await wait(500);
  }
  if (!read) throw new Error(`The screen could not be read while looking for "${name}". ${screenDump(name)}`);
  return null;
};
const panelText = phrase => nodes().some(node => `${node.text} ${node.label}`.includes(phrase));
// Wait for a reply card's Edit control, but stop early the moment the panel plainly says the writer
// could not write — a refusal should not cost the full card wait on every leg.
const waitEditOrRefusal = async (tries = 120) => {
  for (let attempt = 0; attempt < tries; attempt++) {
    let all = [];
    try { all = nodes(); } catch { /* a probe caught mid-transition: read again */ }
    const node = all.find(n => n.clickable && (n.text === 'Edit' || n.label === 'Edit'));
    if (node) return node;
    const panel = all.map(n => (n.text || n.label || '').trim()).filter(Boolean).join(' | ');
    if (attempt > 8 && (WRITER_REFUSAL.test(panel) || panel.includes('Reply ideas are unavailable'))) return null;
    await wait(500);
  }
  return null;
};
// Click the edit row's action — the one sharing its line with the edit row's Cancel, never
// another card's. The sheet scrolls its buttons above the open keyboard first.
const insertViaProbe = async label => {
  let hidKeyboard = false;
  for (let attempt = 0; attempt < 8; attempt++) {
    if (attempt === 2 && !hidKeyboard) { adb('shell', 'input', 'keyevent', '111'); hidKeyboard = true; await wait(800); }
    let all;
    try { all = nodes(); } catch { await wait(700); continue; } // a probe caught mid-transition: read again
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
    if (button) { await click(label, 10); return; }
    const [wide] = sizeNow();
    adb('shell', 'input', 'swipe', String(Math.round(wide / 2)), String(Math.round(imeTop - 60)), String(Math.round(wide / 2)), String(Math.round(Math.max(imeTop - 260, 60))), '300');
    await wait(700);
  }
  throw new Error(`Could not bring the edit row's ${label} above the keyboard to click it. ${screenDump(`edit row ${label}`)}`);
};
const openFixture = async (query, need = 'shipped') => {
  // The Chrome command line maps x.com on every launch; re-assert it in case a restart cleared it.
  adb('shell', `echo '_ --host-resolver-rules="MAP x.com 10.0.2.2:${PORT}" --ignore-certificate-errors' > /data/local/tmp/chrome-command-line`);
  const url = `https://x.com/x.html${query ?? ''}`;
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url);
  await settleChrome(need, url);
};

const EDIT_SUFFIX = 'Typed by me, in my own words';
const TYPED = 'This shipped so well';
const verifyFixtureLive = async () => {
  if (!page.address()) throw new Error('Fixture server not listening (dead server).');
  await openFixture('');
  await field();
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
  const copyButton = await until('the card\'s Copy control', () => nodes().find(n => n.clickable && /^(copy|copied)$/i.test((n.label ?? n.text ?? '').trim())), { seconds: 15 });
  tap(...center(copyButton));
  // The tick shows before the copy closes the panel, so poll fast and shoot the moment it shows.
  const tick = await until('the Copied tick', () => nodes().some(n => /copied/i.test(`${n.label ?? ''} ${n.text ?? ''}`)), { seconds: 8, every: 200 }).catch(error => { log(error.message); return false; });
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
// ---- F6a: the X card labels, and the outcome record a confirmed insert must write ----
// What each X reply card is for (Panel.tsx TAGS.x); the writer's text on a card must match the
// label the card shows. Judged in plain words, independent of the app's own guard.
const preflightOnly = process.env.X_REPLIES_LEGS === 'preflight';
const X_TAGS = ['agree', 'push back, kindly', 'ask a question'];
const LEVELS = ['Likely to be skipped', 'Might get a reply', 'Good fit here', 'Strong fit here'];
const opensAgree = /^(?:yes|yeah|yep|yup|sure|okay|ok|definitely|absolutely|of course|sounds good|works for me|happy to|gladly|will do|no problem|consider it done)\b/i;
const opensDecline = /^(?:no|nope|nah|sorry|afraid|unfortunately|can'?t|won'?t|couldn'?t|not able|never)\b/i;
// Read the cards as (label, text) in reading order: a tag line opens a card; a fit level is a
// label; the longest remaining text on the card is its reply.
const readCards = () => {
  const panel = nodes().filter(n => (n.text || n.label || '').trim())
    .sort((a, b) => a.bounds[1] - b.bounds[1] || a.bounds[0] - b.bounds[0]);
  const cards = [];
  let current = null;
  for (const n of panel) {
    const text = (n.text || '').trim();
    if (X_TAGS.includes(text.toLowerCase())) { current = { tag: text, texts: [], fit: null }; cards.push(current); continue; }
    if (!current) continue;
    if (!current.fit && LEVELS.includes((n.label || '').trim())) { current.fit = n.label.trim(); continue; }
    if (text && !/^(edit|insert|copy|copied|why\?|use this|write new ones|share this text|open in x.*|post|reply)$/i.test(text)) current.texts.push(text);
  }
  for (const c of cards) c.text = c.texts.sort((a, b) => b.length - a.length)[0] ?? '';
  return cards;
};
const judgeCard = card => {
  const t = card.text.trim();
  const tag = card.tag.toLowerCase(); // the panel shows its tags in capitals
  if (!t) return 'no text';
  if (tag === 'agree') return opensDecline.test(t) ? `MISMATCH: an Agree card declines ("${t}")` : 'ok';
  if (tag === 'push back, kindly') return opensAgree.test(t) && !opensDecline.test(t) ? `MISMATCH: a Push back card agrees ("${t}")` : 'ok';
  if (tag === 'ask a question') return /\?/.test(t) ? 'ok' : 'ok (no question mark)';
  return 'ok';
};
// The app's own SQLite store, read with su (never a mock): the insert's outcome record lives under
// the key reply-outcomes at /data/data/<pkg>/files/SQLite/ExpoSQLiteStorage.
const outcomeDir = () => { const dir = `${root}/verify-artifacts/${task}/outcome`; mkdirSync(dir, { recursive: true }); return dir; };
const readOutcomeStore = () => {
  const dir = outcomeDir();
  const local = join(dir, 'outcomes.sqlite');
  // A killed process leaves its last writes in the write-ahead log: copy it beside the file so sqlite replays it.
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(local + suffix, { force: true });
    try { writeFileSync(local + suffix, execFileSync('adb', ['-s', serial, 'exec-out', 'su', '0', 'cat', `/data/data/${pkg}/files/SQLite/ExpoSQLiteStorage${suffix}`], { maxBuffer: 24 * 1024 * 1024 })); }
    catch (error) { if (!suffix) throw error; }
  }
  const out = execFileSync('python3', ['-c', `import sqlite3,json,sys\nc=sqlite3.connect(sys.argv[1])\nprint(json.dumps(dict(c.execute('select key,value from storage'))))`, local], { encoding: 'utf8' });
  return JSON.parse(out);
};
// The outcome the insert wrote must read back the way a person reads it: on the app's own
// "Replies you inserted" screen, and in its store.
const readBackOutcome = async (screen, theme) => {
  const rows = await until('an outcome row in the app\'s store', () => { const read = JSON.parse(readOutcomeStore()['reply-outcomes'] ?? '[]'); return read.length && read; }, { seconds: 15, every: 1000 });
  const last = rows[rows.length - 1];
  const dir = outcomeDir();
  writeFileSync(join(dir, `record-${screen}-${theme}.json`), JSON.stringify({ record: last ?? null, rows: rows.length }, null, 2) + '\n');
  if (!last || last.card !== 'suggestion' || last.platform !== 'x') throw new Error(`The insert wrote no suggestion outcome record for X (got ${JSON.stringify(last ?? null)}).`);
  if (!Number.isFinite(last.at) || last.at <= 0) throw new Error('The outcome record carries no insert time.');
  if (last.level !== null && !LEVELS.includes(last.level)) throw new Error(`The outcome record's level is not a shown fit level: ${JSON.stringify(last.level)}.`);
  const readScreen = () => nodes().map(n => `${n.text ?? ''} ${n.label ?? ''}`.trim()).filter(Boolean).join(' | ');
  // A running app can take the link without routing ("current task has been brought to the front"), so ask again each try.
  const seen = await until('"Suggestion · X" on the "Replies you inserted" screen', () => {
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://reads');
    const text = readScreen(); return /Suggestion · X/.test(text) && text;
  }, { seconds: 20, every: 2000 });
  shot(screen, 'outcome-reads', theme);
  adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  writeFileSync(join(dir, `read-screen-${screen}-${theme}.txt`), seen + '\n');
  log(`${screen}/${theme}: outcome record read back from the store and the app's own read screen (${last.platform}/${last.card}, level ${JSON.stringify(last.level)}, at ${last.at}).`);
};
// The plain sentences the panel shows when the cloud writer could not answer; a grounded journey is
// never expected to show these, so their presence means the writer refused (limit, auth, fallback).
const WRITER_REFUSAL = /didn't answer|turned off|get this phone ready|limit reached|can't write|could not be reached|couldn't be reached|not accepted/i;
const journey = async (screen, theme, { motion = false, copy = false, postShot = false } = {}) => {
  await verifyFixtureLive();
  if (postShot) shot(screen, 'post', theme); // the longest text the screen shows, before any panel
  await field();
  await focusComposer();
  const record = motion ? `${screen}-tap-to-inserted` : null;
  if (motion) evidence('motion-start', task, record);
  try {
    tap(...center(await bubble()));
    const editCard = await waitEditOrRefusal(240); // room for the live cloud writer round-trip
    if (!editCard) {
      shot(screen, 'nocard', theme);
      const panel = nodes().map(n => (n.text || n.label || '').trim()).filter(Boolean).join(' | ').slice(0, 600);
      log(`no Edit card: withhold=${panelText('Reply ideas are unavailable')} xPlat=${panelText('X')} nodes=${nodes().length}`);
      log(`panel text: ${panel}`);
      log(`screen: ${screenText().slice(0, 300)}`);
      log(`app pids: ${pidOf().trim() || 'none'}; ${adb('shell', 'dumpsys', 'window').split('\n').filter(l => /mCurrentFocus|mFocusedApp/.test(l)).join(' ').trim()}`);
      log(`service: ${adb('shell', 'dumpsys', 'accessibility').split('\n').filter(l => /ownvoice/i.test(l)).map(l => l.trim().slice(0, 200)).join(' ; ')}`);
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
    await until('the panel to name the X platform', () => panelText('X'), { seconds: 10 });
    if (panelText('Reply ideas are unavailable')) throw new Error('The withhold note showed on a grounded post.');
    shot(screen, 'cards', theme);
    // The F6a wording check: every card's text must match the label the card shows.
    const cards = await until('labelled reply cards', () => { const read = readCards(); return read.length && read; }, { seconds: 15 });
    const judged = cards.map(card => ({ ...card, verdict: judgeCard(card) }));
    mkdirSync(`${root}/verify-artifacts/${task}`, { recursive: true });
    writeFileSync(`${root}/verify-artifacts/${task}/${screen}-cards-${theme}.json`, JSON.stringify(judged, null, 2) + '\n');
    for (const c of judged) log(`card "${c.tag}" [${c.verdict}] fit=${c.fit ?? 'none'}: ${c.text}`);
    const mismatches = judged.filter(c => c.verdict.startsWith('MISMATCH'));
    if (mismatches.length) throw new Error(`${mismatches.length} reply card(s) do not match their label: ${mismatches.map(m => m.verdict).join(' ; ')}`);
    if (preflightOnly) { log(`PREFLIGHT ${screen}/${theme}: the writer answered with grounded, label-true reply cards.`); return; }
    if (copy) {
      await copyLeg(screen, theme);
      // Copy closes the panel (the native copy finishes it), so reopen it from the bubble for the edit.
      tap(...center(await bubble()));
      if (!(await waitEditOrRefusal(240))) throw new Error('No card with an Edit button after reopening the panel.');
    }
    const firstCard = nodes().find(node => node.clickable && node.text && node.text.length > 10);
    const originalCardText = firstCard?.text?.trim() || '';
    // Click the first card's Edit until its edit field (the panel's own text box) shows.
    const editOpen = () => nodes().some(n => n.editable && n.app === pkg);
    await until("the first card's edit field", () => editOpen() || (nodes('Edit'), false), { seconds: 30, every: 1000 });
    adb('shell', 'input', 'text', EDIT_SUFFIX.replaceAll(' ', '%s'));
    await until('the typed words in the edit field', () => nodes().some(n => n.editable && n.app === pkg && n.text?.includes(EDIT_SUFFIX)), { seconds: 15 });
    shot(screen, 'editing', theme);
    adb('logcat', '-c'); // a fresh buffer, so the line read below is this insert's own result
    await insertViaProbe('Insert');
    // The app logs its own insert check (verify detail at debug, the result at info) as it shows the
    // pill, which lives four seconds: wait for that line, then shoot at once.
    const insertLog = () => adb('logcat', '-d', '-s', 'OwnvoiceNative:D', 'OwnvoiceService:I');
    const logcat = await until('the app\'s insert result in the log', () => { const out = insertLog(); return /insert result /.test(out) && out; }, { seconds: 30, every: 250 });
    shot(screen, 'inserted-panel', theme);
    mkdirSync(`${root}/verify-artifacts/${task}`, { recursive: true });
    writeFileSync(`${root}/verify-artifacts/${task}/${screen}-insert-log-${theme}.txt`, logcat);
    const result = logcat.match(/insert result [^\n]*/g).join(' ; ');
    log(`${screen}/${theme}: ${result}`);
    const ocrPill = () => { try { return execFileSync('tesseract', [`${root}/verify-artifacts/${task}/${screen}-inserted-panel-${theme}.png`, 'stdout'], { encoding: 'utf8' }); } catch { return ''; } };
    const pill = /send.{0,4}yourself/i;
    const pillShown = pill.test(ocrPill()) || nodes().some(node => pill.test(`${node.text} ${node.label}`));
    adb('shell', 'input', 'keyevent', '111');
    if ((await panelButton('Insert', 4)) || (await panelButton('Edit', 4))) await click('Close');
    shot(screen, 'inserted', theme);
    if (!/insert result ok=true/.test(logcat)) throw new Error(`The insert read-back check did not pass: ${result}`);
    if (!pillShown) throw new Error('The "Inserted. Send it yourself." confirmation is not visible.');
    const boxText = await until(`the edit suffix "${EDIT_SUFFIX}" read back from Chrome's editable composer`, () => {
      const text = nodes().find(node => node.editable && node.app === 'com.android.chrome' && `${node.text ?? ''} ${node.label ?? ''}`.includes(EDIT_SUFFIX))?.text;
      return text?.includes(EDIT_SUFFIX) && text;
    }, { seconds: 30 });
    if (originalCardText && boxText.trim() === originalCardText) throw new Error('The inserted text equals the unedited card text: the edit did not change it.');
    await readBackOutcome(screen, theme);
    log(`${screen}/${theme}: cards + label check + edit + insert + confirmation + read-back + outcome record OK.`);
  } finally {
    if (motion) { try { evidence('motion-stop'); } catch (error) { log(`motion-stop: ${error.message}`); } }
  }
};

// ---- the refusal legs: a plain note, no card, and no writer request on the way ----
// The app's own read list ("What Ownvoice read", ownvoice://reads) is where it records what each
// tap did: the newest Chrome row carries "Sent to your AI account" only once a cloud writer
// answered, so a refusal leg must show that row without the mark. Rows are newest first.
const newestReadBlock = async () => {
  // A running app can take the link without routing (seen at the extreme display size), so route
  // while the list is not up. Once it is, the newest Chrome row can still sit below the fold — the
  // "Replies you inserted" block grows above the tap rows at the extreme size — so scroll down
  // until one shows. The scroll step is smaller than the screen, so the newest row is seen before
  // any older one (rows are newest first).
  return until('a Chrome row on the read list', () => {
    const texts = nodes().map(n => `${n.text ?? ''}\n${n.label ?? ''}`.trim()).filter(Boolean);
    // The title can be omitted from the accessibility tree while a clipped row is becoming visible.
    // Prefer the actual newest Chrome row; re-routing on a missing title resets the scroll each poll.
    const first = texts.findIndex(text => /in Chrome\b/i.test(text));
    if (first >= 0) return texts.slice(first, first + 3).join(' | ');
    if (!texts.some(text => /what ownvoice read/i.test(text))) {
      adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://reads');
      return false;
    }
    const [w, h] = sizeNow();
    adb('shell', 'input', 'swipe', String(w / 2), String(h * .8), String(w / 2), String(h * .45), '300');
    return false;
  }, { seconds: 30, every: 1500 });
};
// Every refusal surface shows a plain note and no card. `note` is the exact sentence the shipped
// panel shows there; the leg prints it into its own evidence file, never only into this log.
const withhold = async (screen, theme, { query, need, note }) => {
  if (!page.address()) throw new Error('Fixture server not listening (dead server).');
  await openFixture(query, need);
  await field();
  // The fixture composer is in the accessibility tree first; give Chrome's compositor a beat so the
  // fixture shot shows the screen a person saw (the dark pass otherwise caught an unpainted page).
  await wait(2500);
  shot(screen, 'fixture', theme); // what the screen shows before the tap: nothing readable above the box
  adb('shell', 'logcat', '-c');
  await focusComposer();
  tap(...center(await bubble()));
  await until(`the plain note "${note}" on ${screen}/${theme}`, () => panelText(note), { seconds: 20 });
  if (await panelButton('Edit', 8)) throw new Error(`A card appeared on ${screen}/${theme}.`);
  for (const action of ['Insert', 'Use this', 'Write new ones', 'Why?']) {
    if (await panelButton(action, 1)) throw new Error(`The card action "${action}" appeared on ${screen}/${theme}.`);
  }
  shot(screen, 'withheld', theme);
  const panel = nodes().map(n => (n.text || n.label || '').trim()).filter(Boolean).join(' | ').slice(0, 1200);
  await click('Close');
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
const LABELS_ONLY = { query: '?case=labels', need: 'everyone can reply', note: 'Write one line about what your post is about' };

// A failed earlier run can leave its recording marker behind; clear it so motion-start is honest.
for (const stale of ['.motion.pid', '.motion.out']) rmSync(`${root}/verify-artifacts/${task}/${stale}`, { force: true });

// X_REPLIES_LEGS=refused: the plan key's gateway refuses the request (the build's 403 stand-in, no request
// leaves the emulator). The reply panel and the rewrite sheet must both say so by name, with the next step,
// and never show a card, a generic line or a vague rating.
const REFUSED = 'OpenCode Go refused this account. Connect it again, or pick another writer.';
const refusedLeg = async (screen, theme) => {
  await verifyFixtureLive();
  await field();
  await focusComposer();
  tap(...center(await bubble()));
  await until(`the refusal line on ${screen}/${theme}`, () => panelText(REFUSED), { seconds: 120 });
  if (await panelButton('Edit', 2)) throw new Error(`A card appeared on ${screen}/${theme}.`);
  if (panelText("didn't answer") || panelText('Reply ideas are unavailable')) throw new Error(`A generic or withhold line showed on ${screen}/${theme}.`);
  if (!(await panelButton('Choose another writer', 4))) throw new Error(`No "Choose another writer" button on ${screen}/${theme}.`);
  shot(screen, 'refused', theme);
  log(`${screen}/${theme}: the panel names the refused writer and offers another`);
};
const REWRITE_SELECTED = 'I think we should move the call to Tuesday. Really.';
const rewriteRefused = async theme => {
  // The selection menu's rewrite, opened on the process-text intent the way the rewrite proof opens it.
  adb('shell', 'am', 'start', '-n', `${pkg}/dev.ownvoice.bridge.RewriteActivity`, '-a', 'android.intent.action.PROCESS_TEXT', '-t', 'text/plain', '--es', 'android.intent.extra.PROCESS_TEXT', REWRITE_SELECTED);
  const chip = await until('the Shorter choice on the rewrite sheet', () => nodes().find(n => n.clickable && (n.text === 'Shorter' || n.label === 'Shorter')), { seconds: 20 });
  tap(...center(chip));
  await until(`the refusal note on the rewrite sheet (${theme})`, () => panelText(REFUSED), { seconds: 120 });
  if (panelText("didn't answer") || panelText('Something went wrong')) throw new Error(`A generic line showed on the rewrite sheet (${theme}).`);
  if (!(await panelButton('Choose another writer', 4))) throw new Error(`No "Choose another writer" button on the rewrite sheet (${theme}).`);
  shot('x-rewrite', 'refused', theme);
  log(`rewrite sheet/${theme}: names the refused writer`);
};

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
function setExtreme(on) {
  adb('shell', 'settings', 'put', 'system', 'font_scale', on ? '1.3' : '1.0');
  adb('shell', 'wm', 'density', on ? '320' : 'reset');
  adb('shell', 'wm', 'size', on ? '720x1280' : 'reset');
}
const extreme = async on => {
  setExtreme(on);
  await until(`the display ${on ? 'at 720x1280' : 'back to its own size'}`, () => /Override size/.test(adb('shell', 'wm', 'size')) === on, { seconds: 15 });
  adb('shell', 'am', 'force-stop', 'com.android.chrome'); // Chrome reopens at the new size; the app is never force-stopped
};

try {
  const piLogFile = writer === 'pi' ? await startPiWriter() : null;
  if (refusedOnly) {
    await leg('refused-light', () => refusedLeg('x-refused', 'light'));
    await leg('refused-rewrite-light', () => rewriteRefused('light'));
    evidence('theme', 'dark');
    adb('shell', 'am', 'force-stop', 'com.android.chrome');
    await killApp();
    await rebind();
    await leg('refused-dark', () => refusedLeg('x-refused', 'dark'));
    await leg('refused-rewrite-dark', () => rewriteRefused('dark'));
  } else if (rewriteOnly) {
    await leg('refused-rewrite-light', () => rewriteRefused('light'));
    evidence('theme', 'dark');
    adb('shell', 'am', 'force-stop', 'com.android.chrome');
    await killApp();
    await rebind();
    await leg('refused-rewrite-dark', () => rewriteRefused('dark'));
  } else if (preflightOnly) {
    await leg('preflight', () => journey('x-preflight', 'light', {}), { needsWriter: true }); // stops after the label check
  } else {
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
  await killApp();
  await rebind();
  // The service restart's own lines, before a leg clears the log.
  writeFileSync(`${root}/verify-artifacts/${task}/dark-restart-logcat.txt`, adb('logcat', '-d', '-s', 'OwnvoiceNative:V', 'AndroidRuntime:E', 'ActivityManager:I', 'AccessibilityManagerService:V'));
  await leg('refusal-notext-dark', () => withhold('x-notext', 'dark', IMAGE_ONLY));
  await leg('refusal-labels-dark', () => withhold('x-labels', 'dark', LABELS_ONLY));
  if (!refusalOnly) await leg('dark', () => journey('x-reply', 'dark', {}), { needsWriter: true });

  // ---- extreme: narrowest supported screen + font scale 1.3 over the long post + quote ----
  // The extreme refusal leg runs in refusal-only runs too: it is the leg the refusal-only run is
  // for, and like every refusal leg it makes no writer call.
  await extreme(true);
  await leg('refusal-notext-extreme', () => withhold('x-notext-extreme', 'dark', IMAGE_ONLY));
  if (!refusalOnly) {
    adb('shell', 'am', 'force-stop', 'com.android.chrome');
    await leg('font-1.3', () => journey('x-extreme', 'dark', {}), { needsWriter: true });
  }
  await extreme(false);
  // The cards above came from the host writer's real model answers, not from a stand-in: record them.
  if (piLogFile) checkPiAnswers(piLogFile);
  }
} finally {
  // ---- restore ----
  try { writeFileSync(`${root}/verify-artifacts/${task}/leg-summary.txt`, summary.join('\n') + '\n'); } catch { /* keep the run's own error */ }
  try { setExtreme(false); } catch { /* the next run's setup resets the display too */ }
  adb('shell', 'rm', '-f', '/data/local/tmp/chrome-command-line');
  page.close();
  piWriter?.kill();
  rmSync(certDir, { recursive: true, force: true });
}

const failed = summary.filter(line => line.includes(': FAIL'));
log(`X reply proof complete. Evidence in ${root}/verify-artifacts/${task}/. Failed legs: ${failed.length}${writerRefused ? ' (writer refused)' : ''}`);
if (writerRefused) process.exitCode = 7;
else if (failed.length) process.exitCode = 1;

// Live platform-fit proof on X and Reddit through the wired grow panel on the owned emulator.
// Chrome is host-mapped so x.com and reddit.com both show a fictional post with the reply already in
// the field; the bubble is tapped and each `ownvoice-fit` device-log line (levels and probabilities,
// never text) is read. The writer is the real cloud writer connected through the app's own connect
// field: when OV_APK and OPENCODE_KEY_FILE are set the run installs the release APK (no stub flags),
// finishes setup, switches Chrome on in the app's own list and connects OpenCode Go (workspace
// OPENCODE_WORKSPACE, default Working2; the key is never printed, logged or screenshotted).
// Every call is recorded with its post, the levels or Not-sure reads with their plain reason lines,
// the tap-to-verdict latency and any error in results.jsonl; a call passes when every fit card on it
// shows a level with its one-line reason or the plain Not-sure read.
// Env: ANDROID_SERIAL=emulator-NNNN, OWNVOICE_AVD_NAME, JAVA_HOME, OV_APK (release APK for the
// setup+connect preamble), OPENCODE_KEY_FILE, OPENCODE_WORKSPACE; DARK=1 adds one dark capture per
// platform after the light run; NARROW=1 adds one capture at 720x1280 font 1.3. Args:
// <cases.json> [out-dir] [limit].
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { resolve } from 'node:path';
import { accessibilityProbe, center, emulatorName } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const avd = process.env.OWNVOICE_AVD_NAME;
if (avd && emulatorName(serial) !== avd) throw new Error(`Refusing ${serial}: AVD ${emulatorName(serial)} is not ${avd}.`);
const cases = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = resolve(process.argv[3] ?? 'e2e/artifacts/fit-live');
const limit = Number(process.argv[4] ?? 10);
mkdirSync(out, { recursive: true });
const PORT = 18613;
const HOSTS = { x: 'x.com', reddit: 'reddit.com' };
const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const nodes = accessibilityProbe(serial, out);
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const snap = name => writeFileSync(resolve(out, `${name}.png`), execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 24 * 1024 * 1024 }));
const tap = (x, y) => adb('shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y)));
const until = async (find, label, tries = 90) => {
  for (let i = 0; i < tries; i++) { const found = find(); if (found) return found; await wait(1000); }
  throw new Error(`Timed out waiting for ${label}.`);
};
const [width, height] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
const swipeUp = async () => { adb('shell', 'input', 'swipe', String(width / 2), String(height * .7), String(width / 2), String(height * .3), '300'); await wait(1200); };
// One word per input-text call: Gboard's composing session drops everything after a second space.
const type = async text => { for (const word of text.split(' ')) { adb('shell', 'input', 'text', word); adb('shell', 'input', 'keyevent', '62'); await wait(500); } };
const hideKeyboard = async () => { if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) { adb('shell', 'input', 'keyevent', '4'); await wait(900); } };
const findText = label => nodes().find(n => `${n.label} ${n.text}`.toLowerCase().includes(label.toLowerCase()));
const screenWords = () => nodes().map(n => n.text || n.label).filter(Boolean).join(' | ').slice(0, 300);
const waitText = async (labels, tries = 40) => {
  const wanted = Array.isArray(labels) ? labels : [labels];
  for (let i = 0; i < tries; i++) { const n = wanted.map(findText).find(Boolean); if (n) return n; await wait(1000); }
  throw new Error(`Could not see "${wanted.join('" or "')}" on screen: ${screenWords()}`);
};
const tapText = async (label, tries = 20) => tap(...center(await waitText(label, tries)));

// The plain reason line the panel shows under each level (ui/FitBar.tsx), so the run table carries
// what a person read, not just the level.
const LEVELS = ['Likely to be skipped', 'Might get a reply', 'Good fit here', 'Strong fit here'];
const GLOSS = ['Reads off-topic, or like bait.', 'Reads relevant, but vague.', 'Reads on-topic, with a clear point.', 'Reads like it moves the conversation forward.'];
const UNSURE = 'Not sure about this one';
const UNSURE_WHY = 'The rating did not come back clearly.';

// ---- setup + connect (opencode-proof.mjs's proven walk, only when OV_APK and a key file are set) ----
const keyFileEnv = process.env.OPENCODE_KEY_FILE;
const apk = process.env.OV_APK;
const connectGo = !!(apk && keyFileEnv);
if (apk && !keyFileEnv) throw new Error('OV_APK without OPENCODE_KEY_FILE: the live fit proof needs the OpenCode Go writer.');
const key = connectGo ? readFileSync(keyFileEnv, 'utf8').trim() : '';
if (connectGo && (key.length < 20 || /\s/.test(key))) throw new Error('The OpenCode Go key file did not look like a key.');
const workspace = process.env.OPENCODE_WORKSPACE ?? 'Working2';
// Bound, not just enabled: a force-stop unbinds the service and Android only rebinds it when the setting changes.
const bound = () => /Bound services:\s*[\[{][^}\]]*Ownvoice/.test(adb('shell', 'dumpsys', 'accessibility'));
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
// Chrome switched on for the bubble through the app's own list, like a person would.
const enableChrome = async () => {
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://apps', pkg);
  await tapText('find an app', 30);
  await type('Chrome');
  await hideKeyboard();
  const row = state => nodes().find(n => n.checkable && n.label === 'Chrome' && n.checked === state);
  for (let i = 0; i < 8 && !row(true); i++) if (row(false)) { tap(...center(row(false))); await wait(1200); } else await wait(800);
  if (!row(true)) throw new Error('The Chrome row did not switch on.');
};
const connectOpenCode = async () => {
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source', pkg);
  await waitText('how ownvoice writes', 30);
  for (let i = 0; i < 5 && !findText('with your opencode go'); i++) await swipeUp();
  await tapText('with your opencode go');
  await tapText('paste your opencode go key', 30);
  await wait(700);
  adb('shell', 'input', 'text', `'${key}'`); await wait(700); // never logged or screenshotted
  await hideKeyboard();
  // The field must hold the key or Connect stays greyed: check it is enabled before tapping.
  const connectBtn = await until(() => nodes().find(n => (n.label === 'Connect' || n.text === 'Connect') && n.enabled !== false), 'an enabled Connect button', 15);
  tap(...center(connectBtn));
  await waitText('more than one workspace', 40);
  // The node read can come back empty for a moment (after a density change), so retry before scrolling on.
  for (let i = 0; i < 8 && !nodes().find(n => (n.text || n.label || '').trim() === workspace); i++) i % 2 ? await swipeUp() : await wait(1000);
  const pick = nodes().find(n => (n.text || n.label || '').trim() === workspace);
  if (!pick) throw new Error(`The workspace pick shows no "${workspace}": ${screenWords()}`);
  snap('workspace-pick');
  tap(...center(pick));
  await waitText('opencode go is connected', 60);
  snap('connected');
};

const keyF = resolve(out, 'x.key'), certFile = resolve(out, 'x.crt');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=x.com', '-addext', 'subjectAltName=DNS:x.com,DNS:reddit.com', '-keyout', keyF, '-out', certFile], { stdio: 'pipe' });
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const page = createServer({ key: readFileSync(keyF), cert: readFileSync(certFile) }, (req, res) => {
  const host = (req.headers.host ?? '').replace(/:\d+$/, '');
  const platform = host === HOSTS.reddit ? 'reddit' : 'x';
  const i = Number(new URL(req.url, `https://${host}`).pathname.split('/').pop());
  const c = cases[platform]?.[i];
  if (!c) { res.writeHead(404).end(); return; }
  const heading = platform === 'reddit'
    ? `<p class="h">r/androidapps · posted by UmerDemo · 2h</p>`
    : `<p class="h">Umer Demo @umerdemo · 2h</p>`;
  const label = platform === 'reddit' ? 'Add a comment' : 'Post your reply';
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${platform === 'reddit' ? 'Reddit-style thread' : 'Umer Demo on X'}</title>
<style>body{font:17px sans-serif;margin:0;padding:16px}p{margin:0 0 6px}.h{color:#555}.b{font-size:19px;line-height:1.35;margin-bottom:28px}textarea{display:block;width:100%;box-sizing:border-box;min-height:150px;padding:12px;font:17px sans-serif;border:1px solid #999;border-radius:10px;margin-top:28px}</style>
${heading}<p class="b">${esc(c.post)}</p><button aria-label="12 ${platform === 'reddit' ? 'comments' : 'replies'}">12</button>
<textarea aria-label="${label}">${esc(c.reply)}</textarea>`);
});
await new Promise(r => page.listen(PORT, '0.0.0.0', r));
// Chrome's host-resolver-rules are comma-separated; a space between rules makes Chrome ignore the flag.
const mapChrome = () => adb('shell', `echo '_ --host-resolver-rules="MAP x.com 10.0.2.2:${PORT},MAP reddit.com 10.0.2.2:${PORT}" --ignore-certificate-errors' > /data/local/tmp/chrome-command-line`);
mapChrome();
adb('shell', 'am', 'force-stop', 'com.android.chrome');

const bubbleNode = () => nodes().find(node => node.windowType === 4 && /^Ownvoice(?:,|$)/.test(node.label));
const fitLines = () => adb('logcat', '-d', '-s', 'ReactNativeJS:I').split('\n').filter(line => line.includes('ownvoice-fit '));
const results = resolve(out, 'results.jsonl');
writeFileSync(results, '');
const SVC = component;
// `cmd uimode night` rejects the `custom -o off` spelling on API 36; plain yes/no is the portable form.
const tryAdb = (...a) => { try { return adb(...a); } catch { return ''; } };
// RN reads the colour scheme at process start, so a theme change needs a fresh app process; force-stop
// unbinds the accessibility service, so toggle it off and on again to make Android rebind it.
const rebind = async () => {
  adb('shell', 'am', 'force-stop', pkg);
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', 'null');
  await wait(700);
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', SVC);
  adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
  await wait(2000);
};

const failures = [];
const one = async (platform, i, tag) => {
  const c = cases[platform][i];
  adb('logcat', '-c');
  const host = HOSTS[platform];
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `https://${host}/${i}`, '-e', 'com.android.browser.application_id', 'fit-live', 'com.android.chrome');
  // A cold Chrome tab sometimes never renders the page (shared-emulator flake seen 2026-10-17):
  // re-fire the intent once, then record the call as errored and move on instead of aborting the run.
  const findField = () => nodes().find(node => node.editable && node.text === c.reply);
  let field = await until(findField, `the ${platform} reply field`, 120).catch(() => null);
  if (!field) {
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `https://${host}/${i}`, '-e', 'com.android.browser.application_id', 'fit-live', 'com.android.chrome');
    field = await until(findField, `the ${platform} reply field`, 60).catch(() => null);
  }
  if (!field) {
    const msg = `no ${platform} reply field for case ${i}`;
    snap(`FAIL-${tag}`);
    appendFileSync(results, JSON.stringify({ platform, case: i, post: c.post, reply: c.reply, fits: null, ok: false, latencyMs: 0, error: msg, shot: `FAIL-${tag}.png` }) + '\n');
    console.log(`${tag}: ERROR ${msg}`);
    failures.push(`${tag}: ${msg}`);
    return null;
  }
  tap(...center(field));
  // The bubble node is an accessibility overlay; when its label isn't exposed, tap its saved spot
  // (right edge, halfway down) so the journey still opens the panel — sized to the live display,
  // which the narrow leg changes mid-run.
  const bubble = await until(bubbleNode, 'the bubble', 25).catch(() => null);
  if (bubble) tap(...center(bubble));
  else { console.log('no bubble node; using the right-edge fallback'); const [w, h] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number); tap(w - 70, h * 0.48); }
  // The writer round-trip runs first (12-44 s on Go), then the fit judge (up to 60 s): 180 s covers both.
  const t0 = Date.now();
  let line = null, error = null;
  try { line = await until(() => fitLines().at(-1), 'the fit log line', 180); }
  catch (e) { error = e.message; snap(`FAIL-${tag}`); }
  const latencyMs = Date.now() - t0;
  await wait(900);
  snap(tag);
  let fits = null;
  if (line) { try { fits = JSON.parse(line.slice(line.indexOf('ownvoice-fit ') + 'ownvoice-fit '.length)); } catch (e) { error = error ?? `unparseable fit line: ${e.message}`; } }
  const ok = !!fits && fits.length > 0 && fits.every(f => f.level != null || f.words === UNSURE);
  appendFileSync(results, JSON.stringify({ platform, case: i, post: c.post, reply: c.reply, fits, ok, latencyMs, error, shot: `${tag}.png` }) + '\n');
  const read = (fits ?? []).map(f => f.level != null ? `${LEVELS[f.level]} — ${GLOSS[f.level]}` : `${f.words} — ${UNSURE_WHY}`).join(' | ');
  console.log(`${tag}: ${Math.round(latencyMs / 1000)}s ${error ? `ERROR ${error}` : read}`);
  if (!ok) failures.push(`${tag}: ${error ?? 'no fit cards in the log line'}`);
  return fits;
};

try {
  // The emulator's twilight schedule re-enables night mode over `night no`; the schedule spellings
  // differ across APIs, so try each and always end on plain no.
  tryAdb('shell', 'cmd', 'uimode', 'night', 'custom_schedule', '-o', 'off');
  tryAdb('shell', 'cmd', 'uimode', 'night', 'custom', '-o', 'off');
  tryAdb('shell', 'cmd', 'uimode', 'night', 'no');
  if (connectGo) {
    // A shared emulator may keep another run's font size or density, which pushes the welcome title off screen.
    adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0');
    adb('shell', 'wm', 'density', 'reset');
    adb('shell', 'wm', 'size', 'reset');
    execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
    adb('shell', 'pm', 'clear', pkg);
    await setService();
    adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
    // Setup finished with no writer: hardware Back on the welcome completes it.
    await waitText('sound like you', 30); adb('shell', 'input', 'keyevent', '4'); await wait(2500);
    await enableChrome();
    await connectOpenCode();
    console.log('OpenCode Go connected; starting the fit calls.');
  }
  tryAdb('shell', 'cmd', 'uimode', 'night', 'no');
  await rebind();
  for (const platform of ['x', 'reddit']) {
    const n = Math.min(limit, cases[platform].length);
    for (let i = 0; i < n; i++) await one(platform, i, `${platform}-${String(i).padStart(2, '0')}-light`);
  }
  if (process.env.DARK) {
    tryAdb('shell', 'cmd', 'uimode', 'night', 'yes');
    await rebind();
    await one('x', 0, 'x-00-dark');
    await one('reddit', 0, 'reddit-00-dark');
    tryAdb('shell', 'cmd', 'uimode', 'night', 'no');
    await rebind();
  }
  if (process.env.NARROW) {
    // The narrow, large-text phone: 720x1280 at font 1.3 (the shared-kit extreme size).
    adb('shell', 'settings', 'put', 'system', 'font_scale', '1.3');
    adb('shell', 'wm', 'density', '320');
    adb('shell', 'wm', 'size', '720x1280');
    await wait(3000);
    await one('x', 0, 'x-00-narrow');
    adb('shell', 'wm', 'size', 'reset');
    adb('shell', 'wm', 'density', 'reset');
    adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0');
    await wait(1500);
  }
} finally {
  page.close();
  adb('shell', 'rm', '-f', '/data/local/tmp/chrome-command-line');
}
const lines = readFileSync(results, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
const light = lines.filter(r => r.shot.endsWith('-light.png'));
const okAll = lines.filter(r => r.ok).length;
const notSure = lines.filter(r => r.fits?.some(f => f.level == null)).length;
console.log(`FIT-LIVE: calls ${lines.length} ok ${okAll} (light ${light.filter(r => r.ok).length}/${light.length}), calls with a Not-sure card: ${notSure}`);
if (failures.length) { console.log(failures.join('\n')); process.exitCode = 1; }

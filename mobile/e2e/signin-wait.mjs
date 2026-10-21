// P7: a device-code sign-in must finish after 60 seconds in the browser on Android 16.
// Walks setup to the ChatGPT choice with the proof APK
// (EXPO_PUBLIC_E2E_AUTH_BASE=http://10.0.2.2:<port> for the real sign-in stack against
// the host stand-in mockOpenAI), starts the sign-in there, leaves Chrome in front for
// 60 s, approves the code the way the mock page's own form does, comes back and expects
// the connected sentence. Shell input and screencap only, never UiAutomator.
// Env: ANDROID_SERIAL=emulator-NNNN, OWNVOICE_AVD_NAME=<owned-avd-name>, MOCK_PORT (default
// 21455), DROP_POLLS (default 0; >0 destroys that many polls like a backgrounded app's cut
// network). THEME=light|dark sets the emulator theme first. SIGNIN_PAGE=1 (APK built against MOCK_PORT) walks the
// one-button flow instead: the stand-in holds ChatGPT's page for one tap (MOCK_PORT+1 is the stand-in itself),
// the card is shot with the page closed, then Open the page and Approve connect it; with
// SIGNIN_RECORD=<task> it records the walk to verify-artifacts/<task>/. Args: <release-apk> [screenshots-dir].
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import http from 'node:http';
import { resolve } from 'node:path';
import { mockOpenAI } from '@byokit/accounts/testing';

const serial = process.env.ANDROID_SERIAL;
// The shared Mac slot tunnels its emulator as 127.0.0.1:4555; anything else must be a local emulator. Phones are refused either way.
if (serial !== '127.0.0.1:4555' && !serial?.startsWith('emulator-'))
  throw new Error('Set ANDROID_SERIAL to a throwaway emulator or the claimed Mac slot 127.0.0.1:4555 (owner phones are refused).');
const snapTool = (process.env.SNAP_TOOL ?? '').trim(); // e.g. the Mac slot script: screenshots via `$S shot <path>`
const deviceMockBase = (process.env.DEVICE_MOCK_BASE ?? '').trim(); // the mock URL as the device sees it
const deviceBase = (port) => deviceMockBase || `http://10.0.2.2:${port}`;
const avd = (process.env.OWNVOICE_AVD_NAME ?? '').trim();
if (!avd) throw new Error('Set OWNVOICE_AVD_NAME to your own AVD name.');
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = resolve(process.argv[3] ?? 'e2e/artifacts');
mkdirSync(out, { recursive: true });
const port = Number(process.env.MOCK_PORT ?? 21455);
const dropPolls = Number(process.env.DROP_POLLS ?? 0);

const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
const wait = ms => new Promise(r => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);
const log = line => { console.log(`${stamp()} ${line}`); appendFileSync(resolve(out, 'signin-run.log'), `${stamp()} ${line}\n`); };
const snap = name => {
  const path = resolve(out, `${name}.png`);
  if (snapTool) { execFileSync('bash', [snapTool, 'shot', path], { stdio: 'inherit' }); return; }
  adb('shell', 'screencap', '-p', `/sdcard/${name}.png`);
  execFileSync('adb', ['-s', serial, 'pull', `/sdcard/${name}.png`, path], { stdio: 'inherit' });
};
const focus = () => adb('shell', 'dumpsys', 'window').match(/mCurrentFocus=Window\{[^}]+\s+([^\s}]+)/)?.[1] ?? '?';

const [width, height] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
if (adb('shell', 'getprop', 'ro.boot.qemu.avd_name').trim() !== avd)
  throw new Error(`Serial ${serial} is not the owned AVD ${avd}; refusing to touch it.`);
const tap = (x, y) => adb('shell', 'input', 'tap', String(x), String(y));
const pkg = 'dev.ownvoice.next';
const done = new Error('page walk done');
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;

const screenText = () => {
  const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
  const tsv = execFileSync('tesseract', ['stdin', 'stdout', 'tsv'], { input: image, encoding: 'utf8' });
  return tsv.split('\n').slice(1).map(row => row.split('\t')[11]).filter(Boolean).join(' ').toLowerCase();
};
const waitForLine = async (labels, tries = 30) => {
  const wanted = (Array.isArray(labels) ? labels : [labels]).map(label => label.toLowerCase());
  for (let attempt = 0; attempt < tries; attempt++) {
    const text = screenText();
    if (wanted.some(want => text.includes(want))) return;
    if (text.includes('responding')) await tapText('wait').catch(() => {}); // A loaded host's ANR dialog: let the app finish.
    if (attempt < tries - 1) await wait(1000);
  }
  snap('failed-wait');
  throw new Error(`Could not see "${wanted.join('" or "')}" on screen.`);
};
const tapText = async (label, tries = 10) => {
  for (let attempt = 0; attempt < tries; attempt++) {
    const image = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
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
      const line = [...lines.values()].find(item => item.words.join(' ').toLowerCase().includes(label.toLowerCase()));
      if (line) { tap(Math.round((line.left + line.right) / 2), Math.round((line.top + line.bottom) / 2)); return; }
      // Filled pills read only with a raw-line pass on the same band.
      const band = top ? execFileSync('magick', ['png:', '-crop', `${width}x150+0+${top}`, '+repage', 'png:-'], { input: image }) : image;
      const raw = execFileSync('tesseract', ['stdin', 'stdout', '--psm', '13', 'tsv'], { input: band, encoding: 'utf8' });
      const words = raw.split('\n').slice(1).map(row => row.split('\t')).filter(columns => columns.length >= 12 && columns[11].trim());
      const text = words.map(columns => columns[11]).join(' ').toLowerCase();
      if (text.includes(label.toLowerCase()) && words.length) {
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
  throw new Error(`Could not find visible ${label}.`);
};
const bubble = () => tap(width - Math.round(90 * width / 1080), Math.round(height * .53));
const tapInsert = () => tap(Math.round(width * .2), Math.round(height * .6));
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

// The stand-in OpenAI on the host; the emulator reaches it at 10.0.2.2, both from the
// app's sign-in stack and from Chrome on the code page. Every request is timestamped.
const pageMode = process.env.SIGNIN_PAGE === '1';
const mock = await mockOpenAI({ port: pageMode ? port + 1 : port, host: '0.0.0.0', log: line => appendFileSync(resolve(out, 'signin-mock.log'), `${stamp()} ${line}\n`) });
// Page mode: ChatGPT's authorize page waits for a tap (the stand-in would redirect at once); every other request goes to the stand-in.
const front = pageMode ? http.createServer(async (req, res) => {
  if (req.url.startsWith('/oauth/authorize')) {
    res.setHeader('content-type', 'text/html');
    return void res.end(`<meta name=viewport content="width=device-width"><body style="font:30px sans-serif;padding:48px"><h2>Sign in to ChatGPT</h2><p>Ownvoice asks to use your plan.</p><p><a href="${deviceBase(port + 1)}${req.url}" style="display:inline-block;padding:24px 64px;border-radius:99px;background:#10a37f;color:#fff;text-decoration:none">Approve</a></p>`);
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const got = await fetch(`http://127.0.0.1:${port + 1}${req.url}`, { method: req.method, headers: { 'content-type': req.headers['content-type'] ?? 'text/plain' }, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) }).catch(() => null);
  res.writeHead(got?.status ?? 502, { 'content-type': got?.headers.get('content-type') ?? 'text/plain' });
  res.end(got ? Buffer.from(await got.arrayBuffer()) : '');
}).listen(port, '0.0.0.0') : null;
if (dropPolls > 0) mock.state.dropPolls = dropPolls;
log(`stand-in OpenAI on ${mock.base} (device at ${deviceBase(port)}), dropPolls=${dropPolls}`);

const priorServices = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
const priorAccessibility = adb('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim();
const priorTimeout = adb('shell', 'settings', 'get', 'system', 'screen_off_timeout').trim();
try {
  adb('shell', 'settings', 'put', 'system', 'screen_off_timeout', '1800000');
  adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
  execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
  adb('shell', 'pm', 'clear', pkg);
  disableService();
  if (process.env.THEME) execFileSync('bash', ['e2e/evidence.sh', 'theme', process.env.THEME], { stdio: 'inherit' });
  await wait(1500);

  // Setup to the ChatGPT choice (same walk as e2e/first-run.mjs steps 1-2: on an
  // emulator no phone writer exists, so the choice offers ChatGPT sign-in inline).
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
  try { await waitForLine('replies that sound', 30); } catch (error) {
    if (!/respond/.test(screenText())) throw error; // Cold-boot ANR: let it finish loading.
    await tapText('wait');
    await waitForLine('replies that sound');
  }
  // A cold-boot frame can swallow the first press, so tap again until the step shows.
  for (let attempt = 0; attempt < 3; attempt++) {
    await tapText('Continue');
    try { await waitForLine('how should ownvoice write', 10); break; } catch (error) { if (attempt === 2) throw error; }
  }
  await waitForLine('with your chatgpt');
  snap('signin-01-choose');

  // The choice starts the sign-in inside the step: pick the card, then the footer button.
  const record = pageMode && process.env.SIGNIN_RECORD;
  if (record) execFileSync('bash', ['e2e/evidence.sh', 'motion-start', record, `signin-page-${process.env.THEME ?? 'light'}`], { stdio: 'inherit' });
  await tapText('with your chatgpt');
  await tapText('Continue').catch(() => tapText('Sign in'));
  if (pageMode) {
    // One button in the app (the tap above), then one approval on ChatGPT's page: no code anywhere.
    await waitForLine('asks to use');
    if (screenText().includes('your code')) throw new Error('A code is on screen.');
    snap('signin-02-page');
    await tapText('Close');
    await waitForLine('nothing to type');
    snap('signin-03-card');
    await tapText('Open the ChatGPT');
    await waitForLine('asks to use');
    await tapText('Approve'); // the one tap on the page
    await waitForLine('chatgpt is connected');
    snap('signin-06-connected');
    if (record) execFileSync('bash', ['e2e/evidence.sh', 'motion-stop'], { stdio: 'inherit' });
    log('connected from the page with one approval, no code');
    throw done;
  }
  let code;
  for (let attempt = 0; attempt < 30 && !(code = mock.lastCode()); attempt++) await wait(1000);
  if (!code) throw new Error('The app never asked the stand-in for a code.');
  log(`code issued: ${code}`);
  await waitForLine('your code');
  // The code is letter-spaced on screen and OCR confuses a couple of glyphs
  // (0/T), so match fuzzily: nearly every character in place.
  const bare = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const seen = bare(screenText());
  const want = bare(code);
  let hits = 0;
  for (let i = 0; i + want.length <= seen.length; i++) {
    let same = 0;
    for (let j = 0; j < want.length; j++) if (seen[i + j] === want[j]) same++;
    hits = Math.max(hits, same);
  }
  if (hits < want.length - 2) throw new Error(`The code ${code} is not on screen.`);
  log(`code on screen: ${code}`);
  snap('signin-02-code');
  const page = `${deviceBase(port)}/codex/device`;
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', page);
  await wait(3000);
  if (!focus().toLowerCase().includes('chrome')) throw new Error(`The code page did not come up (focus: ${focus()}).`);

  // 60 s in the browser with the app backgrounded, then approve exactly as the page's
  // own Continue button would (same endpoint, same form body).
  for (let elapsed = 0; elapsed < 60; elapsed += 10) {
    await wait(10000);
    const at = focus();
    log(`browser wait ${(elapsed + 10)}s (focus: ${at})`);
    if (elapsed === 20) snap('signin-03-browser');
    if (!at.toLowerCase().includes('chrome')) throw new Error(`Left the browser mid-wait (focus: ${at}).`);
  }
  snap('signin-04-browser-end');
  const approval = await fetch(`${mock.base}/codex/device`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ user_code: code }).toString(),
  }).then(r => r.text());
  if (!approval.includes('Signed in')) throw new Error('The code page refused the approval.');
  log('code approved on the page');
  await wait(2000);

  // Back in the app: the wait must have survived, and the step says connected.
  // The choice polls the session every second while a code waits, so foregrounding
  // the task is enough; no deep link (the settings ChatGPT screen is another route).
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
  await wait(3000);
  await waitForLine('chatgpt is connected');
  snap('signin-06-connected');
  log('connected: the sign-in survived 60 s in the browser');
  console.log(`P7 proof saved to ${out}.`);
} catch (error) {
  if (error !== done) throw error;
} finally {
  front?.close();
  for (const args of [
    ['shell', 'settings', priorServices === 'null' ? 'delete' : 'put', 'secure', 'enabled_accessibility_services', ...(priorServices === 'null' ? [] : [priorServices])],
    ['shell', 'settings', priorAccessibility === 'null' ? 'delete' : 'put', 'secure', 'accessibility_enabled', ...(priorAccessibility === 'null' ? [] : [priorAccessibility])],
    ['shell', 'settings', 'put', 'system', 'screen_off_timeout', priorTimeout],
  ]) {
    try { adb(...args); } catch {}
  }
  await mock.close();
}

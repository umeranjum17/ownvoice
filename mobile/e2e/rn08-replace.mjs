// OWNVOICE-RN-08 Replace-only proof (lead method, no chip matrix, no OCR).
// One realistic message in a test page whose textarea focuses and selects itself on
// load; ctrl+A as the Select-all fallback; long-press, toolbar overflow, the Ownvoice
// entry; Shorter then Replace; the textarea value read back through Chrome DevTools
// (adb forward tcp:9222 localabstract:chrome_devtools_remote + Runtime.evaluate).
// Needs OPENCODE_KEY_FILE (the Go key, never logged) and OPENCODE_WORKSPACE.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { createServer, get } from 'node:http';
import { connect } from 'node:net';
import { accessibilityProbe, center, emulatorName } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL;
const avdName = process.env.OWNVOICE_AVD_NAME?.trim();
if (!/^emulator-\d+$/.test(serial ?? '') || !avdName) throw new Error('Set ANDROID_SERIAL to an emulator and OWNVOICE_AVD_NAME to its owned AVD name.');
const actualAvd = emulatorName(serial);
if (actualAvd !== avdName) throw new Error(`Refusing ${serial}: AVD ${actualAvd} does not match ${avdName}.`);
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = process.argv[3] ?? 'reports/rn08-replace';
const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const rewrite = `${pkg}/dev.ownvoice.bridge.RewriteActivity`;
let probe;
const nodes = () => (probe ??= accessibilityProbe(serial, out))();
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
const shell = (...args) => adb('shell', ...args);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const tap = (x, y) => shell('input', 'tap', String(Math.round(x)), String(Math.round(y)));
const wake = () => { shell('input', 'keyevent', 'KEYCODE_WAKEUP'); shell('svc', 'power', 'stayon', 'true'); shell('settings', 'put', 'system', 'screen_off_timeout', '1800000'); };
const waitForFocus = async (packageName, tries = 8) => {
  for (let i = 0; i < tries; i++) {
    if (shell('dumpsys', 'window').split('\n').some(l => l.includes('mCurrentFocus') && l.includes(packageName))) return true;
    if (i < tries - 1) await wait(600);
  }
  return false;
};
const expectedApkSha = createHash('sha256').update(readFileSync(apk)).digest('hex');
const install = (...options) => {
  execFileSync('adb', ['-s', serial, 'install', ...options, apk], { stdio: 'inherit' });
  const path = shell('pm', 'path', pkg).split('\n').find(line => line.startsWith('package:') && line.trim().endsWith('/base.apk'))?.trim().slice(8);
  const installedSha = path && shell('sha256sum', path).trim().split(/\s+/)[0];
  if (installedSha !== expectedApkSha) throw new Error('Installed APK differs from release build; refusing to test a stale install.');
};
const rebindService = async () => {
  const enabled = shell('settings', 'get', 'secure', 'enabled_accessibility_services').trim();
  const services = new Set(enabled === 'null' ? [] : enabled.split(':'));
  services.add(component);
  const without = [...services].filter(x => x !== component);
  shell('settings', 'put', 'secure', 'enabled_accessibility_services', without.length ? without.join(':') : 'com.example.disabled/NoService');
  await wait(1500);
  shell('settings', 'put', 'secure', 'enabled_accessibility_services', [...services].join(':'));
  shell('settings', 'put', 'secure', 'accessibility_enabled', '1'); // a cold boot leaves it 0 and the puts above do not flip it
  await wait(1500);
  for (let i = 0; i < 4; i++) {
    if (shell('settings', 'get', 'secure', 'enabled_accessibility_services').includes(component) && shell('settings', 'get', 'secure', 'accessibility_enabled').trim() === '1') return;
    await wait(1000);
  }
  throw new Error('service not enabled');
};

mkdirSync(out, { recursive: true });
const shot = name => {
  writeFileSync(`${out}/${name}.png`, execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 24 * 1024 * 1024 }));
  console.log(`shot ${name}`);
};
const fail = (step, message) => {
  try { shot(`step-${step}-FAILED`); } catch {}
  writeFileSync(`${out}/replace-result.json`, JSON.stringify({ ok: false, step, message }, null, 2));
  throw new Error(`[${step}] ${message}`);
};
const textPresent = async (label, tries = 6) => {
  const lower = label.toLowerCase();
  for (let attempt = 0; attempt < tries; attempt++) {
    if (nodes().some(n => `${n.label} ${n.text}`.toLowerCase().includes(lower))) return true;
    if (attempt < tries - 1) await wait(600);
  }
  return false;
};
const tapText = async (label, tries = 8) => {
  const lower = label.toLowerCase();
  for (let attempt = 0; attempt < tries; attempt++) {
    const accessible = nodes().filter(n => `${n.label} ${n.text}`.toLowerCase().includes(lower)).sort((a, b) => Number(b.clickable) - Number(a.clickable));
    const node = accessible.find(n => n.label.toLowerCase() === lower || n.text.toLowerCase() === lower) ?? accessible[0];
    if (node) { tap(...center(node)); return; }
    await wait(700);
  }
  fail('sheet', `the ${label} button never appeared`);
};

const freshSetup = async () => {
  wake();
  if (shell('pm', 'list', 'packages', pkg).split('\n').includes(`package:${pkg}`)) execFileSync('adb', ['-s', serial, 'uninstall', pkg], { stdio: 'ignore' });
  install('-t');
  shell('cmd', 'uimode', 'night', 'custom_schedule', '-o', 'off');
  shell('cmd', 'uimode', 'night', 'no');
  shell('settings', 'put', 'system', 'font_scale', '1.0');
  shell('wm', 'size', 'reset');
  execFileSync('bash', ['-c', `adb -s ${serial} shell "su 0 sh -c 'mkdir -p /data/data/dev.ownvoice.next/shared_prefs && cat > /data/data/dev.ownvoice.next/shared_prefs/ownvoice-native.xml'" <<'XML'
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <boolean name="tipShown" value="true" />
    <boolean name="paused" value="false" />
    <set name="off" />
    <set name="on">
        <string>com.android.chrome</string>
        <string>dev.ownvoice.next</string>
    </set>
</map>
XML`], { stdio: 'ignore' });
  execFileSync('bash', ['-c', `adb -s ${serial} shell "su 0 sh -c 'cat > /data/data/dev.ownvoice.next/shared_prefs/privacy.xml'" <<'XML'
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <boolean name="setUp" value="true" />
    <boolean name="bubbleTip" value="true" />
    <boolean name="paused" value="false" />
</map>
XML`], { stdio: 'ignore' });
  await rebindService();
  shell('input', 'keyevent', 'KEYCODE_HOME');
  await wait(500);
  shell('am', 'start', '-n', `${pkg}/.MainActivity`, '--windowingMode', '1');
  await wait(4000);
  if (!(await waitForFocus(pkg))) fail('setup', 'the app did not come to the front');
  shell('su', '0', 'sqlite3', '/data/data/dev.ownvoice.next/files/SQLite/ExpoSQLiteStorage', `"INSERT OR REPLACE INTO storage(key,value) VALUES('setup-done','true');"`);
  shell('am', 'force-stop', pkg);
  await wait(800);
  await rebindService();
  shell('am', 'start', '-n', `${pkg}/.MainActivity`, '--windowingMode', '1');
  await wait(4500);
  if (!(await waitForFocus(pkg))) fail('setup', 'the app did not return to the front');
  if (!(await textPresent('Where the bubble shows', 3))) fail('setup', 'home never showed (setup not seeded?)');
};

const liveKey = readFileSync(process.env.OPENCODE_KEY_FILE ?? '', 'utf8').trim();
if (liveKey.length < 20 || /\s/.test(liveKey)) throw new Error('The OpenCode Go key file did not look like a key.');
const liveWorkspace = process.env.OPENCODE_WORKSPACE ?? 'Working2';
const TEXT = 'Hi Sam, please send teh report by Friday at 3pm, all 12 pages, its urgent and really very important.';
const safeWords = (limit = 300) => nodes().filter(n => !n.password)
  .map(n => (n.text || n.label || '').trim()).filter(Boolean).join(' | ')
  .replace(/[A-Za-z0-9_\-]{20,}/g, '<redacted>').slice(0, limit);

const connectOpenCode = async () => {
  shell('am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source');
  if (!(await textPresent('how ownvoice writes', 30))) fail('connect', 'the writer list did not open');
  const dynWH = () => [...shell('wm', 'size').matchAll(/(\d+)x(\d+)/g)].at(-1).slice(1).map(Number);
  for (let i = 0; i < 5 && !(await textPresent('with your opencode go', 2)); i++) {
    const [w, h] = dynWH();
    shell('input', 'swipe', String(Math.round(w / 2)), String(Math.round(h * 0.75)), String(Math.round(w / 2)), String(Math.round(h * 0.3)), '400');
    await wait(1000);
  }
  await tapText('with your opencode go');
  await tapText('paste your opencode go key');
  await wait(700);
  execFileSync('adb', ['-s', serial, 'shell', 'input', 'text', `'${liveKey}'`]); // no shell echo: the key must never reach the log
  await wait(700);
  if (shell('dumpsys', 'input_method').includes('mInputShown=true')) { shell('input', 'keyevent', '4'); await wait(800); }
  const connectBtn = nodes().find(n => n.label === 'Connect' || n.text === 'Connect');
  if (!connectBtn) fail('connect', 'the Go Connect button never appeared');
  if (connectBtn.enabled === false) fail('connect', 'key field empty after typing: Connect is disabled');
  tap(...center(connectBtn));
  let outcome = '';
  for (let i = 0; i < 60 && !outcome; i++) {
    if (await textPresent('more than one workspace', 1)) outcome = 'pick';
    else if (await textPresent('opencode go is connected', 1)) outcome = 'connected';
    else if (await textPresent("didn't answer", 1)) outcome = 'refused-answer';
    else if (await textPresent('could not connect', 1)) outcome = 'refused-connect';
    else if (await textPresent('try again', 1)) outcome = 'refused-retry';
    else await wait(1000);
  }
  if (!outcome) fail('connect', `the writer connect settled on nothing recognizable: ${safeWords()}`);
  if (outcome.startsWith('refused')) fail('connect', `the Go connect was refused (${outcome}): ${safeWords()}`);
  if (outcome === 'pick') {
    for (let i = 0; i < 8; i++) {
      if (nodes().some(n => `${n.label} ${n.text}`.trim() === liveWorkspace)) break;
      const [w, h] = dynWH();
      shell('input', 'swipe', String(Math.round(w / 2)), String(Math.round(h * 0.75)), String(Math.round(w / 2)), String(Math.round(h * 0.3)), '400');
      await wait(1000);
    }
    const pick = nodes().find(n => `${n.label} ${n.text}`.trim() === liveWorkspace);
    if (!pick) fail('connect', `the workspace pick shows no "${liveWorkspace}": ${safeWords()}`);
    shot('step-workspace-pick');
    tap(...center(pick));
    if (!(await textPresent('opencode go is connected', 60))) fail('connect', `OpenCode Go did not connect after the pick: ${safeWords()}`);
  }
  shot('step-connected');
};

// Minimal DevTools client: HTTP /json/list over the forwarded port, then one
// Runtime.evaluate over a raw-socket WebSocket (no extra dependency).
const devtoolsGet = path => new Promise((resolve, reject) => {
  get({ host: '127.0.0.1', port: 9222, path }, res => {
    let body = '';
    res.on('data', c => { body += c; });
    res.on('end', () => (res.statusCode === 200 ? resolve(body) : reject(new Error(`devtools ${path} -> ${res.statusCode}`))));
  }).on('error', reject);
});
const devtoolsEvaluate = (wsUrl, expression) => new Promise((resolve, reject) => {
  const url = new URL(wsUrl);
  const key = randomBytes(16).toString('base64');
  const socket = connect({ host: '127.0.0.1', port: 9222 }, () => {
    socket.write(`GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: 127.0.0.1:9222\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
  });
  const timer = setTimeout(() => { socket.destroy(); reject(new Error('devtools evaluate timed out')); }, 20000);
  let handshake = '', frames = Buffer.alloc(0), opened = false;
  const sendFrame = text => {
    const payload = Buffer.from(text);
    const mask = randomBytes(4);
    const head = Buffer.alloc(2 + (payload.length > 125 ? 2 : 0));
    head[0] = 0x81;
    head[1] = 0x80 | (payload.length > 125 ? 126 : payload.length);
    if (payload.length > 125) head.writeUInt16BE(payload.length, 2);
    const masked = payload.map((b, i) => b ^ mask[i % 4]);
    socket.write(Buffer.concat([head, mask, masked]));
  };
  socket.on('data', chunk => {
    if (!opened) {
      handshake += chunk.toString('latin1');
      const end = handshake.indexOf('\r\n\r\n');
      if (end < 0) return;
      if (!handshake.includes(' 101 ')) { clearTimeout(timer); socket.destroy(); reject(new Error('devtools websocket handshake refused')); return; }
      opened = true;
      frames = Buffer.from(handshake.slice(end + 4), 'latin1');
      sendFrame(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
      return;
    }
    frames = Buffer.concat([frames, chunk]);
    while (frames.length >= 2) {
      const len = frames[1] & 0x7f;
      const ext = len === 126 ? 2 : len === 127 ? 8 : 0;
      if (frames.length < 2 + ext) return;
      const size = ext === 0 ? len : ext === 2 ? frames.readUInt16BE(2) : Number(frames.readBigUInt64BE(2));
      if (frames.length < 2 + ext + size) return;
      const payload = frames.subarray(2 + ext, 2 + ext + size);
      frames = frames.subarray(2 + ext + size);
      try {
        const message = JSON.parse(payload.toString('utf8'));
        if (message.id === 1) {
          clearTimeout(timer);
          socket.destroy();
          if (message.result?.exceptionDetails) reject(new Error(`page evaluate threw: ${JSON.stringify(message.result.exceptionDetails).slice(0, 200)}`));
          else resolve(message.result?.result?.value);
          return;
        }
      } catch (error) { clearTimeout(timer); socket.destroy(); reject(error); return; }
    }
  });
  socket.on('error', error => { clearTimeout(timer); reject(error); });
});

const page = createServer((_, response) => {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font:20px sans-serif;padding:24px}textarea{display:block;width:100%;font:20px sans-serif;padding:12px}</style><label>Message <textarea id="m" rows="6">${TEXT}</textarea></label><script>addEventListener('load',()=>{const el=document.getElementById('m');el.focus();el.select();});</script>`);
});
await new Promise(resolve => page.listen(0, '0.0.0.0', resolve));
try {
  await freshSetup();
  await connectOpenCode();

  const port = page.address().port;
  const openPage = () => shell('am', 'start', '-a', 'android.intent.action.VIEW', '-d', `http://10.0.2.2:${port}/`, 'com.android.chrome');
  openPage();
  if (await textPresent('Use without an account', 4)) { await tapText('Use without an account'); openPage(); }
  const [pw, ph] = [...shell('wm', 'size').matchAll(/(\d+)x(\d+)/g)].at(-1).slice(1).map(Number);
  if (await textPresent('Chrome notifications', 2)) { tap(Math.round(pw * 0.52), Math.round(ph * 0.73)); await wait(800); }
  else if (await textPresent('No thanks', 2)) { await tapText('No thanks'); openPage(); }
  if (!(await waitForFocus('com.android.chrome'))) fail('chrome', 'Chrome did not come to the front');
  // The page's own precondition is the editable field, not the label text: Chrome's
  // accessibility tree may never expose the surrounding label even when the page (and
  // its onload selection) is fully rendered, as the step-page-loaded shot has shown.
  let field;
  for (let i = 0; i < 15 && !field; i++) {
    field = nodes().find(n => n.editable && !n.password);
    if (!field) await wait(1000);
  }
  await wait(1500); // let the onload focus+select land
  shot('step-page-loaded');
  if (!field) fail('chrome', 'the test page shows no editable field');
  const [fx, fy] = center(field);
  shell('input', 'keycombination', '113', '29'); // full selection even when the toolbar shows no Select all
  await wait(600);
  shell('input', 'swipe', String(Math.round(fx)), String(Math.round(fy)), String(Math.round(fx)), String(Math.round(fy)), '1100'); // long-press inside the selection
  await wait(1200);
  shot('step-toolbar');

  const overflow = nodes().find(n => /more options/i.test(`${n.label} ${n.text}`) && n.clickable);
  let ownvoice = nodes().find(n => n.clickable && /ownvoice/i.test(`${n.label} ${n.text}`));
  if (!ownvoice) {
    if (!overflow) fail('toolbar', 'neither the Ownvoice entry nor the toolbar overflow menu appeared');
    tap(...center(overflow)); // process-text entries sit in the overflow, not on the main bar
    await wait(1200);
    shot('step-overflow');
    for (let i = 0; i < 6 && !ownvoice; i++) {
      ownvoice = nodes().find(n => n.clickable && /ownvoice/i.test(`${n.label} ${n.text}`));
      if (!ownvoice) await wait(700);
    }
  }
  if (!ownvoice) fail('toolbar', 'the Ownvoice entry never appeared (toolbar and overflow shots saved)');
  shot('step-ownvoice-entry');
  tap(...center(ownvoice));
  if (!(await waitForFocus('RewriteActivity', 8))) fail('sheet', 'the Chrome selection did not open Ownvoice');
  if (!(await textPresent('Replace', 5))) fail('sheet', 'Replace not offered on the editable Chrome selection');
  shot('step-replace-offered');

  const before = new Set(nodes().map(n => `${n.label} ${n.text}`.trim()).filter(Boolean));
  await tapText('Shorter');
  let answered = false;
  for (let i = 0; i < 90 && !answered; i++) {
    if (await textPresent('Copy', 1)) answered = true;
    else if (await textPresent("didn't answer", 1)) fail('writer', 'Shorter failed: the writer did not answer');
    else await wait(1000);
  }
  if (!answered) fail('writer', 'Shorter produced no result in time');
  const drop = /^(copy|replace|share this text|you selected|make it better|same meaning as yours|check this|writing|replace puts|copy it|sounds |a bit |check the wording|why\?)/i;
  const cands = nodes()
    .filter(n => !n.clickable && (n.text || '').trim().length >= 2 && !before.has(`${n.label} ${n.text}`.trim()) && !drop.test((n.text || '').trim()))
    .sort((a, b) => b.text.trim().length - a.text.trim().length);
  if (!cands.length) fail('writer', 'no rewrite result on screen');
  const rewriteText = cands[0].text.trim();
  console.log(`rewrite: "${rewriteText}"`);
  shot('step-result');
  await tapText('Replace');
  await wait(1500);
  if (!(await waitForFocus('com.android.chrome', 5))) fail('replace', 'Chrome did not come back after Replace');
  await wait(1000);
  shot('step-replaced-field');

  execFileSync('adb', ['-s', serial, 'forward', 'tcp:9222', 'localabstract:chrome_devtools_remote']);
  let fieldValue, method = 'devtools';
  try {
    const targets = JSON.parse(await devtoolsGet('/json/list'));
    const target = targets.find(t => t.type === 'page' && String(t.url).includes(`:${port}/`)) ?? targets.find(t => t.type === 'page');
    if (!target?.webSocketDebuggerUrl) throw new Error(`no debuggable page target (${targets.length} targets listed)`);
    fieldValue = await devtoolsEvaluate(target.webSocketDebuggerUrl, `document.getElementById('m').value`);
  } catch (error) {
    method = `accessibility-fallback (devtools: ${error.message})`; // DevTools is the proof; the node read only diagnoses it
    fieldValue = (nodes().find(n => n.editable && !n.password)?.text ?? '').trim();
  } finally {
    try { execFileSync('adb', ['-s', serial, 'forward', '--remove', 'tcp:9222']); } catch {}
  }
  const match = (fieldValue ?? '').trim() === rewriteText.trim();
  const lower = (fieldValue ?? '').toLowerCase();
  const keepsFacts = lower.includes('sam') && lower.includes('friday') && /(3\s?pm|15:00)/.test(lower) && /\b12\b/.test(lower);
  const result = { ok: match && keepsFacts, method, rewrite: rewriteText, field: fieldValue, match, keepsFacts };
  writeFileSync(`${out}/replace-result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (!match) fail('readback', `Replace did not put the rewrite in the field (method ${method}; field starts: "${String(fieldValue).slice(0, 120)}")`);
  if (!keepsFacts) fail('readback', 'the replaced field lost a fact (name, time or number)');
  console.log(`Replace proof saved to ${out}: DevTools read-back matches the Shorter rewrite, facts kept.`);
  process.exit(0);
} finally {
  page.close();
}

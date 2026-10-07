// Real Chrome/accessibility journey on an already installed, opted-in emulator build.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { accessibilityProbe, center } from './accessibility.mjs';
const serial = process.env.ANDROID_SERIAL;
const out = resolve(process.argv[2] ?? 'e2e/artifacts');
const label = process.argv[3] ?? 'after';
const theme = process.argv[4] ?? 'light';
const task = process.env.OWNVOICE_EVIDENCE_TASK ?? 'ov-typing-stall';
const notice = 'In very long notes, checks cover only the first part.';
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', timeout: 30000, maxBuffer: 12 * 1024 * 1024 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const nodes = accessibilityProbe(serial, out); // refuses phones and mismatched AVDs
const tap = n => adb('shell', 'input', 'tap', ...center(n).map(x => String(Math.round(x))));
const bubble = list => list.find(n => n.windowType === 4 && /^Ownvoice(?:,|$)/.test(n.label));
const shot = screen => execFileSync('.agents/skills/verify-ownvoice/evidence.sh', ['shot', task, screen, label, theme], { env: { ...process.env, ANDROID_SERIAL: serial } });
const results = [];
let recording = false;
let domLength = 0;
const page = createServer((req, res) => {
  if (req.url === '/length') {
    let body = ''; req.on('data', c => { body += c; });
    req.on('end', () => { domLength = Number(body); res.end('ok'); });
    return;
  }
  const n = req.url.includes('large') ? 500 : 1;
  res.setHeader('Content-Type', 'text/html');
  res.end(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:18px sans-serif;padding:24px}textarea{width:90%;height:160px;font:18px sans-serif}</style><h1>Typing proof</h1><p>Umer's practice note. Nothing is sent.</p><textarea aria-label="Typing proof">${'We will meet tomorrow. '.repeat(n)}</textarea><p id="length"></p><script>const f=document.querySelector('textarea');const report=()=>{document.querySelector('#length').textContent=f.value.length+' letters in this practice note';fetch('/length',{method:'POST',body:String(f.value.length)})};f.addEventListener('input',report);f.addEventListener('click',()=>setTimeout(()=>f.setSelectionRange(f.value.length,f.value.length),0));report();</script>`);
});
const open = async size => {
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `http://127.0.0.1:${port}/${size}`);
  let field;
  for (let i = 0; i < 12 && !field; i++) {
    await wait(700);
    const state = nodes();
    field = state.find(n => n.app === 'com.android.chrome' && n.editable && !n.password && n.text.startsWith('We will meet tomorrow.'));
    const welcome = state.find(n => n.app === 'com.android.chrome' && n.clickable && ['Use without an account', 'No thanks'].includes(n.text));
    if (!field && welcome) nodes(welcome.text);
  }
  assert.ok(field, 'Chrome fixture field must be accessible');
  tap(field); await wait(500);
};
const type = async text => { adb('shell', 'input', 'text', text.replaceAll(' ', '%s')); await wait(1900); };
mkdirSync(out, { recursive: true });
const prefs = adb('shell', 'su', '0', 'cat', '/data/data/dev.ownvoice.next/shared_prefs/ownvoice-native.xml');
assert.match(prefs, /name="typingCheck" value="true"/, 'Enable typing checks before running this journey');
await new Promise(r => page.listen(0, '127.0.0.1', r));
const port = page.address().port;
adb('reverse', `tcp:${port}`, `tcp:${port}`);
try {
  await open('small'); await type('teh meeting moved.');
  let small;
  for (let i = 0; i < 10; i++) { small = bubble(nodes()); if (/thing.*to check/.test(small?.label ?? '')) break; await wait(700); }
  assert.match(small?.label ?? '', /thing.*to check/, 'Small field must answer before the capped-field check');
  results.push({ phase: 'small', domLength, bubble: small.label });
  shot('typing-small');
  if (process.env.OWNVOICE_RECORD === '1') {
    execFileSync('.agents/skills/verify-ownvoice/evidence.sh', ['motion-start', task, `typing-limit-${label}-${theme}`], { stdio: 'inherit', env: { ...process.env, ANDROID_SERIAL: serial } });
    recording = true;
  }
  await open('large'); await type('teh meeting moved.');
  let state = nodes();
  const capped = bubble(state);
  const field = state.find(n => n.app === 'com.android.chrome' && n.editable && n.focused);
  const warned = state.some(n => n.label.includes(notice) || n.text.includes(notice));
  const badgeCleared = !!capped && !/thing.*to check/.test(capped.label);
  assert.ok(domLength > 10000, 'Fixture must really exceed the Chrome cap');
  results.push({ phase: 'capped', domLength, accessibleLength: field?.text.length, bubble: capped?.label, warned, badgeCleared });
  shot('typing-capped');
  await wait(6500); // let the existing six-second notice pill close before the ordinary bubble tap
  tap(bubble(nodes())); await wait(2400);
  state = nodes();
  const panelWarned = state.some(n => n.text === notice || n.label === notice);
  const writes = state.filter(n => n.clickable && n.enabled && ['Fix', 'Insert', 'Use this'].some(label => n.text === label || n.label === label));
  const cutWordFlags = state.filter(n => ['tomor', 'tumor'].includes(n.text) || ['tomor', 'tumor'].includes(n.label));
  results.push({ phase: 'panel', domLength, panelWarned, writes: writes.length, cutWordFlags: cutWordFlags.map(n => n.text || n.label) });
  shot('typing-panel');
  adb('shell', 'input', 'keyevent', '4'); await wait(700);
  tap(field); await type('recieve this note.');
  const stillClear = !/thing.*to check/.test(bubble(nodes())?.label ?? '');
  await open('small'); await type('recieve this note.');
  const fresh = bubble(nodes());
  results.push({ phase: 'fresh', domLength, bubble: fresh?.label });
  shot('typing-fresh');
  assert.ok(badgeCleared && stillClear, 'Capped field must not show a stale or misleading count');
  assert.ok(warned && panelWarned, 'Partial checks must be disclosed on the bubble and in the panel');
  assert.equal(writes.length, 0, 'A partial capture must not offer Fix or Insert that replaces the whole field');
  assert.equal(results.find(r => r.phase === 'panel').domLength, 11518, 'Panel proof must use the reported practice note');
  assert.equal(cutWordFlags.length, 0, 'The cap must not turn tomorrow into a tomor/tumor advisory');
  assert.match(fresh?.label ?? '', /thing.*to check/, 'A fresh field must resume ordinary checks');
  console.log('PASS: capped-field disclosure, no misleading count, partial write or cut-word flag, fresh-field recovery');
} finally {
  if (recording) execFileSync('.agents/skills/verify-ownvoice/evidence.sh', ['motion-stop'], { env: { ...process.env, ANDROID_SERIAL: serial } });
  writeFileSync(resolve(out, `typing-limit-${label}-${theme}.json`), JSON.stringify(results, null, 2));
  page.close(); adb('reverse', '--remove', `tcp:${port}`);
}

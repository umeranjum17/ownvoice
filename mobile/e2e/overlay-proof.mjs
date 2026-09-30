// OV-7 service/geometry/privacy proof. Run after driver.mjs enables Ownvoice and Chrome.
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { accessibilityProbe, center } from './accessibility.mjs';
const serial = process.env.ANDROID_SERIAL;
const out = resolve(process.argv[2] ?? 'e2e/artifacts');
const nodes = accessibilityProbe(serial, out); // refuses non-owned AVDs before any changes
const pkg = 'dev.ownvoice.next';
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
const wait = ms => new Promise(r => setTimeout(r, ms));
const tap = n => adb('shell', 'input', 'tap', ...center(n).map(x => String(Math.round(x))));
const bubble = list => list.find(n => n.windowType === 4 && /^Ownvoice(?:,|$)/.test(n.label));
const requireBubble = () => { const n = bubble(nodes()); if (!n) throw new Error('Ownvoice bubble absent'); return n; };
const route = async path => { adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `ownvoice://${path}`); await wait(1500); };
const snap = name => { adb('shell', 'screencap', '-p', `/sdcard/${name}.png`); adb('pull', `/sdcard/${name}.png`, resolve(out, `${name}.png`)); };
const pref = () => adb('shell', 'su', '0', 'cat', `/data/data/${pkg}/shared_prefs/ownvoice-native.xml`);
const typing = () => /name="typingCheck" value="true"/.test(pref());
const toggleTyping = async () => {
  await route('/');
  const n = nodes().find(n => n.clickable && n.label.startsWith('Check my spelling as I type,'));
  if (!n) throw new Error('Typing choice inaccessible');
  nodes(n.label); await wait(1000);
};
mkdirSync(out, { recursive: true });
const results = [];
const page = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:18px sans-serif;padding:24px}textarea,input{display:block;width:90%;margin:24px 0;padding:12px;font:18px sans-serif}</style><h1>Typing proof</h1><textarea aria-label="Typing proof" rows="3"></textarea><input type="password" aria-label="Password proof">'); });
await new Promise(r => page.listen(0, '127.0.0.1', r));
const port = page.address().port;
adb('reverse', `tcp:${port}`, `tcp:${port}`);
const openChrome = async () => { adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `http://127.0.0.1:${port}`); await wait(2500); };
try {
  if (typing()) await toggleTyping(); // reset a previous interrupted proof through the app's own control
  await openChrome();
  const initial = requireBubble();
  const [x, y] = center(initial).map(Math.round);
  adb('shell', 'input', 'swipe', String(x), String(y), String(x), '2200', '600');
  await wait(1000);
  const saved = requireBubble().bounds;
  const field = nodes().find(n => n.editable && !n.password && n.bounds[1] > 300);
  if (!field) throw new Error('Typing field absent');
  tap(field); await wait(1800);
  const state = nodes(); const dot = bubble(state);
  const focused = state.find(n => n.editable && n.focused && !n.password);
  const ime = state.find(n => n.windowType === 2)?.windowBounds;
  if (!dot || !focused || !ime) throw new Error('Focused field, bubble or keyboard absent');
  const intersects = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  writeFileSync(resolve(out, 'geometry.json'), JSON.stringify({ bubble: dot.bounds, focused: focused.bounds, keyboard: ime, saved }, null, 2));
  snap('after-keyboard');
  if (dot.bounds[3] > ime[1] || intersects(dot.bounds, focused.bounds)) throw new Error('KIT GAP: bubble overlaps keyboard or focused field');
  results.push('Bubble entirely above keyboard and clear of focused field; TalkBack label Ownvoice');
  adb('shell', 'input', 'text', 'I%sthink%sthe%sthe%smeeting%smoved.'); await wait(2000);
  if (requireBubble().label !== 'Ownvoice') throw new Error('Typing check ran while off');
  results.push('Tap-only default: typed repeated word produces no badge while off');
  adb('shell', 'input', 'keyevent', '4'); await wait(1000);
  if (String(requireBubble().bounds) !== String(saved)) throw new Error('Saved Chrome spot did not return when keyboard closed');
  results.push('Chrome spot restored after keyboard closes');
  await toggleTyping(); if (!typing()) throw new Error('Typing opt-in did not persist');
  await openChrome(); tap(nodes().find(n => n.editable && !n.password && n.bounds[1] > 300));
  adb('shell', 'input', 'text', 'I%sthink%sthe%sthe%smeeting%smoved.'); await wait(2500);
  if (!requireBubble().label.includes('thing')) throw new Error('Opt-in typing pause produced no count');
  results.push(`Opt-in focused-field typing check: ${requireBubble().label}`);
  await toggleTyping(); await toggleTyping(); // clear prior count before the protected-field check
  await openChrome(); const password = nodes().find(n => n.editable && n.password); if (!password) throw new Error('Password field absent');
  tap(password); adb('shell', 'input', 'text', 'I%sthink%sthe%sthe%smeeting%smoved.'); await wait(2000);
  if (requireBubble().label !== 'Ownvoice') throw new Error('Password typing produced a badge');
  results.push('Password field never checked');
  await toggleTyping();
  await route('/'); requireBubble();
  const pid = adb('shell', 'pidof', pkg).trim(); if (!/^\d+$/.test(pid)) throw new Error('Expected one Ownvoice process');
  adb('shell', 'su', '0', 'kill', '-9', pid);
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`); await wait(5000);
  requireBubble(); results.push('Bubble restored after kill -9 and am start without service toggles'); snap('after-process-death');
  adb('reboot'); await wait(3000); adb('wait-for-device');
  let ready = false;
  for (let i = 0; i < 90; i++) { if (adb('shell', 'getprop', 'sys.boot_completed').trim() === '1') { ready = true; break; } await wait(1000); }
  if (!ready) throw new Error('Emulator reboot did not complete');
  adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'); adb('shell', 'input', 'keyevent', '82');
  await route('/'); await wait(4000); requireBubble();
  results.push('Bubble restored after emulator reboot without service toggles'); snap('after-reboot');
  console.log(results.join('\n'));
} finally {
  writeFileSync(resolve(out, 'results.json'), JSON.stringify(results, null, 2));
  page.close(); if (adb('reverse', '--list').includes(`tcp:${port}`)) adb('reverse', '--remove', `tcp:${port}`);
}

// OV-7 service/geometry/privacy proof. Run after driver.mjs enables Ownvoice and Chrome.
import { execFileSync, spawn } from 'node:child_process';
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
const snap = name => writeFileSync(resolve(out, `${name}.png`), execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 }));
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
const page = createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:18px sans-serif;padding:24px}textarea,input{display:block;width:90%;margin:24px 0;padding:12px;font:18px sans-serif}</style><h1>${req.url === '/x' ? 'Home' : 'Typing proof'}</h1>${req.url === '/x' ? '<p>Umer · Posting as Umer</p>' : ''}<textarea aria-label="${req.url === '/x' ? 'What is happening' : 'Typing proof'}" rows="3"></textarea>${req.url === '/x' ? '<p>Post</p>' : '<input type="password" aria-label="Password proof">'}${req.url === '/failed' ? `<script>let timer; document.querySelector('textarea').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { const old = document.querySelector('textarea'); const replacement = old.cloneNode(); replacement.value = 'Leave this message unchanged'; replacement.readOnly = true; old.replaceWith(replacement); }, 12000); });</script>` : ''}`); });
await new Promise(r => page.listen(0, '127.0.0.1', r));
const port = page.address().port;
adb('reverse', `tcp:${port}`, `tcp:${port}`);
const openChrome = async () => { adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `http://127.0.0.1:${port}`); await wait(2500); };
// Narrow spelling journey: opt-in/setup must already be complete, as for this driver.
async function typingFixProof() {
  const checks = [], timings = [], insertions = [];
  const verify = (name, ok, detail = '') => {
    checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
    if (!ok) throw new Error(`${name}: ${detail}`);
  };
  const field = () => nodes().find(n => n.editable && !n.password);
  const read = () => field()?.text ?? '';
  const fill = async text => {
    const f = field(); if (!f) throw new Error('Editable field absent');
    tap(f); await wait(500);
    adb('shell', 'input', 'keycombination', '113', '29');
    adb('shell', 'input', 'keyevent', '67');
    adb('shell', 'input', 'text', text.replaceAll(' ', '%s'));
    await wait(2000);
    verify('exact field input', read() === text, JSON.stringify(read()));
  };
  const expectBadge = count => verify(`badge ${count}`, requireBubble().label ===
    (count ? `Ownvoice, ${count === 1 ? 'one thing to check' : `${count} things to check`}` : 'Ownvoice'), requireBubble().label);
  const showPanel = async () => {
    tap(requireBubble()); await wait(4500);
    verify('Check these present', nodes().some(n => /check these/i.test(`${n.label} ${n.text}`)));
    verify('Fix present', nodes().some(n => n.clickable && (n.text === 'Fix' || n.label === 'Fix')));
  };
  const fix = async expected => {
    nodes('Fix'); await wait(8000); // let native confirmation and clipboard previews settle
    verify('Fix changes only the chosen word', read() === expected, JSON.stringify(read()));
    const log = adb('shell', 'logcat', '-d', '-s', 'OwnvoiceNative:D');
    insertions.push([...log.matchAll(/insert result ok=(true|false)/g)].at(-1)?.[1] === 'true');
    writeFileSync(resolve(out, 'insert-logcat.txt'), log);
  };
  const open = async path => {
    const navigate = () => adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `http://127.0.0.1:${port}${path}`);
    navigate(); await wait(2500);
    let privacyNotice = false;
    for (let i = 0; i < 6 && !field(); i++) {
      const list = nodes();
      privacyNotice ||= list.some(n => /Enhanced ad privacy in Chrome/.test(`${n.label} ${n.text}`));
      const button = privacyNotice && list.find(n => n.clickable && /^(More|Got it)$/.test(n.text));
      if (button) { nodes(button.text); await wait(500); }
      else await wait(1000);
    }
    if (privacyNotice) { navigate(); await wait(2000); }
  };
  const recordStop = async recording => {
    const pid = adb('shell', 'pidof', 'screenrecord').trim();
    if (pid) adb('shell', 'kill', '-2', ...pid.split(/\s+/));
    await new Promise(resolve => recording.exitCode !== null ? resolve() : recording.once('exit', resolve));
    adb('pull', '/data/local/tmp/ov-pm-10.mp4', resolve(out, 'chrome-typing.mp4'));
  };
  const theme = process.env.OWNVOICE_THEME;
  if (!['light', 'dark'].includes(theme)) throw new Error('Set OWNVOICE_THEME before launching the app.');
  try {
    // Reuse completed first-run setup, then explicitly opt Chrome in through its app row.
    adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
    let home = false;
    for (let i = 0; i < 20 && !home; i++) {
      await wait(1000);
      home = nodes().some(n => /Where the bubble shows/.test(`${n.label} ${n.text}`));
    }
    verify('first-run setup complete', home);
    if (!typing()) await toggleTyping();
    await route('apps');
    const chrome = () => nodes().find(n => n.checkable && /chrome/i.test(`${n.label} ${n.text}`));
    if (!chrome()?.checked) {
      const row = chrome(); if (!row) throw new Error('Chrome app row absent');
      nodes(row.label || row.text); await wait(1000);
    }
    verify('Chrome app enabled', !!chrome()?.checked);
    verify(`${theme} colour mode`, adb('shell', 'dumpsys', 'uimode').includes(`mComputedNightMode=${theme === 'dark'}`));
      await open('/');
      await fill('I should finish the report by tonight'); expectBadge(0);
      await fill('Its a good plan, I shoud teh report and recieve it by the the evening'); expectBadge(5);
      snap(`${theme}-five-slips`);
      await fill('This is a longer note about the plan for the weekend and all the things we need to prepare before everyone arrives on Friday evening for dinner. I shoud bring the extra chairs from the garage and check whether we still have enough plates for the whole group. Please tell me if anything else is missing from the list so we can pick it up on the way home tomorrow after work in the afternoon.'); expectBadge(1);
      await open('/x');
      let recording;
      if (theme === 'light') {
        recording = spawn('adb', ['-s', serial, 'shell', 'screenrecord', '--time-limit', '180', '/data/local/tmp/ov-pm-10.mp4']);
        await wait(500);
      }
      try {
        adb('shell', 'logcat', '-c');
        await fill('I shoud finish the report by tonight'); expectBadge(1);
        const log = adb('shell', 'logcat', '-d', '-s', 'OwnvoiceNative:D');
        const times = [...log.matchAll(/typing check ms=([\d.]+) badge ms=([\d.]+) count=1/g)];
        const timing = times.at(-1);
        verify('badge within 1 second', !!timing && Number(timing[2]) < 1000, timing?.[0] ?? log);
        timings.push({ theme, checkMs: Number(timing[1]), badgeMs: Number(timing[2]) });
        await showPanel(); snap(`${theme}-before-fix`);
        await fix('I should finish the report by tonight'); expectBadge(0); snap(`${theme}-after-fix`);
        // Two successive Fixes must preserve the first edit and use refreshed offsets.
        await fill('Its a good plan, I shoud finish the report'); expectBadge(2);
        await showPanel(); await fix("It's a good plan, I shoud finish the report"); expectBadge(1);
        await showPanel(); await fix("It's a good plan, I should finish the report"); expectBadge(0);
      } finally { if (recording) await recordStop(recording); }
    if (theme === 'dark') {
      adb('shell', 'settings', 'put', 'system', 'font_scale', '1.3');
      await open('/x');
      await fill('I shoud finish the report by tonight'); await showPanel(); snap('font13-before-fix');
      await fix('I should finish the report by tonight'); expectBadge(0); snap('font13-after-fix');
    }
    verify('native confirms every Fix (not clipboard fallback)', insertions.length > 0 && insertions.every(Boolean), JSON.stringify(insertions));
    if (theme === 'light') {
      // Replace the captured field while the panel is open: matching text/bounds
      // must not make a different, now read-only node a successful insert.
      await open('/failed');
      adb('shell', 'logcat', '-c');
      await fill('I shoud finish the report by tonight'); await showPanel();
      await wait(14000);
      nodes('Fix'); await wait(8000);
      verify('failed insert preserves replacement field', nodes().some(n => n.text === 'Leave this message unchanged'));
      const log = adb('shell', 'logcat', '-d', '-s', 'OwnvoiceNative:D');
      writeFileSync(resolve(out, 'failed-insert-logcat.txt'), log);
      verify('real failed insert reports false', [...log.matchAll(/insert result ok=(true|false)/g)].at(-1)?.[1] === 'false');
      snap('failed-insert');
    }
  } catch (error) {
    writeFileSync(resolve(out, 'failure-logcat.txt'), adb('shell', 'logcat', '-d', '-s', 'OwnvoiceNative:D', 'AndroidRuntime:E', 'ReactNativeJS:V'));
    writeFileSync(resolve(out, 'failure-accessibility.txt'), adb('shell', 'dumpsys', 'accessibility'));
    writeFileSync(resolve(out, 'failure-nodes.json'), JSON.stringify(nodes(), null, 2));
    snap('failure-screen');
    throw error;
  } finally {
    adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0');
    writeFileSync(resolve(out, 'typing-results.json'), JSON.stringify(checks, null, 2));
    writeFileSync(resolve(out, 'timing.md'), '| theme | check ms | badge ms |\n|---|---|---|\n' + timings.map(t => `| ${t.theme} | ${t.checkMs} | ${t.badgeMs} |`).join('\n') + '\n');
  }
}
try {
  if (process.argv.includes('--typing-fix')) {
    await typingFixProof();
  } else {
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
  }
} finally {
  writeFileSync(resolve(out, 'results.json'), JSON.stringify(results, null, 2));
  page.close(); if (adb('reverse', '--list').includes(`tcp:${port}`)) adb('reverse', '--remove', `tcp:${port}`);
}

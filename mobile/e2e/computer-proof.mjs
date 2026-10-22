// "Use my computer" journey on an owned emulator: pair with the real helper (link/host.mjs, your own signed-in
// Claude), compare the two words, then type a reply in Chrome and read the drafts the computer wrote. Then stop the
// helper and tap again: the panel must say the computer didn't answer (an emulator's phone can't write). Then Forget this
// computer twice: with the helper off (phone forgets, says the computer was not told) and on (helper drops the phone too).
// Release APK, no stub flags. Env: ANDROID_SERIAL, OWNVOICE_AVD_NAME, JAVA_HOME, ANDROID_HOME. Args: <apk> <out-dir>.
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { accessibilityProbe, center, emulatorName } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL;
if (!/^emulator-\d+$/.test(serial ?? '')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator.');
const avd = process.env.OWNVOICE_AVD_NAME;
if (!avd || emulatorName(serial) !== avd) throw new Error(`Refusing ${serial}: AVD ${emulatorName(serial)} is not ${avd}.`);
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = resolve(process.argv[3] ?? 'e2e/artifacts/computer');
mkdirSync(out, { recursive: true });
const REPLY = 'i think we should meet tomorrow at 10 to go over the plan and the budget';
const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const PORT = 7442;

const nodes = accessibilityProbe(serial, out);
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = line => { const s = `${new Date().toISOString().slice(11, 19)} ${line}`; console.log(s); appendFileSync(resolve(out, 'computer-run.log'), s + '\n'); };
const snap = name => { execFileSync('sh', ['-c', `adb -s ${serial} exec-out screencap -p > '${resolve(out, name)}.png'`]); };
const [width, height] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
const tap = (x, y) => adb('shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y)));
const type = async text => { for (const word of text.split(' ')) { adb('shell', 'input', 'text', word); await wait(700); } };
const find = pred => nodes().find(pred);
const findText = label => find(n => `${n.label} ${n.text}`.toLowerCase().includes(label.toLowerCase()));
const screenWords = () => nodes().map(n => n.text || n.label).filter(Boolean).join(' | ').slice(0, 260);
const waitText = async (label, tries = 40) => {
  const wanted = Array.isArray(label) ? label : [label];
  for (let i = 0; i < tries; i++) {
    const all = nodes();
    const find1 = l => all.find(n => `${n.label} ${n.text}`.toLowerCase().includes(l.toLowerCase()));
    const n = wanted.map(find1).find(Boolean); if (n) return n;
    // A slow emulator shows "isn't responding" boxes: wait them out.
    if (find1("isn't responding") && find1('wait')) tap(...center(find1('wait')));
    await wait(1000);
  }
  throw new Error(`Could not see "${wanted.join('" or "')}": ${screenWords()}`);
};
const tapText = async label => { const n = await waitText(label, 20); tap(...center(n)); return n; };
const bubble = () => find(n => n.windowType === 4 && /^Ownvoice(?:,|$)/.test(n.label));

const setService = async () => {
  const put = want => {
    const cur = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
    const set = new Set(cur === 'null' ? [] : cur.split(':'));
    want ? set.add(component) : set.delete(component);
    adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...set].join(':') || 'com.example.disabled/NoService');
  };
  put(false); await wait(1500); put(true);
  adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
  for (let i = 0; i < 45 && !adb('shell', 'dumpsys', 'accessibility').includes(component); i++) await wait(1000);
  if (!adb('shell', 'dumpsys', 'accessibility').includes(component)) throw new Error('Accessibility service did not bind.');
};
const deepLink = to => adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', to, pkg);

// The helper: the real one, stdin piped so this script answers "yes" at the pairing question.
const helperHome = mkdtempSync(resolve(tmpdir(), 'ov-link-'));
const trusted = () => { try { return JSON.parse(readFileSync(resolve(helperHome, 'ownvoice-computer', 'phones.json'), 'utf8')).length; } catch { return 0; } };
const helper = () => {
  const child = spawn('node', [resolve('../link/host.mjs'), '--port', String(PORT), '--url', `ws://10.0.2.2:${PORT}`], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, XDG_CONFIG_HOME: helperHome } });
  let text = '';
  child.stdout.on('data', d => { text += d; process.stdout.write(d); });
  return { child, seen: () => text };
};

execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
adb('shell', 'pm', 'clear', pkg);
await setService();
// A cold emulator can show a launcher "isn't responding" box: wait it out, then open the app.
const stuck = findText("isn't responding"); if (stuck) { const w = findText('wait'); if (w) tap(...center(w)); }
adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
// Finish setup with no writer (hardware Back on the welcome), then switch Chrome on in the app's own list.
await waitText('sound like you', 30); adb('shell', 'input', 'keyevent', '4'); await wait(2500);
await waitText('where the bubble shows', 30);
deepLink('ownvoice://apps'); await tapText('find an app'); await type('Chrome'); adb('shell', 'input', 'keyevent', '4'); await wait(600);
const row = await waitText('chrome', 20);
if (!find(n => n.checkable && n.label === 'Chrome' && n.checked)) tap(...center(row));
await wait(1500);

const pairWithHelper = async tag => {
  const host = helper();
  for (let i = 0; i < 30 && !/BYOKIT-LINK:/.test(host.seen()); i++) await wait(500);
  const offer = host.seen().match(/BYOKIT-LINK:\S+/)?.[0];
  if (!offer) throw new Error('The helper printed no pairing code.');
  deepLink('ownvoice://computer'); await waitText('paste the code');
  snap(`${tag}-computer-start`);
  tap(...center(await waitText('paste the code')));
  await wait(600);
  for (let i = 0; i < offer.length; i += 6) { adb('shell', 'input', 'text', `'${offer.slice(i, i + 6)}'`); await wait(500); } // a long string loses characters on a slow emulator
  await wait(800);
  adb('shell', 'input', 'keyevent', '4'); await wait(600);
  await tapText('pair');
  await waitText('check your computer shows these two words');
  snap(`${tag}-computer-words`);
  const words = nodes().flatMap(n => (n.text ?? '').split('\n')).map(t => t.trim()).find(t => /^[a-z]+ [a-z]+$/.test(t));
  for (let i = 0; i < 20 && !/wants to pair/.test(host.seen()); i++) await wait(500);
  if (!host.seen().includes(`"${words}"`)) throw new Error(`The computer asks about different words than the phone shows (${words}).`);
  log(`words match on both sides: ${words}`);
  host.child.stdin.write('y\n');
  await waitText('paired with', 30);
  snap(`${tag}-computer-paired`);
  return host;
};
const host = await pairWithHelper('1');

const page = await new Promise(ok => { const s = createServer((_q, r) => r.end(readFileSync(new URL('./page.html', import.meta.url)))); s.listen(0, '127.0.0.1', () => ok(s)); });
execFileSync('adb', ['-s', serial, 'reverse', `tcp:${page.address().port}`, `tcp:${page.address().port}`]);
const panel = async (tag, want) => {
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `http://127.0.0.1:${page.address().port}`); await wait(3500);
  for (let i = 0; i < 12 && !findText('textarea'); i++) {
    const n = ['accept & continue', 'without an account', 'no thanks', 'got it'].map(findText).find(Boolean);
    if (n) tap(...center(n));
    await wait(1200);
  }
  tap(width / 2, center(await waitText('textarea', 20))[1] + 230); await wait(700);
  await type(REPLY); await wait(4500);
  const b = bubble(); if (!b) throw new Error('Ownvoice bubble is not visible.');
  tap(...center(b));
  await waitText(want, 120); await wait(1500);
  snap(tag);
  return nodes();
};
const withDrafts = process.env.COMPUTER_PROOF_FORGET_ONLY !== '1'; // the forget legs need no live Claude or Chrome
let ready = [];
if (withDrafts) ready = await panel('4-computer-drafts', 'pick one to use instead of what you wrote');
const drafts = ready.map(n => (n.text || '').trim()).filter(t => t.length > 12 && t.toLowerCase() !== REPLY && !/^[A-Z0-9 .,'’:-]+$/.test(t) && !/^pick one|^polish your/i.test(t));
if (withDrafts && !drafts.length) throw new Error('The panel showed no drafts from the computer.');
if (withDrafts) log(`drafts from the computer: ${JSON.stringify(drafts).slice(0, 300)}`);

host.child.kill();
adb('shell', 'input', 'keyevent', '4'); await wait(1500);
if (withDrafts) await panel('5-computer-off', "didn't answer");
if (withDrafts) log('helper stopped: the panel says the computer did not answer');
page.close();

// Forget with the computer off: the phone forgets, says the computer was not told, and the helper still trusts the phone.
if (trusted() !== 1) throw new Error(`Expected the helper to trust one phone, it trusts ${trusted()}.`);
deepLink('ownvoice://computer'); await tapText('forget this computer');
await waitText("wasn't told"); await waitText('paste the code');
snap('6-forget-computer-off');
if (trusted() !== 1) throw new Error('The helper dropped the phone although it was off.');
log('forget with the computer off: phone forgot, user told the computer was not told, helper still trusts the phone');

// Forget with the computer on: the helper drops the phone too and the user sees no warning.
const again = await pairWithHelper('7');
await tapText('forget this computer');
await waitText('paste the code');
if (findText("wasn't told")) throw new Error('The phone said the computer was not told although it was on.');
snap('8-forget-computer-on');
for (let i = 0; i < 20 && trusted() !== 0; i++) await wait(500);
if (trusted() !== 0) throw new Error('The helper still trusts the phone after it was forgotten.');
log('forget with the computer on: helper no longer trusts the phone, no warning shown');
again.child.kill();

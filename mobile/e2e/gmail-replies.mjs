// Gmail thread replies proof (done-done journey gmail-replies), on a Gmail-style lab fixture
// (mobile/e2e/fixture-gmail) installed under Gmail's package id on an emulator without the real Gmail
// (Google APIs images preinstall it; the error below says how to remove it from a throwaway AVD). Proves: the bubble tapped on an open thread reads the mail and offers three reply cards
// (Accept / Say no, kindly / Ask first) grounded on it; a card's Reply opens the thread's own Reply
// and the draft lands in the reply's body box (read back from the screen, plus the app's own insert
// log), with Send never pressed; the inbox, which has no thread open, gets the plain "Open the email…"
// note and no writer request. GMAIL_BEFORE=1 runs the thread leg against a base build and expects its
// withhold note instead. Light, dark, and dark at 720x1280 with font 1.3 (the card's longer button).
// The writer is real: the host's e2e/pi-writer.mjs (DeepSeek Flash through @byokit/decide's pi
// backend, Haiku fallback, no provider key or sign-in), reached through the app's own OpenRouter key
// route, so the APK must be built with EXPO_PUBLIC_E2E_OPENROUTER_BASE=http://10.0.2.2:<PI_WRITER_PORT>/api/v1.
// Captures land in verify-artifacts/<task>/ through mobile/e2e/evidence.sh.
// Env: ANDROID_SERIAL=emulator-NNNN, OWNVOICE_AVD_NAME=<owned avd>, JAVA_HOME, ANDROID_HOME,
// PI_WRITER_PORT (default 18793), GMAIL_BEFORE=1 for the base build. Args: <release-apk> [task-slug].
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accessibilityProbe, center } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const task = process.argv[3] ?? 'ov-gmail-replies-real';
const before = process.env.GMAIL_BEFORE === '1';
const piPort = Number(process.env.PI_WRITER_PORT ?? 18793);
const root = resolve(fileURLToPath(import.meta.url), '../../..');
const out = `${root}/verify-artifacts/${task}`;
mkdirSync(out, { recursive: true });
const pkg = 'dev.ownvoice.next';
const gmail = 'com.google.android.gm';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const nodes = accessibilityProbe(serial, resolve(root, 'mobile/e2e'));
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 });
const evidence = (...args) => execFileSync('bash', [`${root}/mobile/e2e/evidence.sh`, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, ANDROID_SERIAL: serial } });
const shot = (screen, label, theme) => evidence('shot', task, before ? `before-${screen}` : screen, label, theme);
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = line => console.log(line);
const tap = (x, y) => adb('shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y)));
const png = () => execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 24 * 1024 * 1024 });
const screenText = () => execFileSync('tesseract', ['stdin', 'stdout'], { input: png(), encoding: 'utf8' }).toLowerCase().replace(/\s+/g, ' ').trim();
const nodeText = () => nodes().map(n => `${n.text ?? ''} ${n.label ?? ''}`).join(' ').toLowerCase();
const panelText = phrase => nodes().some(n => `${n.text} ${n.label}`.includes(phrase));
const focus = () => adb('shell', 'dumpsys', 'window').match(/mCurrentFocus=.*/)?.[0] ?? '';
let failures = 0;
const until = async (what, read, { seconds = 30, every = 600 } = {}) => {
  const end = Date.now() + seconds * 1000;
  let last = '';
  for (;;) {
    try { const value = await read(); if (value) return value; } catch (error) { last = String(error.message).slice(0, 200); }
    if (Date.now() >= end) break;
    await wait(every);
  }
  const name = `${out}/failures/${++failures}-${what.replace(/\W+/g, '-').slice(0, 48)}`;
  try {
    mkdirSync(`${out}/failures`, { recursive: true });
    writeFileSync(`${name}.png`, png());
    writeFileSync(`${name}.txt`, `${focus()}\n${nodes().map(n => `${n.editable ? 'E' : '-'}${n.clickable ? 'C' : '-'} ${n.app} lbl="${n.label}" txt="${n.text}" ${JSON.stringify(n.bounds)}`).join('\n')}\n`);
  } catch { /* the timeout below still names what never showed */ }
  throw new Error(`Timed out after ${seconds}s waiting for ${what}${last ? ` (last read error: ${last})` : ''}. Screen: ${name}.png`);
};
const click = (label, seconds = 20) => until(`a clickable "${label}"`, () => { nodes(label); return true; }, { seconds });
const setServices = list => adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', list.join(':'));
const others = () => { const enabled = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim(); return (enabled === 'null' ? [] : enabled.split(':')).filter(x => x && x !== component); };
const serviceOff = async () => { const rest = others(); setServices(rest.length ? rest : ['com.example.disabled/NoService']); await wait(2500); };
// Reinstall or a stop leaves the service unbound until the enabled list changes (AGENTS.md): toggle it off and on.
const rebind = async () => {
  await serviceOff();
  setServices([...others(), component]);
  adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
  await until('the Ownvoice service to bind', () => adb('shell', 'dumpsys', 'accessibility').includes(component), { seconds: 20 });
};
const openUntil = async phrase => {
  for (let i = 0; i < 40; i++) {
    if (screenText().includes(phrase)) return;
    adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
    await wait(1500);
  }
  throw new Error(`The "${phrase}" screen never showed.`);
};
const tapButton = async text => {
  for (let i = 0; i < 20; i++) {
    const button = nodes().find(n => n.clickable && `${n.text} ${n.label}`.toLowerCase().includes(text));
    if (button) { tap(...center(button)); return; }
    await wait(1000);
  }
  throw new Error(`No "${text}" button.`);
};
// The panel's Reply on the first card; Gmail's own Reply buttons sit behind the panel in another app.
const panelReply = all => all.filter(n => n.app === pkg && n.clickable && (n.text === 'Reply' || n.label === 'Reply')).sort((a, b) => a.bounds[1] - b.bounds[1])[0];
const bubble = () => until('the Ownvoice bubble', () => nodes().find(n => n.windowType === 4 && /^Ownvoice(?:,|$)/.test(n.label)), { seconds: 30, every: 500 });

const fixtureDir = mkdtempSync(join(tmpdir(), 'ov-gmail-fixture-'));
/** The fixture, built host-side the way e2e/own-post.mjs builds its composer. */
function buildFixture() {
  const javaHome = process.env.JAVA_HOME;
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), 'Android/Sdk');
  const env = { ...process.env, PATH: `${javaHome}/bin:${process.env.PATH}` };
  const run = (cmd, args) => execFileSync(cmd, args, { env, stdio: 'pipe' });
  const source = fileURLToPath(new URL('./fixture-gmail/', import.meta.url));
  const build = fixtureDir;
  mkdirSync(join(build, 'classes'), { recursive: true });
  const newest = (dir, re) => readdirSync(dir).filter(x => re.test(x)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
  const tools = join(sdk, 'build-tools', newest(join(sdk, 'build-tools'), /./));
  const platform = join(sdk, 'platforms', newest(join(sdk, 'platforms'), /^android-\d+$/), 'android.jar');
  run(join(javaHome, 'bin/javac'), ['-cp', platform, '-d', join(build, 'classes'), join(source, 'Mail.java'), join(source, 'Compose.java')]);
  run(join(javaHome, 'bin/jar'), ['cf', join(build, 'mail.jar'), '-C', join(build, 'classes'), '.']);
  run(join(tools, 'd8'), ['--lib', platform, '--output', build, join(build, 'mail.jar')]);
  const built = join(build, 'fixture.apk');
  run(join(tools, 'aapt'), ['package', '-f', '-M', join(source, 'AndroidManifest.xml'), '-I', platform, '-F', built]);
  run('zip', ['-j', built, join(build, 'classes.dex')]);
  run(join(tools, 'apksigner'), ['sign', '--ks', fileURLToPath(new URL('../android/app/debug.keystore', import.meta.url)), '--ks-key-alias', 'androiddebugkey', '--ks-pass', 'pass:android', built]);
  return built;
}

// ---- the host writer, the app, its setup and the fixture ----
const piLog = `${out}/pi-writer.log`;
rmSync(piLog, { force: true });
const piWriter = before ? null : spawn('node', [`${root}/mobile/e2e/pi-writer.mjs`, 'serve', String(piPort), piLog], { cwd: root, stdio: 'inherit', env: process.env });
const summary = [];
const leg = async (name, fn) => {
  try { await fn(); summary.push(`${name}: PASS`); log(`${name}: PASS`); }
  catch (error) { summary.push(`${name}: FAIL ${String(error.message).slice(0, 300)}`); log(`${name}: FAIL ${error.message}`); }
  writeFileSync(`${out}/leg-summary${before ? '-before' : ''}.txt`, summary.join('\n') + '\n');
};
const extreme = on => {
  adb('shell', 'settings', 'put', 'system', 'font_scale', on ? '1.3' : '1.0');
  adb('shell', 'wm', 'density', on ? '320' : 'reset');
  adb('shell', 'wm', 'size', on ? '720x1280' : 'reset');
};

try {
  if (piWriter) await until(`the host pi writer on :${piPort}`, async () => {
    try { return (await fetch(`http://127.0.0.1:${piPort}/api/v1/models`, { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; }
  }, { seconds: 20, every: 500 });
  const realGmail = adb('shell', 'pm', 'path', gmail).trim();
  if (realGmail && !realGmail.includes('/data/app/')) throw new Error('This emulator ships the real Gmail, which the fixture cannot replace. On a throwaway AVD started with -writable-system: adb root, adb remount, adb shell rm -rf /product/app/PrebuiltGmail, adb reboot.');
  extreme(false);
  adb('shell', 'cmd', 'uimode', 'night', 'custom_schedule', '-o', 'off');
  evidence('theme', 'light');
  adb('logcat', '-c');
  execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
  execFileSync('adb', ['-s', serial, 'install', '-r', buildFixture()], { stdio: 'inherit' });
  adb('shell', 'pm', 'clear', pkg);
  await serviceOff();
  // An emulator has no phone writer: finish setup with none (Back on the welcome), then connect the
  // OpenRouter key route (pointed at the host writer by the build) where a person connects it.
  await openUntil('sound like you');
  adb('shell', 'input', 'keyevent', '4');
  await wait(2500);
  await openUntil('where the bubble shows');
  if (!before) {
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source', pkg);
    await until('the OpenRouter writer option', () => {
      if (nodeText().includes('with your openrouter')) return true;
      adb('shell', 'input', 'swipe', '540', '1600', '540', '700', '300');
      return false;
    }, { seconds: 40, every: 1500 });
    await tapButton('with your openrouter');
    const keyField = await until('the OpenRouter key field', () => nodes().find(n => `${n.text} ${n.label}`.toLowerCase().includes('paste your openrouter key')));
    tap(...center(keyField));
    await until('the keyboard on the key field', () => /mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method')), { seconds: 15 });
    adb('shell', 'input', 'text', 'sk-or-standin-pi-writer');
    adb('shell', 'input', 'keyevent', '4');
    await tapButton('connect');
    await until('"OpenRouter is connected"', () => nodeText().includes('openrouter is connected'), { seconds: 120, every: 1000 });
    log('writer: OpenRouter key route, answered by the host pi writer.');
  }
  await rebind();

  const openThread = async (screen, extra = []) => {
    adb('shell', 'am', 'force-stop', gmail);
    adb('shell', 'am', 'start', '-n', `${gmail}/.Mail`, ...extra);
    await until(`the fixture's ${screen}`, () => nodeText().includes(screen === 'inbox' ? 'lunch next week' : 'draft numbers'), { seconds: 30 });
  };

  // The inbox has no thread open: a plain note, no card and no writer call.
  const inboxLeg = async theme => {
    await openThread('inbox', ['--es', 'screen', 'inbox']);
    tap(...center(await bubble()));
    const note = before ? 'Reply ideas are unavailable' : 'Open the email you want to answer';
    await until(`the note "${note}"`, () => panelText(note), { seconds: 30 });
    if (nodes().some(n => n.app === pkg && n.clickable && ['Reply', 'Insert', 'Edit'].includes(n.text || n.label))) throw new Error('A card showed over the inbox.');
    shot('gmail-inbox', 'panel', theme);
    await click('Close');
  };

  // The open thread: grounded cards, then a card's Reply into Gmail's own reply box.
  const threadLeg = async (theme, { screen = 'gmail-thread', motion = false } = {}) => {
    await openThread('thread');
    shot(screen, 'mail', theme);
    adb('logcat', '-c');
    if (motion) evidence('motion-start', task, `${screen}-reply-hand-off`);
    try {
      tap(...center(await bubble()));
      if (before) {
        await until('the withhold note', () => panelText('Reply ideas are unavailable'), { seconds: 30 });
        shot(screen, 'panel', theme);
        return;
      }
      const action = await until('a card with its Reply', () => {
        const all = nodes();
        const text = all.filter(n => n.app === pkg).map(n => (n.text || n.label || '').trim()).filter(Boolean).join(' | ');
        if (/unavailable|didn't answer|can't write|couldn't come up/i.test(text)) return { refused: text };
        return panelReply(all);
      }, { seconds: 240, every: 1000 });
      if (action.refused) { shot(screen, 'refused', theme); throw new Error(`The panel showed no cards: ${action.refused.slice(0, 300)}`); }
      await wait(1500); // the other slots land a beat after the first
      shot(screen, 'cards', theme);
      const panel = nodes().filter(n => n.app === pkg && (n.text || '').trim()).sort((a, b) => a.bounds[1] - b.bounds[1]);
      const tags = ['ACCEPT', 'SAY NO, KINDLY', 'ASK FIRST'];
      const cards = [];
      for (const n of panel) {
        if (tags.includes(n.text.trim().toUpperCase())) cards.push({ tag: n.text.trim(), text: '' });
        else if (cards.length && n.text.length > (cards.at(-1).text.length) && !/^(Reply|Edit|Why\?|Write new ones)$/.test(n.text)) cards.at(-1).text = n.text.trim();
      }
      writeFileSync(`${out}/${screen}-cards-${theme}.json`, JSON.stringify(cards, null, 2) + '\n');
      for (const c of cards) log(`card "${c.tag}": ${c.text}`);
      if (!cards.length || !cards[0].text) throw new Error(`No labelled card text read: ${JSON.stringify(cards)}`);
      // Grounded: every card answers this mail, so it names its day, the review or Sam.
      const ungrounded = cards.filter(c => c.text && !/friday|thursday|monday|review|numbers|sam/i.test(c.text));
      if (ungrounded.length) throw new Error(`Cards not grounded on the mail: ${JSON.stringify(ungrounded)}`);
      const draft = cards[0].text;
      // The fixture behind the panel has its own Reply: tap the panel's, the first card's.
      tap(...center(panelReply(nodes())));
      // Gmail's reply opens and the draft lands in its body box; the person presses Send, never the proof.
      const box = await until("the draft in the reply's body box", () => {
        if (!focus().includes(`${gmail}/${gmail}.Compose`)) return false;
        return nodes().find(n => n.app === gmail && n.editable && n.text === draft);
      }, { seconds: 30, every: 400 });
      shot(screen, 'reply-inserted', theme);
      // The app confirms the insert by reading the box back a moment after it lands: wait for its result line.
      const lines = await until("the app's insert result", () => {
        const found = adb('logcat', '-d', '-s', 'OwnvoiceNative:V').split('\n').filter(l => /reply opened|insert verify|insert result/.test(l));
        return found.some(l => /insert result/.test(l)) && found;
      }, { seconds: 15, every: 300 });
      writeFileSync(`${out}/${screen}-insert-${theme}.txt`, [
        `focus: ${focus()}`,
        `card picked: ${cards[0].tag}: ${draft}`,
        `body box read back: ${JSON.stringify(box.text)} focused=${box.focused}`,
        'send: never pressed (the fixture Send does nothing; the proof never taps it)',
        ...lines,
      ].join('\n') + '\n');
      if (!lines.some(l => /reply opened/.test(l)) || !lines.some(l => /insert result ok=true/.test(l))) throw new Error(`No "reply opened" + verified insert in the log: ${lines.join(' ; ')}`);
    } finally {
      if (motion) evidence('motion-stop');
    }
    // Back out of the reply without sending: the keyboard, then the reply screen.
    adb('shell', 'input', 'keyevent', '4');
    await wait(800);
    if (focus().includes('Compose')) adb('shell', 'input', 'keyevent', '4');
  };

  await leg('thread-light', () => threadLeg('light', { motion: !before }));
  await leg('inbox-light', () => inboxLeg('light'));
  // The app reads the colour scheme at process start: stop it, flip, and rebind (AGENTS.md).
  evidence('theme', 'dark');
  adb('shell', 'am', 'force-stop', pkg);
  await rebind();
  await leg('thread-dark', () => threadLeg('dark'));
  await leg('inbox-dark', () => inboxLeg('dark'));
  if (!before) {
    extreme(true);
    await until('the display at 720x1280', () => /Override size: 720x1280/.test(adb('shell', 'wm', 'size')), { seconds: 15 });
    adb('shell', 'am', 'force-stop', pkg);
    await rebind();
    await leg('thread-extreme', () => threadLeg('dark', { screen: 'gmail-thread-extreme' }));
  }
  if (piWriter) {
    const answered = readFileSync(piLog, 'utf8').split('\n').filter(l => l.includes('answered model='));
    log(`host writer: ${answered.length} answers`);
    if (!answered.length) summary.push('writer: FAIL no real model answer in the host writer log');
  }
} finally {
  try { extreme(false); } catch { /* the next run resets the display too */ }
  piWriter?.kill();
  rmSync(fixtureDir, { recursive: true, force: true });
  writeFileSync(`${out}/leg-summary${before ? '-before' : ''}.txt`, summary.join('\n') + '\n');
}
// The run's step record, for done-done: what a person did and what they saw at the end.
const version = readFileSync(`${root}/mobile/app.config.js`, 'utf8').match(/version: '([^']+)'/)?.[1] ?? 'unknown';
writeFileSync(`${out}/steps${before ? '-before' : ''}.json`, JSON.stringify({
  target: { version: `${version} (${before ? 'base build' : 'this change'}, ${apk.split('/').pop()})` },
  start: 'Ownvoice set up with a writer; the Gmail-style lab fixture open on an email from Sam Lee asking to move a review',
  steps: before
    ? ['Tap the bubble on the open email thread', 'Read the panel', 'Close it; open the inbox and tap the bubble there']
    : ['Tap the bubble on the open email thread', 'Read the three reply cards (Accept, Say no, kindly, Ask first)', "Tap the first card's Reply", "See Gmail's reply screen open with that reply in its box; do not press Send", 'Open the inbox and tap the bubble there'],
  result: before
    ? 'The thread shows "Reply ideas are unavailable for now" and no reply cards'
    : "The reply drafted from the email is in Gmail's reply box, ready for the person to send; the inbox shows the plain open-an-email note",
}, null, 2) + '\n');
const failed = summary.filter(l => l.includes('FAIL'));
log(`Gmail replies proof ${before ? '(before) ' : ''}complete. Evidence in ${out}. Failed: ${failed.length}`);
if (failed.length) process.exitCode = 1;

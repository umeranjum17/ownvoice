// OWNVOICE-RN-08 Replace-only proof, native leg (lead method, no Chrome, no OCR).
// A native EditText host (the repo's Composer fixture, built host-side) is prefilled
// with one realistic message; select-all, the native selection toolbar, the Ownvoice
// PROCESS_TEXT entry; Shorter then Replace; the fixture field value read back through
// the service-safe accessibility probe (uiautomator nodes), never raw dumps.
// Needs OPENCODE_KEY_FILE (the Go key, never logged) and OPENCODE_WORKSPACE.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { accessibilityProbe, center, emulatorName } from './accessibility.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const serial = process.env.ANDROID_SERIAL;
const avdName = process.env.OWNVOICE_AVD_NAME?.trim();
if (!/^emulator-\d+$/.test(serial ?? '') || !avdName) throw new Error('Set ANDROID_SERIAL to an emulator and OWNVOICE_AVD_NAME to its owned AVD name.');
const actualAvd = emulatorName(serial);
if (actualAvd !== avdName) throw new Error(`Refusing ${serial}: AVD ${actualAvd} does not match ${avdName}.`);
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = process.argv[3] ?? 'reports/rn08-replace-native';
const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const rewrite = `${pkg}/dev.ownvoice.bridge.RewriteActivity`;
const fixturePkg = 'com.twitter.android';
const fixtureActivity = `${fixturePkg}/com.twitter.android.Composer`;
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
    if (tries - 1 > i) await wait(600);
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

/** The native Composer fixture, built host-side the way e2e/accessibility.mjs builds the probe. */
function buildFixture(scratch) {
  const javaHome = process.env.JAVA_HOME;
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), 'Android/Sdk');
  const env = { ...process.env, PATH: `${javaHome}/bin:${process.env.PATH}` };
  const run = (cmd, args) => execFileSync(cmd, args, { env, stdio: 'pipe' });
  const build = resolve(scratch, '.composer-fixture-native');
  const classes = join(build, 'classes');
  mkdirSync(classes, { recursive: true });
  const newest = (dir, re) => readdirSync(dir).filter(x => re.test(x)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
  const tools = join(sdk, 'build-tools', newest(join(sdk, 'build-tools'), /./));
  const platform = join(sdk, 'platforms', newest(join(sdk, 'platforms'), /^android-\d+$/), 'android.jar');
  const source = join(build, 'Composer.java');
  writeFileSync(source, readFileSync(join(repoRoot, 'mobile/e2e/fixture/Composer.java'), 'utf8'));
  const manifest = join(build, 'AndroidManifest.xml');
  writeFileSync(manifest, readFileSync(join(repoRoot, 'mobile/e2e/fixture/AndroidManifest.xml'), 'utf8'));
  run(join(javaHome, 'bin/javac'), ['-cp', platform, '-d', classes, source]);
  const jar = join(build, 'composer.jar');
  run(join(javaHome, 'bin/jar'), ['cf', jar, '-C', classes, '.']);
  run(join(tools, 'd8'), ['--lib', platform, '--output', build, jar]);
  const built = join(build, 'fixture.apk');
  run(join(tools, 'aapt'), ['package', '-f', '-M', manifest, '-I', platform, '-F', built]);
  run('zip', ['-j', built, join(build, 'classes.dex')]);
  run(join(tools, 'apksigner'), ['sign', '--ks', join(repoRoot, 'mobile/android/app/debug.keystore'), '--ks-key-alias', 'androiddebugkey', '--ks-pass', 'pass:android', built]);
  return built;
}

try {
  await freshSetup();
  await connectOpenCode();

  const fixtureApk = buildFixture(out);
  try { shell('pm', 'uninstall', fixturePkg); } catch { /* nothing installed yet */ }
  execFileSync('adb', ['-s', serial, 'install', fixtureApk], { stdio: 'inherit' });
  // Reply mode prefills the native field with the realistic message (name, time, number, slips).
  shell('am', 'start', '-n', fixtureActivity, '--es', 'post', "'Umer Demo keeps notes offline to stay focused.'", '--es', 'replyText', `'${TEXT}'`);
  await wait(2500);
  if (!(await waitForFocus(fixturePkg))) fail('fixture', 'the Composer fixture did not come to the front');
  let field;
  for (let i = 0; i < 15 && !field; i++) {
    field = nodes().find(n => n.className === 'android.widget.EditText' && n.editable && (n.text ?? '').includes('Sam'));
    if (!field) await wait(1000);
  }
  await wait(1000);
  shot('step-field-loaded');
  if (!field) fail('fixture', 'the fixture field never showed the prefilled message');
  const [fx, fy] = center(field);
  // Native selection toolbar: focus, select all, keyboard down, long-press on the
  // selection until the toolbar (Copy/Cut/Share) reads. An overflow "Select all" is
  // taken when the first summon only grabs a word.
  const toolbarUp = () => {
    const looksToolbar = /^(copy|cut|share)$/i;
    return nodes().some(n => n.clickable && looksToolbar.test(`${n.text || n.label || ''}`.trim()));
  };
  const selectAllItem = () => nodes().find(n => n.clickable && /select all/i.test(`${n.label} ${n.text}`));
  const overflowItem = () => nodes().find(n => n.clickable && /more options/i.test(`${n.label} ${n.text}`));
  let toolbar = false;
  for (let i = 0; i < 3 && !toolbar; i++) {
    tap(fx, fy);
    await wait(600);
    shell('input', 'keycombination', '113', '29'); // Ctrl+A: full selection even when the toolbar shows no Select all
    await wait(600);
    if (shell('dumpsys', 'input_method').includes('mInputShown=true')) { shell('input', 'keyevent', '4'); await wait(800); }
    shell('input', 'swipe', String(Math.round(fx)), String(Math.round(fy)), String(Math.round(fx)), String(Math.round(fy)), '1100'); // long-press on the selection
    await wait(1200);
    toolbar = toolbarUp();
    if (!toolbar) continue;
    const selectAll = selectAllItem();
    if (selectAll) {
      tap(...center(selectAll)); // a visible Select all means the first summon grabbed a word: widen to the whole message
      await wait(800);
      if (shell('dumpsys', 'input_method').includes('mInputShown=true')) { shell('input', 'keyevent', '4'); await wait(800); }
      shell('input', 'swipe', String(Math.round(fx)), String(Math.round(fy)), String(Math.round(fx)), String(Math.round(fy)), '1100');
      await wait(1200);
      toolbar = toolbarUp();
    }
  }
  shot('step-toolbar');
  if (!toolbar) fail('toolbar', 'the native selection toolbar never appeared after three long-presses');

  // Never the floating bubble (windowType 4): it is clickable and called Ownvoice, and
  // tapping it opens the panel instead of the sheet.
  const ownvoiceNode = list => list.find(n => n.windowType !== 4 && n.clickable && /ownvoice/i.test(`${n.label} ${n.text}`));
  let ownvoice = ownvoiceNode(nodes());
  if (!ownvoice) {
    const overflow = overflowItem();
    if (!overflow) fail('toolbar', 'neither the Ownvoice entry nor the toolbar overflow menu appeared');
    tap(...center(overflow)); // process-text entries sit in the overflow, not on the main bar
    await wait(1200);
    shot('step-overflow');
    for (let i = 0; i < 6 && !ownvoice; i++) {
      ownvoice = ownvoiceNode(nodes());
      if (!ownvoice) await wait(700);
    }
  }
  if (!ownvoice) fail('toolbar', 'the Ownvoice entry never appeared (toolbar and overflow shots saved)');
  shot('step-ownvoice-entry');
  tap(...center(ownvoice));
  if (!(await waitForFocus('RewriteActivity', 15))) fail('sheet', 'the fixture selection did not open Ownvoice');
  if (!(await textPresent('Replace', 5))) fail('sheet', 'Replace not offered on the editable fixture selection');
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
  if (!(await waitForFocus(fixturePkg, 10))) fail('replace', 'the fixture did not come back after Replace');
  await wait(1000);
  shot('step-replaced-field');

  // Read-back through the probe's uiautomator nodes (never a raw dump: that unbinds
  // the service). PROCESS_TEXT hands the rewrite back into the field itself.
  const fieldValue = (nodes().find(n => n.className === 'android.widget.EditText' && n.editable)?.text ?? '').trim();
  const match = fieldValue === rewriteText.trim();
  const lower = fieldValue.toLowerCase();
  const keepsFacts = lower.includes('sam') && lower.includes('friday') && /(3\s?pm|15:00)/.test(lower) && /\b12\b/.test(lower);
  const result = { ok: match && keepsFacts, method: 'uiautomator-probe', rewrite: rewriteText, field: fieldValue, match, keepsFacts };
  writeFileSync(`${out}/replace-result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (!match) fail('readback', `Replace did not put the rewrite in the field (field starts: "${fieldValue.slice(0, 120)}")`);
  if (!keepsFacts) fail('readback', 'the replaced field lost a fact (name, time or number)');
  console.log(`Replace proof saved to ${out}: probe read-back matches the Shorter rewrite, facts kept.`);
  process.exit(0);
} finally {
  // No local page server in the native leg; nothing to close.
}

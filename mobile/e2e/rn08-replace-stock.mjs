// OWNVOICE-RN-08 Replace-only proof, stock-field leg (lead method, no Chrome, no fixture).
// A stock plain-EditText host on the image (Messages compose, else Contacts new-contact
// name): prefill the realistic message, select all, take the native selection toolbar,
// the Ownvoice PROCESS_TEXT entry; Shorter then Replace; the field value read back
// through the service-safe accessibility probe (uiautomator nodes, never a raw dump,
// which would unbind the service). First saves `cmd package query-activities` for
// PROCESS_TEXT/text/plain: Ownvoice unlisted means a product defect, stop and report.
// Needs OPENCODE_KEY_FILE (the Go key, never logged) and OPENCODE_WORKSPACE.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { accessibilityProbe, center, emulatorName } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL;
const avdName = process.env.OWNVOICE_AVD_NAME?.trim();
if (!/^emulator-\d+$/.test(serial ?? '') || !avdName) throw new Error('Set ANDROID_SERIAL to an emulator and OWNVOICE_AVD_NAME to its owned AVD name.');
const actualAvd = emulatorName(serial);
if (actualAvd !== avdName) throw new Error(`Refusing ${serial}: AVD ${actualAvd} does not match ${avdName}.`);
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = process.argv[3] ?? 'reports/rn08-replace-stock';
const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
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
const dumpNodes = name => {
  writeFileSync(`${out}/${name}.json`, JSON.stringify(nodes(), null, 2));
  console.log(`dump ${name}`);
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

try {
  await freshSetup();
  await connectOpenCode();

  // The handler roll-call: who answers PROCESS_TEXT/text/plain on this image?
  const handlers = shell('cmd', 'package', 'query-activities', '-a', 'android.intent.action.PROCESS_TEXT', '-t', 'text/plain');
  writeFileSync(`${out}/handlers.txt`, handlers);
  console.log(`handlers: ${handlers.split('\n').filter(l => l.trim()).length} lines`);
  const dumpsys = shell('dumpsys', 'package', pkg);
  writeFileSync(`${out}/dumpsys-package.txt`, dumpsys);
  if (!/ownvoice/i.test(handlers)) fail('handlers', 'Ownvoice is not listed for PROCESS_TEXT/text/plain: product defect, stopping');

  // Pick the stock plain-EditText host from what the image actually ships.
  const packages = shell('pm', 'list', 'packages');
  writeFileSync(`${out}/packages.txt`, packages);
  const has = p => packages.split('\n').some(l => l.trim() === `package:${p}`);
  const smsPkg = ['com.google.android.apps.messaging', 'com.android.messaging'].find(has);
  const contactsPkg = ['com.google.android.contacts', 'com.android.contacts'].find(has);
  // Contacts before Messages: GMS Messages answers SENDTO with a recipient picker
  // (no compose body to prefill), while Contacts INSERT opens a plain name field.
  let hostPkg = '';
  if (contactsPkg) {
    hostPkg = contactsPkg;
    shell('am', 'start', '-a', 'android.intent.action.INSERT', '-t', 'vnd.android.cursor.dir/contact', '--es', 'name', `'${TEXT}'`);
  } else if (smsPkg) {
    hostPkg = smsPkg;
    shell('am', 'start', '-a', 'android.intent.action.SENDTO', '-d', 'sms:', '--es', 'sms_body', `'${TEXT}'`);
  }
  if (!hostPkg) fail('host', 'no stock Messages or Contacts package on this image');
  await wait(2500);
  if (!(await waitForFocus(hostPkg))) fail('host', `the ${hostPkg} field screen did not come to the front`);
  let field;
  for (let i = 0; i < 15 && !field; i++) {
    field = nodes().find(n => n.className === 'android.widget.EditText' && n.editable && (n.text ?? '').includes('Sam'));
    if (!field) await wait(1000);
  }
  await wait(1000);
  shot('step-field-loaded');
  if (!field) {
    // Contacts may ignore the name extra: type the message into its first empty field instead.
    const empty = nodes().find(n => n.className === 'android.widget.EditText' && n.editable && !(n.text ?? '').trim());
    if (!empty || !contactsPkg || hostPkg !== contactsPkg) fail('host', 'the stock field never showed the prefilled message');
    tap(...center(empty));
    await wait(600);
    execFileSync('adb', ['-s', serial, 'shell', 'input', 'text', `'${TEXT.replaceAll(' ', '%s')}'`]);
    await wait(1000);
    field = nodes().find(n => n.className === 'android.widget.EditText' && n.editable && (n.text ?? '').includes('Sam'));
    shot('step-field-typed');
    if (!field) fail('host', 'typing into the Contacts name field did not take');
  }
  const [fx, fy] = center(field);

  // Native selection toolbar: focus, select all, keyboard down, long-press on the
  // selection until the toolbar reads. A cursor-state toolbar offers "Select all":
  // tapping it widens to the whole message (proven on the fixture leg).
  const actionUp = () => {
    const looksAction = /^(copy|cut|share|select all)$/i;
    return nodes().some(n => n.clickable && looksAction.test(`${n.text || n.label || ''}`.trim()));
  };
  const copyUp = () => {
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
    if (!actionUp()) continue;
    const selectAll = selectAllItem();
    if (selectAll) {
      tap(...center(selectAll)); // cursor/word state: widen to the whole message
      await wait(1000);
      if (!actionUp()) {
        shell('input', 'swipe', String(Math.round(fx)), String(Math.round(fy)), String(Math.round(fx)), String(Math.round(fy)), '1100'); // selection taken but the toolbar closed: summon it back
        await wait(1200);
      }
    }
    toolbar = copyUp();
  }
  shot('step-toolbar');
  dumpNodes('nodes-toolbar'); // uiautomator node dump of the stock full-selection toolbar (probe-backed, service-safe)
  if (!toolbar) fail('toolbar', 'no Copy/Cut/Share toolbar on the stock field after three summons');

  // Never the floating bubble (windowType 4): it is clickable and called Ownvoice, and
  // tapping it opens the panel instead of the sheet.
  const ownvoiceNode = list => list.find(n => n.windowType !== 4 && n.clickable && /ownvoice/i.test(`${n.label} ${n.text}`));
  let ownvoice = ownvoiceNode(nodes());
  if (!ownvoice) {
    const overflow = overflowItem();
    dumpNodes('nodes-overflow-hunt');
    if (!overflow) fail('toolbar', 'neither the Ownvoice entry nor the toolbar overflow menu appeared on the stock field');
    tap(...center(overflow)); // process-text entries sit in the overflow, not on the main bar
    await wait(1200);
    shot('step-overflow');
    dumpNodes('nodes-overflow');
    for (let i = 0; i < 6 && !ownvoice; i++) {
      ownvoice = ownvoiceNode(nodes());
      if (!ownvoice) await wait(700);
    }
  }
  if (!ownvoice) fail('toolbar', 'the Ownvoice entry never appeared on the stock field (toolbar and overflow shots saved)');
  shot('step-ownvoice-entry');
  tap(...center(ownvoice));
  if (!(await waitForFocus('RewriteActivity', 15))) fail('sheet', 'the stock selection did not open Ownvoice');
  if (!(await textPresent('Replace', 5))) fail('sheet', 'Replace not offered on the editable stock selection');
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
  if (!(await waitForFocus(hostPkg, 10))) fail('replace', 'the stock app did not come back after Replace');
  await wait(1000);
  shot('step-replaced-field');

  // Read-back through the probe's uiautomator nodes (never a raw dump: that unbinds
  // the service). PROCESS_TEXT hands the rewrite back into the field itself. This proof
  // never sends, posts, saves, or leaves the stock app: it backs out after the read.
  const fieldValue = (nodes().find(n => n.className === 'android.widget.EditText' && n.editable)?.text ?? '').trim();
  const match = fieldValue === rewriteText.trim();
  const lower = fieldValue.toLowerCase();
  const keepsFacts = lower.includes('sam') && lower.includes('friday') && /(3\s?pm|15:00)/.test(lower) && /\b12\b/.test(lower);
  const result = { ok: match && keepsFacts, host: hostPkg, method: 'uiautomator-probe', rewrite: rewriteText, field: fieldValue, match, keepsFacts };
  writeFileSync(`${out}/replace-result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  shell('input', 'keyevent', '4');
  await wait(800);
  if (!match) fail('readback', `Replace did not put the rewrite in the stock field (field starts: "${fieldValue.slice(0, 120)}")`);
  if (!keepsFacts) fail('readback', 'the replaced field lost a fact (name, time or number)');
  console.log(`Replace proof saved to ${out}: probe read-back matches the Shorter rewrite, facts kept.`);
  process.exit(0);
} catch (error) {
  try { dumpNodes('nodes-FAILED'); } catch {}
  throw error;
}

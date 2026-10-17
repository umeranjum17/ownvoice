// OWNVOICE-RN-08 Replace-only proof, stock-field leg v2 (lead method, no Chrome, no fixture).
// Two stock plain-EditText hosts on the image: Contacts new-contact name, then Messages
// compose body after a recipient is set. Type the realistic message, select all, take the
// native toolbar overflow, the Ownvoice PROCESS_TEXT entry; Shorter then Replace; the field
// value read back with a raw uiautomator dump (plus a probe cross-check). Saves the
// dumpsys enabled-state and the query-activities roll-call. Never sends, saves or posts:
// the proof backs out after the read. Needs OPENCODE_KEY_FILE and OPENCODE_WORKSPACE.
// OWNVOICE_PHONE=1 runs it on a real phone already set up through the app's own UI with
// the phone writer: no reinstall, no root seeding, no Go connect, no device settings changed.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { accessibilityProbe, center, emulatorName } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL;
const avdName = process.env.OWNVOICE_AVD_NAME?.trim();
const phone = process.env.OWNVOICE_PHONE === '1';
if (!phone) {
  if (!/^emulator-\d+$/.test(serial ?? '') || !avdName) throw new Error('Set ANDROID_SERIAL to an emulator and OWNVOICE_AVD_NAME to its owned AVD name.');
  const actualAvd = emulatorName(serial);
  if (actualAvd !== avdName) throw new Error(`Refusing ${serial}: AVD ${actualAvd} does not match ${avdName}.`);
} else if (!serial) throw new Error('Set ANDROID_SERIAL to the phone.');
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = process.argv[3] ?? 'reports/rn08-replace-stock';
const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
let probe;
// The phone reads through its own installed dev.ownvoice.probe2 (same Probe.java source).
const phoneProbe = () => {
  const output = execFileSync('adb', ['-s', serial, 'shell', 'am', 'instrument', '-w', 'dev.ownvoice.probe2/dev.ownvoice.probe2.Probe2'], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
  const json = output.match(/^INSTRUMENTATION_RESULT: nodes=(.+)$/m)?.[1];
  if (!json || !output.includes('INSTRUMENTATION_CODE: 0')) throw new Error(`probe2 failed: ${output.slice(0, 300)}`);
  return JSON.parse(json).filter(node => node.visible && node.bounds[2] > node.bounds[0] && node.bounds[3] > node.bounds[1]);
};
const nodes = () => (probe ??= phone ? phoneProbe : accessibilityProbe(serial, out))();
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
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
/** Re-enable the service and wait until dumpsys shows it BOUND (the cold-boot race). */
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
  for (let i = 0; i < 90; i++) {
    const bound = /Bound services:\s*\{[^}]*Ownvoice/.test(shell('dumpsys', 'accessibility'));
    if (shell('settings', 'get', 'secure', 'enabled_accessibility_services').includes(component) && bound) return;
    await wait(1000);
  }
  throw new Error('service not bound after 90s (rebind race)');
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
/** Raw uiautomator dump to XML (the ordered read-back proof). Safe here: the Ownvoice
 *  accessibility service is not needed once the sheet has handed back. */
const rawDump = name => {
  shell('uiautomator', 'dump', `/sdcard/${name}.xml`);
  execFileSync('adb', ['-s', serial, 'pull', `/sdcard/${name}.xml`, `${out}/${name}.xml`], { stdio: 'ignore' });
  console.log(`raw ${name}`);
  return readFileSync(`${out}/${name}.xml`, 'utf8');
};
const editTexts = xml => [...xml.matchAll(/class="android.widget.EditText"[^>]*?text="([^"]*)"/g)].map(m => m[1]);
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

const liveKey = phone ? '' : readFileSync(process.env.OPENCODE_KEY_FILE ?? '', 'utf8').trim();
if (!phone && (liveKey.length < 20 || /\s/.test(liveKey))) throw new Error('The OpenCode Go key file did not look like a key.');
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

/** Type text into a field and prove it landed; short probe first, then the full message
 *  in two chunks (the Messages box once mangled a single long commit). */
const typeVerified = async (xp, yp, tag) => {
  const type = text => execFileSync('adb', ['-s', serial, 'shell', 'input', 'text', `'${text}'`]);
  const readField = () => (nodes().find(n => n.className === 'android.widget.EditText' && n.editable && !(n.text ?? '').includes('5550100'))?.text ?? '').trim();
  const clearField = async () => {
    tap(xp, yp); await wait(600);
    shell('input', 'keycombination', '113', '29'); await wait(600);
    shell('input', 'keyevent', '67'); await wait(800);
  };
  tap(xp, yp); await wait(600);
  type('Hello%Sam'); await wait(1000);
  if (readField() !== 'Hello Sam') { await clearField(); type('Hello%Sam'); await wait(1000); }
  if (readField() !== 'Hello Sam') fail('host', `the ${tag} body does not take typed text (diagnostic probe failed)`);
  await clearField();
  const half = Math.ceil(TEXT.length / 2);
  const chunks = [TEXT.slice(0, half), TEXT.slice(half)].map(s => s.replaceAll(' ', '%s'));
  type(chunks[0]); await wait(1000);
  type(chunks[1]); await wait(1200);
  shot(`step-body-typed-${tag}`);
  const landed = readField();
  if (!landed.includes('Sam') || /^(word )+/.test(landed)) fail('host', `the ${tag} body mangled the message on retype (starts: "${landed.slice(0, 60)}")`);
};

const ownvoiceNode = list => list.find(n => n.windowType !== 4 && n.clickable && /ownvoice/i.test(`${n.label} ${n.text}`));
// The floating toolbar's ⋮ is labelled "Close overflow" on Android 16 even while closed.
const overflowItem = () => nodes().find(n => n.clickable && /more options|overflow/i.test(`${n.label} ${n.text}`));

/** Summon the native toolbar on the given field center; widen cursor states via Select all. */
const summonToolbar = async (fx, fy, tag) => {
  const actionUp = () => {
    const looksAction = /^(copy|cut|share|select all)$/i;
    return nodes().some(n => n.clickable && looksAction.test(`${n.text || n.label || ''}`.trim()));
  };
  const copyUp = () => {
    const looksToolbar = /^(copy|cut|share)$/i;
    return nodes().some(n => n.clickable && looksToolbar.test(`${n.text || n.label || ''}`.trim()));
  };
  let toolbar = false;
  for (let i = 0; i < 3 && !toolbar; i++) {
    tap(fx, fy);
    await wait(600);
    shell('input', 'keycombination', '113', '29');
    await wait(600);
    // Chrome raises the full-selection toolbar on Ctrl+A; hiding the keyboard would close it.
    if (copyUp()) { toolbar = true; break; }
    if (shell('dumpsys', 'input_method').includes('mInputShown=true')) { shell('input', 'keyevent', '4'); await wait(800); }
    shell('input', 'swipe', String(Math.round(fx)), String(Math.round(fy)), String(Math.round(fx)), String(Math.round(fy)), '1100');
    await wait(1200);
    if (!actionUp()) continue;
    const selectAll = nodes().find(n => n.clickable && /select all/i.test(`${n.label} ${n.text}`));
    if (selectAll) {
      tap(...center(selectAll));
      await wait(1000);
      if (!actionUp()) {
        shell('input', 'swipe', String(Math.round(fx)), String(Math.round(fy)), String(Math.round(fx)), String(Math.round(fy)), '1100');
        await wait(1200);
      }
    }
    toolbar = copyUp();
  }
  shot(`step-toolbar-${tag}`);
  dumpNodes(`nodes-toolbar-${tag}`);
  if (!phone) rawDump(`uidump-toolbar-${tag}`); // a uiautomator dump would close Chrome's toolbar
  return toolbar;
};

/** Hunt the Ownvoice entry on an up toolbar; true when tapped. */
const huntOwnvoice = async tag => {
  if (ownvoiceNode(nodes())) { shot(`step-ownvoice-direct-${tag}`); return true; }
  const overflow = overflowItem();
  if (!overflow) return false;
  tap(...center(overflow));
  await wait(1200);
  shot(`step-overflow-${tag}`);
  for (let i = 0; i < 6 && !ownvoiceNode(nodes()); i++) await wait(700);
  return !!ownvoiceNode(nodes());
};

try {
  if (phone) {
    shell('input', 'keyevent', 'KEYCODE_WAKEUP');
    shell('input', 'keyevent', 'KEYCODE_HOME');
    if (/isKeyguardShowing=true/.test(shell('dumpsys', 'window'))) fail('setup', 'the phone is locked');
    const installedSha = shell('sha256sum', shell('pm', 'path', pkg).split('\n').find(l => l.trim().endsWith('/base.apk')).trim().slice(8)).trim().split(/\s+/)[0];
    if (installedSha !== expectedApkSha) fail('setup', 'the phone runs a different build than the one under test');
    await rebindService();
  } else {
    await freshSetup();
    await connectOpenCode();
  }

  // Handler roll-call + enabled-state, saved before any host opens.
  const handlers = shell('cmd', 'package', 'query-activities', '-a', 'android.intent.action.PROCESS_TEXT', '-t', 'text/plain');
  writeFileSync(`${out}/handlers.txt`, handlers);
  console.log(`handlers: ${handlers.split('\n').filter(l => l.trim()).length} lines`);
  const dumpsysPkg = shell('dumpsys', 'package', pkg);
  writeFileSync(`${out}/dumpsys-package.txt`, dumpsysPkg);
  const accessState = [
    `enabled_accessibility_services=${shell('settings', 'get', 'secure', 'enabled_accessibility_services').trim()}`,
    `accessibility_enabled=${shell('settings', 'get', 'secure', 'accessibility_enabled').trim()}`,
    ...shell('dumpsys', 'accessibility').split('\n').filter(l => /Bound services|OwnvoiceService/.test(l)).map(l => l.trim()),
  ].join('\n');
  writeFileSync(`${out}/access-state.txt`, accessState);
  if (!/ownvoice/i.test(handlers)) fail('handlers', 'Ownvoice is not listed for PROCESS_TEXT/text/plain: product defect, stopping');

  const packages = shell('pm', 'list', 'packages');
  writeFileSync(`${out}/packages.txt`, packages);
  const has = p => packages.split('\n').some(l => l.trim() === `package:${p}`);
  // The phone's Contacts saves to the owner's synced account: Messages only there.
  const contactsPkg = phone ? undefined : ['com.google.android.contacts', 'com.android.contacts'].find(has);
  // The phone has no SIM (Messages shows no body), so it uses a Chrome textarea instead.
  const smsPkg = phone ? undefined : ['com.google.android.apps.messaging', 'com.android.messaging'].find(has);

  // Field 1: Contacts new-contact name (INSERT prefill, else type into the Name field).
  // Field 2: Messages compose body (recipient chipped first, then the body is a plain field).
  let hostPkg = '', field = null, hostTag = '';
  if (contactsPkg) {
    hostPkg = contactsPkg; hostTag = 'contacts';
    shell('am', 'start', '-a', 'android.intent.action.INSERT', '-t', 'vnd.android.cursor.dir/contact', '--es', 'name', `'${TEXT}'`);
    await wait(2500);
    if (await waitForFocus(hostPkg)) {
      if (await textPresent('save.*contact|choose.*account|save to', 3)) {
        const device = nodes().find(n => n.clickable && /device|phone|local/i.test(`${n.label} ${n.text}`));
        if (device) { tap(...center(device)); await wait(1500); }
      }
      for (let i = 0; i < 15 && !field; i++) {
        field = nodes().find(n => n.className === 'android.widget.EditText' && n.editable && (n.text ?? '').includes('Sam'));
        if (!field) await wait(1000);
      }
      if (!field) {
        const empty = nodes().find(n => n.className === 'android.widget.EditText' && n.editable && !(n.text ?? '').trim() && (n.label ?? '').length + (n.text ?? '').length < 60);
        if (!empty || hostPkg !== contactsPkg) fail('host', 'the Contacts name field never showed the message and no empty field could take it');
        await typeVerified(...center(empty), 'contacts');
        field = nodes().find(n => n.className === 'android.widget.EditText' && n.editable && (n.text ?? '').includes('Sam'));
      }
      shot('step-field-loaded-contacts');
      if (field) console.log('contacts name field ready');
      else console.log('contacts field never showed the message; moving to Messages');
    } else console.log('contacts did not come to the front; moving to Messages');
  }
  if (phone && has('com.android.chrome')) {
    hostPkg = 'com.android.chrome'; hostTag = 'chrome';
    const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ownvoice textarea</title><style>body{font:18px sans-serif;padding:24px}textarea{display:block;width:100%;min-height:220px;padding:12px;font:18px sans-serif;border:2px solid #777}</style><textarea aria-label="Message">${TEXT}</textarea>`;
    const server = createServer((_q, r) => r.end(html)).listen(8765);
    process.on('exit', () => { server.close(); try { adb('reverse', '--remove', 'tcp:8765'); } catch {} });
    adb('reverse', 'tcp:8765', 'tcp:8765');
    shell('am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'http://localhost:8765/', '-p', hostPkg);
    if (!(await waitForFocus(hostPkg, 15))) fail('host', 'Chrome did not come to the front');
    for (let i = 0; i < 15 && !field; i++) {
      field = nodes().find(n => n.className === 'android.widget.EditText' && (n.text ?? '').includes('Sam'));
      if (!field) await wait(1000);
    }
    shot('step-field-loaded-chrome');
    if (!field) fail('host', 'the Chrome textarea never showed the message');
  }
  if (!field && smsPkg) {
    hostPkg = smsPkg; hostTag = 'messages';
    shell('am', 'start', '-a', 'android.intent.action.SENDTO', '-d', 'sms:');
    await wait(2500);
    if (!(await waitForFocus(hostPkg))) fail('host', 'Messages did not come to the front');
    const to = nodes().find(n => n.className === 'android.widget.EditText' && n.editable);
    if (!to) fail('host', 'Messages shows no recipient field');
    tap(...center(to));
    await wait(600);
    execFileSync('adb', ['-s', serial, 'shell', 'input', 'text', `'5550100'`]);
    await wait(800);
    shell('input', 'keyevent', '66');
    await wait(2000);
    const body = nodes().find(n => n.className === 'android.widget.EditText' && n.editable && !(n.text ?? '').includes('5550100'));
    if (!body) fail('host', 'Messages compose body never opened after chipping the recipient');
    shot('step-to-chipped');
    await typeVerified(...center(body), 'messages');
    field = nodes().find(n => n.className === 'android.widget.EditText' && n.editable && (n.text ?? '').includes('Sam'));
    shot('step-field-loaded-messages');
    if (!field) fail('host', 'typing into the Messages compose body did not take');
  }
  if (!field) fail('host', 'no stock field took the realistic message (Contacts and Messages both tried)');
  const [fx, fy] = center(field);

  if (!(await summonToolbar(fx, fy, hostTag))) fail('toolbar', `no Copy/Cut/Share toolbar on the ${hostTag} field after three summons`);
  let tapped = await huntOwnvoice(hostTag);
  if (!tapped) {
    console.log(`no Ownvoice entry or overflow on ${hostTag}; trying the other stock field`);
    dumpNodes(`nodes-no-entry-${hostTag}`);
    const other = hostTag === 'contacts' ? 'messages' : 'contacts';
    const otherPkg = hostTag === 'contacts' ? smsPkg : contactsPkg;
    if (otherPkg) {
      if (other === 'messages') {
        shell('am', 'start', '-a', 'android.intent.action.SENDTO', '-d', 'sms:');
        await wait(2500);
        const to = nodes().find(n => n.className === 'android.widget.EditText' && n.editable);
        if (to) {
          tap(...center(to)); await wait(600);
          execFileSync('adb', ['-s', serial, 'shell', 'input', 'text', `'5550100'`]); await wait(800);
          shell('input', 'keyevent', '66'); await wait(2000);
          const fallbackBody = nodes().find(n => n.className === 'android.widget.EditText' && n.editable && !(n.text ?? '').includes('5550100'));
          if (fallbackBody) await typeVerified(...center(fallbackBody), 'messages');
        }
      } else {
        shell('am', 'start', '-a', 'android.intent.action.INSERT', '-t', 'vnd.android.cursor.dir/contact', '--es', 'name', `'${TEXT}'`);
        await wait(2500);
      }
      if (await waitForFocus(otherPkg)) {
        await wait(1500);
        const otherField = nodes().find(n => n.className === 'android.widget.EditText' && n.editable && (n.text ?? '').includes('Sam'));
        if (otherField) {
          const [ox, oy] = center(otherField);
          if (await summonToolbar(ox, oy, other)) {
            tapped = await huntOwnvoice(other);
            hostPkg = otherPkg; hostTag = other;
          }
        }
      }
    }
  }
  if (!tapped) fail('toolbar', 'neither stock field showed the Ownvoice entry or a toolbar overflow (both dumps saved)');

  shot('step-ownvoice-entry');
  tap(...center(ownvoiceNode(nodes())));
  if (!(await waitForFocus('RewriteActivity', 15))) fail('sheet', 'the stock selection did not open Ownvoice');
  if (!(await textPresent('Replace', 5))) fail('sheet', 'Replace not offered on the editable stock selection');
  shot('step-replace-offered');

  const before = new Set(nodes().map(n => `${n.label} ${n.text}`.trim()).filter(Boolean));
  await tapText('Shorter');
  let answered = false;
  for (let i = 0; i < (phone ? 240 : 90) && !answered; i++) { // the phone writer loads its model first
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

  // Ordered read-back: raw uiautomator dump, probe cross-check. Backs out afterwards;
  // nothing is ever sent, saved or posted.
  const xml = rawDump('uidump-replaced');
  const texts = editTexts(xml);
  const probeText = (nodes().find(n => n.className === 'android.widget.EditText' && n.editable)?.text ?? '').trim();
  const fieldValue = texts.find(t => t === rewriteText.trim()) ?? texts.sort((a, b) => b.length - a.length)[0] ?? '';
  const match = fieldValue.trim() === rewriteText.trim();
  const lower = fieldValue.toLowerCase();
  const keepsFacts = lower.includes('sam') && lower.includes('friday') && /(3\s?pm|15:00)/.test(lower) && /\b12\b/.test(lower);
  const result = { ok: match && keepsFacts, host: hostPkg, method: 'uiautomator-dump', probeText, rewrite: rewriteText, field: fieldValue, match, keepsFacts };
  writeFileSync(`${out}/replace-result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (phone && hostTag === 'messages') {
    // Empty the body so Messages keeps no draft for the made-up number.
    const [bx, by] = center(nodes().find(n => n.className === 'android.widget.EditText' && n.editable && !(n.text ?? '').includes('5550100')) ?? field);
    tap(bx, by); await wait(600);
    shell('input', 'keycombination', '113', '29'); await wait(600);
    shell('input', 'keyevent', '67'); await wait(800);
  }
  for (let i = 0; i < 3; i++) {
    const discard = nodes().find(n => n.clickable && /^(discard|don't save)$/i.test((n.text || n.label || '').trim()));
    if (discard) { tap(...center(discard)); await wait(800); }
    if (!(await waitForFocus(hostPkg, 1))) break;
    shell('input', 'keyevent', '4');
    await wait(1000);
  }
  shot('step-backed-out');
  if (!match) fail('readback', `Replace did not put the rewrite in the stock field (dump field starts: "${fieldValue.slice(0, 120)}")`);
  if (!keepsFacts) fail('readback', 'the replaced field lost a fact (name, time or number)');
  console.log(`Replace proof saved to ${out}: uiautomator read-back matches the Shorter rewrite, facts kept.`);
  process.exit(0);
} catch (error) {
  try { dumpNodes('nodes-FAILED'); } catch {}
  throw error;
}

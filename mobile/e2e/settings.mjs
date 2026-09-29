import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// H1–H5 release-device proof; never connect to a phone or dump UiAutomation (it unbinds the service).
// `node e2e/settings.mjs <dir> writes-cant|writes-ready` instead walks How Ownvoice writes (see writes() below).
const serial = process.env.ANDROID_SERIAL;
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
// Throwaway emulators only: a local emulator-NNNN, or a borrowed one over adb connect that says it is one.
if (!serial || !serial.startsWith('emulator-') && !['ro.kernel.qemu', 'ro.boot.qemu'].some(prop => adb('shell', 'getprop', prop).trim() === '1')) throw new Error('Use a throwaway emulator.');
const out = resolve(process.argv[2] ?? 'reports/ov-rn-07');
mkdirSync(out, { recursive: true });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
// Through a file on the device: `exec-out screencap` comes back cut short over a forwarded adb.
const screenshot = () => {
  adb('shell', 'screencap', '-p', '/sdcard/ov-shot.png');
  const local = resolve(out, '.shot.png');
  execFileSync('adb', ['-s', serial, 'pull', '/sdcard/ov-shot.png', local], { stdio: 'ignore' });
  return readFileSync(local);
};
const rows = (image = screenshot()) => execFileSync('tesseract', ['stdin', 'stdout', 'tsv'], { input: image, encoding: 'utf8' }).split('\n').slice(1)
  .map(line => line.split('\t')).filter(cols => cols.length >= 12 && cols[11].trim());
const visible = image => rows(image).map(cols => cols[11]).join(' ').toLowerCase();
const expect = (label, text) => { if (!text.includes(label.toLowerCase())) throw new Error(`Missing ${label}: ${text}`); };
const open = async route => { adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `ownvoice://${route}`, 'dev.ownvoice.next'); await wait(1600); };
const save = name => writeFileSync(resolve(out, `OWNVOICE-RN-07-${name}.png`), screenshot());
const tap = (label, last = false) => {
  const matches = rows().filter(cols => cols[11].toLowerCase() === label.toLowerCase());
  if (!matches.length) throw new Error(`No visible ${label} to tap`);
  const c = last ? matches.at(-1) : matches[0];
  adb('shell', 'input', 'tap', String(Number(c[6]) + Number(c[8]) / 2), String(Number(c[7]) + Number(c[9]) / 2));
};
const pick = async () => {
  adb('push', resolve('e2e/voice-profile.md'), '/sdcard/Download/voice-profile.md');
  tap('Import');
  await wait(900);
  if (!visible().includes('voice-profile.md')) {
    adb('shell', 'input', 'tap', '70', '200'); // DocumentsUI: Show roots
    await wait(300);
    if (visible().includes('downloads')) tap('Downloads');
    else {
      tap('sdk_gphone64_x86_64');
      await wait(500);
      tap('Download');
    }
    await wait(700);
  }
  tap('voice-profile.md');
  await wait(1100);
};

const flow = process.argv[3];
if (flow) { await writes(flow); process.exit(0); }

for (const mode of ['light', 'dark']) {
  adb('shell', 'cmd', 'uimode', 'night', mode === 'light' ? 'no' : 'yes');
  adb('shell', 'am', 'force-stop', 'dev.ownvoice.next');
  await open('');
  expect('Where the bubble shows', visible());
  save(`${mode}-home`);
  await open('apps');
  expect('In apps that are off', visible());
  save(`${mode}-apps`);
  await open('voice');
  expect('Import from a file', visible());
  save(`${mode}-voice`);
  await pick();
  expect('Found in the file', visible());
  save(`${mode}-import-preview`);
  if (mode === 'light') { tap('Add', true); await wait(500); expect('Added', visible()); }
  await open('reads');
  expect('Suggested replies in Ownvoice', visible());
  save(`${mode}-reads`);
}
tap('Wipe');
await wait(500);
tap('Wipe');
await wait(800);
expect('Nothing read in the last 30 days', visible());
save('dark-wiped');
await open('voice');
if (visible().includes('delve')) throw new Error('Wipe left the imported voice phrase behind.');
console.log(`H1–H5 release proof saved to ${out}; import preview, persistent read fact and Wipe checked.`);

// ---- How Ownvoice writes (mocks 05-09), light and dark, on an installed release build with
// EXPO_PUBLIC_E2E_GPT=1 (the offline sign-in stand-in connects about 9 s after the code shows).
//   writes-cant:  an emulator as it is, whose phone can't write. Setup's Not now lands on Home's
//                 "Choose how Ownvoice writes" (08), never a dead end; Continue with ChatGPT signs in
//                 on How Ownvoice writes and Home is ready (09).
//   writes-ready: also EXPO_PUBLIC_E2E_DOWNLOAD=1, so this phone can write after a pretend download.
//                 This phone getting ready (06), ChatGPT signed in and chosen (05), and the question
//                 before switching back to ChatGPT (07).
async function writes(kind) {
  const pkg = 'dev.ownvoice.next';
  const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
  const [width, height] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
  const BANNED = /\bmodel|\btokens?\b|\bprompt|gemini|gemma|\bnano\b|aicore|ml ?kit|\bllm\b|\bjudge\b|\bslop\b|characters|on-device|gpt-\d|\bcodex\b|\bresponses\b|\/100|doesn't work on this phone|doesn.t work on this phone/;
  // One OCR line per Tesseract line, with its box; banded crops read the white-on-pill labels too.
  const lines = (image, banded) => {
    const found = [];
    for (const top of banded ? Array.from({ length: Math.ceil(height / 75) }, (_, i) => i * 75) : [0]) {
      const input = top ? execFileSync('magick', ['png:', '-crop', `${width}x150+0+${top}`, '+repage', 'png:-'], { input: image }) : image;
      const byLine = new Map();
      for (const row of execFileSync('tesseract', ['stdin', 'stdout', ...(top ? ['--psm', '6'] : []), 'tsv'], { input, encoding: 'utf8' }).split('\n').slice(1)) {
        const c = row.split('\t');
        if (c.length < 12 || !c[11].trim()) continue;
        const key = c.slice(0, 5).join(':');
        const line = byLine.get(key) ?? { text: '', left: Infinity, top: Infinity, right: 0, bottom: 0 };
        line.text += ` ${c[11].toLowerCase()}`;
        line.left = Math.min(line.left, +c[6]); line.right = Math.max(line.right, +c[6] + +c[8]);
        line.top = Math.min(line.top, +c[7] + top); line.bottom = Math.max(line.bottom, +c[7] + +c[9] + top);
        byLine.set(key, line);
      }
      found.push(...byLine.values());
    }
    return found;
  };
  const seen = async (label, tries = 20) => {
    for (let i = 0; i < tries; i++) {
      if (rows().map(c => c[11]).join(' ').toLowerCase().includes(label)) return;
      await wait(1000);
    }
    throw new Error(`Could not see "${label}" on screen.`);
  };
  const press = async label => {
    for (let i = 0; i < 8; i++) {
      // A line that is just the label wins over one that only contains it ("Apps that stay on this phone").
      const image = screenshot();
      const pick = found => found.find(line => line.text.trim() === label) ?? found.find(line => line.text.includes(label));
      const hit = pick(lines(image, false)) ?? pick(lines(image, true));
      if (hit) { adb('shell', 'input', 'tap', String(Math.round((hit.left + hit.right) / 2)), String(Math.round((hit.top + hit.bottom) / 2))); return; }
      await wait(1000);
    }
    throw new Error(`No visible "${label}" to tap.`);
  };
  // The picture first, then its words checked: the getting-ready bar lasts only seconds.
  const snap = (mode, name) => {
    if (!adb('shell', 'dumpsys', 'uimode').includes(`mComputedNightMode=${mode === 'dark'}`)) throw new Error(`Wrong colour mode for ${name}.`);
    const image = screenshot();
    writeFileSync(resolve(out, `${name}-${mode}.png`), image);
    const text = visible(image);
    if (BANNED.test(text)) throw new Error(`${name}: technical or dead-end words on screen: ${text}`);
  };
  const service = on => {
    const now = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
    const list = new Set(now === 'null' ? [] : now.split(':'));
    if (on) list.add(component); else list.delete(component);
    adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', list.size ? [...list].join(':') : 'com.example.disabled/NoService');
    if (on) adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
  };
  const fresh = async mode => {
    adb('shell', 'cmd', 'uimode', 'night', mode === 'dark' ? 'yes' : 'no');
    adb('shell', 'pm', 'clear', pkg);
    service(false);
    await wait(1500);
  };
  const priorMode = adb('shell', 'cmd', 'uimode', 'night').trim().match(/^Night mode: (\w+)$/)?.[1] ?? 'no';
  const priorSchedule = adb('shell', 'settings', 'get', 'secure', 'ui_night_mode_custom_type').trim();
  const priorServices = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
  try {
    adb('shell', 'settings', 'put', 'secure', 'ui_night_mode_custom_type', '-1');
    for (const mode of ['light', 'dark']) {
      await fresh(mode);
      if (kind === 'writes-cant') {
        adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
        await press('continue');
        await seen('only some newer phones');
        await press('not now');
        await seen('choose how ownvoice writes');
        // Ownvoice switched on, as after the permission step: the card still asks for a writer.
        service(true);
        await wait(2500);
        await seen('sign in with your chatgpt');
        await seen('not chosen yet');
        snap(mode, '08-home-needs-a-writer');
        await press('continue with chatgpt');
        await seen('your code');
        snap(mode, '10-source-signin-code');
        await seen('chatgpt is connected', 30);
        await wait(800);
        snap(mode, '11-source-chatgpt-phone-cant');
        adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
        await seen('ready to help');
        await seen('writes with your chatgpt');
        snap(mode, '09-home-ready-chatgpt');
        service(false);
      } else if (kind === 'writes-ready') {
        adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source', pkg);
        await seen('private and free');
        await press('on this phone');
        await seen('get this phone ready');
        await press('get it ready');
        await wait(1200);
        snap(mode, '06-settings-phone-getting-ready');
        await seen('it writes right here', 30);
        await press('with your chatgpt');
        await seen('your code');
        await seen('chatgpt is connected', 30);
        await wait(800);
        snap(mode, '05-settings-chatgpt');
        await press('on this phone');
        await seen('it writes right here');
        await press('with your chatgpt');
        await seen('write with chatgpt?');
        await wait(800);
        snap(mode, '07-settings-switch-confirm');
        await press('keep it on this phone');
        await wait(800);
        if (visible().includes('write with chatgpt?')) throw new Error('The question stayed open.');
      } else throw new Error(`Unknown flow ${kind}.`);
    }
    console.log(`How Ownvoice writes (${kind}) saved to ${out} in light and dark; every screen's words checked.`);
  } catch (error) {
    // What was on screen when it stopped, for whoever reads the failure.
    try { writeFileSync(resolve(out, 'failed.png'), screenshot()); } catch {}
    throw error;
  } finally {
    adb('shell', 'settings', priorSchedule === 'null' ? 'delete' : 'put', 'secure', 'ui_night_mode_custom_type', ...(priorSchedule === 'null' ? [] : [priorSchedule]));
    adb('shell', 'cmd', 'uimode', 'night', priorMode);
    adb('shell', 'settings', priorServices === 'null' ? 'delete' : 'put', 'secure', 'enabled_accessibility_services', ...(priorServices === 'null' ? [] : [priorServices]));
    rmSync(resolve(out, '.shot.png'), { force: true });
  }
}

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The Home footer's version label, read off the screen as a person reads it: one marker, `-dev` on a
// build that is not a tagged release, and no second pre-release marker beside it. The expected text
// comes from the installed build's own versionName, never from a typed-in version.
// Owned emulator only; no account, key, download or network request. Screenshot OCR only, no
// UiAutomator (which would unbind the accessibility service).
const serial = process.env.ANDROID_SERIAL;
if (!/^emulator-\d+$/.test(serial ?? '')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const avd = (process.env.OWNVOICE_AVD_NAME ?? '').trim();
if (!avd) throw new Error('Set OWNVOICE_AVD_NAME to your own AVD name.');
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = resolve(process.argv[3] ?? 'e2e/artifacts');
mkdirSync(out, { recursive: true });
const pkg = 'dev.ownvoice.next';
const service = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', timeout: 25000 });
if (adb('shell', 'getprop', 'ro.boot.qemu.avd_name').trim() !== avd) throw new Error(`Serial ${serial} is not the owned AVD ${avd}.`);
const wait = ms => new Promise(r => setTimeout(r, ms));
const shot = () => execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
const switchService = on => {
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', on ? service : 'com.example.disabled/NoService');
  if (on) adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
};
// OCR lines with their boxes, whole screen first then 150 px bands for anything full-screen OCR misses.
const lines = (image, [width, height]) => {
  const found = [];
  const read = (input, top, psm) => {
    const tsv = execFileSync('tesseract', ['stdin', 'stdout', ...(psm ? ['--psm', psm] : []), 'tsv'], { input, encoding: 'utf8' });
    const byLine = new Map();
    for (const row of tsv.split('\n').slice(1)) {
      const c = row.split('\t');
      if (c.length < 12 || !c[11].trim()) continue;
      const key = c.slice(0, 5).join(':');
      const line = byLine.get(key) ?? { words: [], left: Infinity, top: Infinity, right: 0, bottom: 0 };
      line.words.push(c[11]);
      line.left = Math.min(line.left, +c[6]); line.top = Math.min(line.top, +c[7] + top);
      line.right = Math.max(line.right, +c[6] + +c[8]); line.bottom = Math.max(line.bottom, +c[7] + +c[9] + top);
      byLine.set(key, line);
    }
    for (const line of byLine.values()) found.push({ ...line, text: line.words.join(' ') });
  };
  read(image, 0);
  for (let top = height - 150; top >= 0; top -= 75) read(execFileSync('magick', ['png:', '-crop', `${width}x150+0+${top}`, '+repage', 'png:-'], { input: image }), top, '7');
  return found;
};
// "Ownvoice 1.0.10-dev" as one comparison; OCR's separators between the words don't matter.
const flat = text => text.toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();
const isFooter = line => /^ownvoice \d+\.\d+\.\d+ dev$/.test(flat(line.text));

const [versionName] = adb('shell', 'dumpsys', 'package', pkg).match(/versionName=(\S+)/)?.slice(1) ?? [];
const want = flat(`Ownvoice ${versionName}-dev`);
const priorMode = adb('shell', 'cmd', 'uimode', 'night').trim().replace('Night mode: ', '');
const priorFont = adb('shell', 'settings', 'get', 'system', 'font_scale').trim();
const steps = [];
const sizes = [[360, 720, 1280, 320], [390, 780, 1280, 320], [445, 890, 1280, 320]];
const saveSteps = () => writeFileSync(resolve(out, 'steps.json'), JSON.stringify({
  target: { version: versionName, surface: 'Android release APK, Home footer' },
  start: 'Cleared app for each width and theme; the accessibility service switched on so the app opens Home instead of setup.',
  steps,
  result: steps.at(-1)?.result,
}, null, 2));
try {
  execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
  adb('shell', 'svc', 'wifi', 'disable'); // No network is needed; the shared netsimd packet stream stays idle.
  adb('shell', 'settings', 'put', 'secure', 'ui_night_mode_custom_type', '-1'); // The twilight schedule must not flip the theme back.
  for (const [dp, width, height, density] of sizes) for (const mode of ['light', 'dark']) {
    const geometry = [width, height];
    const tag = `${dp}dp-${mode}`;
    console.log(`CELL ${tag}`);
    switchService(false);
    adb('shell', 'am', 'force-stop', pkg);
    adb('shell', 'wm', 'size', `${width}x${height}`);
    adb('shell', 'wm', 'density', String(density));
    adb('shell', 'cmd', 'uimode', 'night', mode === 'dark' ? 'yes' : 'no');
    adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0');
    adb('shell', 'pm', 'clear', pkg);
    await wait(1200);
    switchService(true); // The service on is what makes MainActivity open Home rather than setup.
    adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
    let image; let footer;
    for (let swipe = 0; swipe <= 12 && !footer; swipe++) {
      await wait(swipe ? 900 : 4000); // A populated screen can precede the first painted frame.
      image = shot();
      const found = lines(image, geometry);
      footer = found.find(isFooter);
      if (!footer) adb('shell', 'input', 'swipe', String(Math.round(width / 2)), String(Math.round(height * .8)), String(Math.round(width / 2)), String(Math.round(height * .25)), '300');
      if (!footer && swipe === 12) throw new Error(`${tag}: no version line in the Home footer. Read: ${found.map(l => l.text).join(' | ')}`);
    }
    writeFileSync(resolve(out, `${tag}-home-footer.png`), image);
    const read = lines(image, geometry);
    const versions = read.filter(l => /ownvoice\s*\d+\.\d+\.\d+/i.test(l.text));
    if (versions.length !== 1) throw new Error(`${tag}: expected one version line, read ${versions.length}: ${versions.map(l => l.text).join(' | ')}`);
    if (flat(footer.text) !== want) throw new Error(`${tag}: footer reads "${footer.text}", the installed build expects "${want}".`);
    if (/pre[ -.]?release/i.test(read.map(l => l.text).join(' '))) throw new Error(`${tag}: a second pre-release marker is on screen beside the version.`);
    // The footer's own box must sit fully on screen, so a clipped line cannot pass as a read one.
    if (footer.top < 0 || footer.bottom > height || footer.left < 0 || footer.right > width) throw new Error(`${tag}: footer box ${JSON.stringify(footer)} is off screen.`);
    console.log(`${tag}: "${footer.text}"`);
    steps.push({ screenshot: `${tag}-home-footer.png`, geometry: { dp, width, height, density, mode }, result: `Home footer reads "${footer.text}": one marker, no second pre-release marker.`, at: new Date().toISOString() });
    saveSteps();
  }
  console.log(`PASS: ${steps.length} footer captures at 360, 390 and 445 dp in light and dark, one -dev marker each.`);
} finally {
  switchService(false);
  adb('shell', 'am', 'force-stop', pkg);
  adb('shell', 'wm', 'size', 'reset');
  adb('shell', 'wm', 'density', 'reset');
  adb('shell', 'settings', 'put', 'system', 'font_scale', priorFont === 'null' ? '1.0' : priorFont);
  adb('shell', 'cmd', 'uimode', 'night', priorMode || 'no');
  adb('shell', 'settings', 'put', 'secure', 'ui_night_mode_custom_type', '-1');
}

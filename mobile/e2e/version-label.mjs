import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { accessibilityProbe, center, emulatorName } from './accessibility.mjs';

// The Home footer's version label, read off the screen as a person reads it: one marker, the `-dev`
// one on a build that is not a tagged release, and no second pre-release marker beside it. The
// expected text comes from the installed build's own versionName, never from a typed-in version.
// Owned emulator only; no account, key, download or network request. Home is reached through setup's
// welcome (a writer choice is never made), and the footer itself is checked from its OCR'd pixels.
const serial = process.env.ANDROID_SERIAL;
if (!/^emulator-\d+$/.test(serial ?? '')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const avd = (process.env.OWNVOICE_AVD_NAME ?? '').trim();
if (!avd) throw new Error('Set OWNVOICE_AVD_NAME to your own AVD name.');
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = resolve(process.argv[3] ?? 'e2e/artifacts');
mkdirSync(out, { recursive: true });
const pkg = 'dev.ownvoice.next';
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', timeout: 25000 });
if (emulatorName(serial) !== avd) throw new Error(`Serial ${serial} is not the owned AVD ${avd}.`);
const wait = ms => new Promise(r => setTimeout(r, ms));
const shot = () => execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
const scratch = mkdtempSync(join(tmpdir(), 'ov-version-label-'));
const probe = accessibilityProbe(serial, scratch, { expectedPackage: pkg });
const textOf = node => `${node.label ?? ''} ${node.text ?? ''}`.trim().toLowerCase();
const waitNode = async (match, tries = 40) => {
  for (let i = 0; i < tries; i++) {
    const node = probe().find(match);
    if (node) return node;
    await wait(1000);
  }
  throw new Error(`Could not reach ${match} on screen: ${probe().map(n => n.label || n.text).filter(Boolean).join(' | ').slice(0, 400)}`);
};
const tapNode = node => adb('shell', 'input', 'tap', ...center(node).map(x => String(Math.round(x))));
const swipeUp = ([width, height]) => adb('shell', 'input', 'swipe', String(Math.round(width / 2)), String(Math.round(height * .8)), String(Math.round(width / 2)), String(Math.round(height * .25)), '300');
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
// "Ownvoice 1.0.11-dev" as one comparison; OCR's separators between the words don't matter.
const flat = text => text.toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();

// Read from the installed build below, after this run installs it: a fresh emulator has no package yet.
let versionName = '';
let want = '';
const priorMode = adb('shell', 'cmd', 'uimode', 'night').trim().replace('Night mode: ', '');
const priorFont = adb('shell', 'settings', 'get', 'system', 'font_scale').trim();
const sizes = [[360, 720, 1280, 320], [390, 780, 1280, 320], [445, 890, 1280, 320]];
// done-done's step record: steps are the user steps, one string each; the per-shot detail rides in captures.
const steps = ['clear the app, leave setup at the writer choice so it lands on Home'];
const captures = [];
let result = '';
const saveSteps = () => writeFileSync(resolve(out, 'steps.json'), JSON.stringify({
  target: { version: versionName, surface: 'Android release APK, Home footer' },
  start: 'Cleared app for each width and theme; setup left at the writer choice, so the app lands on Home with no writer.',
  steps,
  result,
  captures,
}, null, 2));

try {
  execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
  [versionName] = adb('shell', 'dumpsys', 'package', pkg).match(/versionName=(\S+)/)?.slice(1) ?? [];
  if (!versionName) throw new Error(`The installed build reports no versionName: ${adb('shell', 'dumpsys', 'package', pkg).slice(0, 300)}`);
  want = flat(`Ownvoice ${versionName}-dev`);
  adb('shell', 'svc', 'wifi', 'disable'); // No network is needed; the shared netsimd packet stream stays idle.
  adb('shell', 'settings', 'put', 'secure', 'ui_night_mode_custom_type', '-1'); // The twilight schedule must not flip the theme back.
  for (const [dp, width, height, density] of sizes) for (const mode of ['light', 'dark']) {
    const geometry = [width, height];
    const tag = `${dp}dp-${mode}`;
    console.log(`CELL ${tag}`);
    adb('shell', 'am', 'force-stop', pkg);
    adb('shell', 'wm', 'size', `${width}x${height}`);
    adb('shell', 'wm', 'density', String(density));
    adb('shell', 'cmd', 'uimode', 'night', mode === 'dark' ? 'yes' : 'no');
    adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0');
    adb('shell', 'pm', 'clear', pkg);
    await wait(1500);
    adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
    await waitNode(n => textOf(n).includes('sound like you'));
    // A short screen keeps setup's Continue below the fold: scroll it into view before tapping.
    for (let i = 0; i < 6; i++) {
      const go = probe().find(n => (n.label || n.text || '').trim().toLowerCase() === 'continue' && n.enabled !== false);
      if (go) { tapNode(go); break; }
      swipeUp(geometry);
      await wait(900);
    }
    await waitNode(n => textOf(n).includes('how should ownvoice write'));
    adb('shell', 'input', 'keyevent', '4'); // Leave setup without a writer: Home is where the footer lives.
    await waitNode(n => textOf(n).includes('choose how ownvoice writes'));
    let footer;
    for (let swipe = 0; swipe <= 12 && !footer; swipe++) {
      footer = probe().find(n => textOf(n).startsWith('ownvoice ') && /\d+\.\d+\.\d+/.test(textOf(n)));
      if (!footer) { swipeUp(geometry); await wait(900); }
    }
    // The capture waits for a painted frame; a populated tree can precede it.
    await wait(1200);
    const image = shot();
    writeFileSync(resolve(out, `${tag}-home-footer.png`), image);
    const read = lines(image, geometry);
    // The same line is read twice (whole screen, then bands), so count distinct readings of it.
    const versions = new Map();
    for (const found of read.filter(l => /ownvoice\s*\d+\.\d+\.\d+/i.test(l.text))) if (!versions.has(flat(found.text))) versions.set(flat(found.text), found);
    if (versions.size !== 1) throw new Error(`${tag}: expected one version line on screen, read ${versions.size}: ${[...versions.keys()].join(' | ')}`);
    const [line] = versions.values();
    if (flat(line.text) !== want) throw new Error(`${tag}: footer reads "${line.text}", the installed build expects "${want}".`);
    if (/pre[ -.]?release/i.test(read.map(l => l.text).join(' '))) throw new Error(`${tag}: a second pre-release marker is on screen beside the version.`);
    // The footer's own pixels must sit fully on screen, so a clipped line cannot pass as a read one.
    if (line.top < 0 || line.bottom > height || line.left < 0 || line.right > width) throw new Error(`${tag}: footer box ${JSON.stringify(line)} is off screen.`);
    if (!footer) throw new Error(`${tag}: the footer is on screen but the app reports no version label there.`);
    console.log(`${tag}: "${line.text}"`);
    steps.push(`set ${dp} dp ${mode} and capture the Home footer`);
    captures.push({ screenshot: `${tag}-home-footer.png`, geometry: { dp, width, height, density, mode }, result: `Home footer reads "${line.text}": one marker, no second pre-release marker.`, at: new Date().toISOString() });
    result = `Home footer reads "${line.text}" at 360, 390 and 445 dp in light and dark: one marker, no second pre-release marker.`;
    saveSteps();
  }
  console.log(`PASS: ${captures.length} footer captures at 360, 390 and 445 dp in light and dark, one -dev marker each.`);
} finally {
  adb('shell', 'am', 'force-stop', pkg);
  adb('shell', 'wm', 'size', 'reset');
  adb('shell', 'wm', 'density', 'reset');
  adb('shell', 'settings', 'put', 'system', 'font_scale', priorFont === 'null' ? '1.0' : priorFont);
  adb('shell', 'cmd', 'uimode', 'night', priorMode || 'no');
  rmSync(scratch, { recursive: true, force: true });
}

// ov-own-posts emulator proof: a blank X-style composer gets honest openings, one is
// edited, and the edited text lands in the composer (read back from the fixture itself).
// Own lane AVD only; refuses to run on any other emulator or on a phone.
//
//   ANDROID_SERIAL=emulator-XXXX OWNVOICE_AVD_NAME=fm-ownposts1 \
//     node e2e/own-post.mjs <release-apk> [outdir]
//
// Needs the APK built with EXPO_PUBLIC_E2E_STUB=1 EXPO_PUBLIC_E2E_GPT=1 (fixed drafts and
// the offline sign-in stand-in), and e2e/first-run.mjs run once first so setup is finished.
// Set OWNVOICE_BEFORE=1 against the base build: it captures the same screens without the
// own-post assertions, so before and after sit side by side in one evidence folder.
// Never UiAutomator: it would unbind the running Ownvoice service (e2e/accessibility.mjs).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { accessibilityProbe, center } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL?.trim();
if (!/^emulator-\d+$/.test(serial ?? '')) throw new Error('Set ANDROID_SERIAL to an owned emulator (owner phones are refused).');
const avd = process.env.OWNVOICE_AVD_NAME;
const actual = execFileSync('adb', ['-s', serial, 'emu', 'avd', 'name'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
if (!avd || actual !== avd) throw new Error(`Refusing ${serial}: AVD ${actual} is not ${avd}.`);
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const before = process.env.OWNVOICE_BEFORE === '1';
const label = before ? 'before' : 'after';
const theme = process.env.OWNVOICE_THEME ?? 'light';
const out = resolve(process.argv[3] ?? 'e2e/artifacts/own-post');
mkdirSync(out, { recursive: true });
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evidence = (...args) => execFileSync('bash', [resolve(repoRoot, '.agents/skills/verify-ownvoice/evidence.sh'), ...args],
  { env: { ...process.env, ANDROID_SERIAL: serial }, encoding: 'utf8' });
const shot = screen => evidence('shot', 'ov-own-posts', screen, label, theme);

const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const fixturePkg = 'com.twitter.android';
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const nodes = accessibilityProbe(serial, out);
const tap = (...point) => adb('shell', 'input', 'tap', String(Math.round(point[0])), String(Math.round(point[1])));
const key = (code, times = 1) => { for (let i = 0; i < times; i++) adb('shell', 'input', 'keyevent', String(code)); };
const type = text => adb('shell', 'input', 'text', text.replaceAll(' ', '%s'));
const screenText = () => execFileSync('tesseract', ['stdin', 'stdout'],
  { input: execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 }), encoding: 'utf8' }).toLowerCase();
const waitFor = async (what, read, tries = 30) => {
  for (let attempt = 0; attempt < tries; attempt++) {
    if (read()) return;
    await wait(1000);
  }
  throw new Error(`Never saw ${what}.`);
};
const visible = async (what, read, tries) => waitFor(`"${what}"`, read, tries);
const composer = () => nodes().find(node => node.className === 'android.widget.EditText' && node.editable);
const panel = () => nodes().find(node => /^Ownvoice/.test(node.label ?? '') && node.windowType !== 4);
const bubble = () => {
  const node = nodes().find(item => item.windowType === 4 && /^Ownvoice(?:,|$)/.test(item.label));
  if (!node) throw new Error('Could not locate the accessible Ownvoice bubble.');
  tap(...center(node));
};

/** The blank composer fixture, built host-side the way e2e/accessibility.mjs builds the probe. */
function buildFixture(scratch) {
  const javaHome = process.env.JAVA_HOME;
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), 'Android/Sdk');
  const env = { ...process.env, PATH: `${javaHome}/bin:${process.env.PATH}` };
  const run = (cmd, args) => execFileSync(cmd, args, { env, stdio: 'pipe' });
  const build = resolve(scratch, '.composer-fixture');
  const classes = join(build, 'classes');
  mkdirSync(classes, { recursive: true });
  const newest = (dir, re) => readdirSync(dir).filter(x => re.test(x)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
  const tools = join(sdk, 'build-tools', newest(join(sdk, 'build-tools'), /./));
  const platform = join(sdk, 'platforms', newest(join(sdk, 'platforms'), /^android-\d+$/), 'android.jar');
  const source = join(build, 'Composer.java');
  writeFileSync(source, readFileSync(fileURLToPath(new URL('./fixture/Composer.java', import.meta.url))));
  const manifest = join(build, 'AndroidManifest.xml');
  writeFileSync(manifest, readFileSync(fileURLToPath(new URL('./fixture/AndroidManifest.xml', import.meta.url))));
  run(join(javaHome, 'bin/javac'), ['-cp', platform, '-d', classes, source]);
  const jar = join(build, 'composer.jar');
  run(join(javaHome, 'bin/jar'), ['cf', jar, '-C', classes, '.']);
  run(join(tools, 'd8'), ['--lib', platform, '--output', build, jar]);
  const built = join(build, 'fixture.apk');
  run(join(tools, 'aapt'), ['package', '-f', '-M', manifest, '-I', platform, '-F', built]);
  run('zip', ['-j', built, join(build, 'classes.dex')]);
  run(join(tools, 'apksigner'), ['sign', '--ks', fileURLToPath(new URL('../android/app/debug.keystore', import.meta.url)), '--ks-key-alias', 'androiddebugkey', '--ks-pass', 'pass:android', built]);
  return built;
}

// 1. The fixture, the app, and the service. A first install never keeps the service bound,
//    so the documented off/on toggle follows; e2e/first-run.mjs restored its own settings.
evidence('theme', theme);
const fixtureApk = buildFixture(out);
adb('shell', 'pm', 'uninstall', fixturePkg);
execFileSync('adb', ['-s', serial, 'install', '-r', fixtureApk], { stdio: 'inherit' });
execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
adb('shell', 'logcat', '-c');
const toggleService = async on => {
  const list = on ? [component] : ['com.example.disabled/NoService', component];
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', list.join(':'));
  adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
  await wait(1500);
};
await toggleService(false);
await toggleService(true);
await wait(2500);

// 2. The blank X-style composer: focused, empty, nothing on it about the post.
adb('shell', 'monkey', '-p', fixturePkg, '-c', 'android.intent.category.LAUNCHER', '1');
await visible('the blank composer', () => !!composer(), 20);
if (composer().text) throw new Error('The fixture composer did not start empty.');
shot('blank-composer');

// 3. The bubble: the plain line that says there is nothing to work from, and the drafts.
bubble();
await wait(2000);
if (!before) await visible('the drafts panel', () => !!panel(), 20);
else await visible('the panel', () => !!screenText().includes('write') , 20);
shot('panel');
const texts = nodes().map(node => node.text).filter(Boolean);

if (before) {
  console.log(`Base build: a blank X-style composer shows "${texts.filter(t => /write|nothing|polish/i.test(t)).join(' | ') || 'an empty state'}" — no openings. Shots in ${out}.`);
  process.exit(0);
}

const OPENINGS = ['What is this post about?', 'What is the one thing worth saying here?', 'What should a reader take from it?'];
for (const opening of OPENINGS) if (!texts.includes(opening)) throw new Error(`The panel is missing an opening: ${opening}\n${texts.join(' | ')}`);
if (!texts.some(text => text.includes('Nothing on screen to work from'))) throw new Error('The panel did not say plainly that it had nothing to work from.');
if (texts.join(' ').match(/here are 3|viral|hook/i)) throw new Error('The panel sold hooks instead of asking for a topic.');

// 4. Edit the first opening and insert exactly that text. The sheet swallows taps, so the
//    controls are driven with DPAD + ENTER (the panel sequence in the verify-ownvoice skill).
evidence('motion-start', 'ov-own-posts', 'edit-and-insert');
key(4); // Back closes the keyboard so focus can leave the field.
await wait(600);
for (let attempt = 0; attempt < 14 && !nodes().some(node => node.text === 'Edit'); attempt++) { key(20); await wait(400); }
const edit = nodes().find(node => node.text === 'Edit');
if (!edit) throw new Error('Could not reach the first card\'s Edit.');
key(66);
await visible('the edit field', () => nodes().some(node => node.editable && node.windowType !== 4), 15);
shot('editing');
key(123); // MOVE_END, so the edit replaces the opening instead of appending to it.
await wait(300);
key(67, 45); // DEL back past the start.
await wait(300);
const EDITED = 'What did I learn shipping offline notes?';
type(EDITED);
await wait(1000);
shot('edited');
const edited = nodes().find(node => node.editable && node.windowType !== 4);
if (edited?.text !== EDITED) throw new Error(`The edit did not take (saw "${edited?.text ?? ''}").`);
for (let attempt = 0; attempt < 14 && !nodes().some(node => node.text === 'Use this'); attempt++) { key(20); await wait(400); }
key(66); // ENTER inserts the edited text.
await wait(3000);
evidence('motion-stop');
shot('inserted');

// 5. The read-back: the composer holds exactly the edited text, and nothing was posted.
if (panel()) { key(4); await wait(1500); }
const field = composer();
if (field?.text !== EDITED) throw new Error(`The composer does not hold the edited text (saw "${field?.text ?? 'nothing'}").`);
if (!/insert result ok=true/.test(adb('logcat', '-d', '-s', 'OwnvoiceNative:I'))) throw new Error('The native module did not confirm the insertion.');
shot('read-back');
console.log(`Own-post proof on ${serial} (${avd}): blank composer -> three honest openings -> edited -> inserted and read back ("${field.text}"). Shots in ${out}.`);
// ov-own-posts emulator proof: a blank X-style composer asks for the one line the post is
// about, drafts from that line, one draft is edited, and the edited text lands in the
// composer (read back from the fixture itself).
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
const out = resolve(process.argv[3] ?? 'mobile/.own-post');
mkdirSync(out, { recursive: true });
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// evidence.sh writes verify-artifacts/<task>/ relative to the repo root, so it runs from there.
const evidence = (...args) => execFileSync('bash', [resolve(repoRoot, '.agents/skills/verify-ownvoice/evidence.sh'), ...args],
  { env: { ...process.env, ANDROID_SERIAL: serial }, encoding: 'utf8', cwd: repoRoot });
const shot = screen => evidence('shot', 'ov-own-posts', screen, label, theme);

const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const fixturePkg = 'com.twitter.android';
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const nodes = accessibilityProbe(serial, out);
// The first instrument run after the probe installs comes back empty; warm it up once.
if (!nodes().length) await wait(1500);
const withNodes = async (what, read, tries = 20) => {
  for (let attempt = 0; attempt < tries; attempt++) {
    if (read(nodes())) return;
    await wait(1000);
  }
  throw new Error(`Never saw ${what}.`);
};

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
// Android reports the hint as the field's text while it is empty, so the hint is "blank".
const HINT = "What's happening?";
const composer = () => nodes().find(node => node.className === 'android.widget.EditText' && node.editable);
const composerText = () => { const text = composer()?.text; return !text || text === HINT ? '' : text; };
const panelTitle = list => list.find(node => (node.text ?? '').startsWith(before ? 'Nothing to reply' : 'Start your post'));
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
// A leftover fixture from an earlier run is fine; the install below replaces it.
try { adb('shell', 'pm', 'uninstall', fixturePkg); } catch { /* nothing installed yet */ }
execFileSync('adb', ['-s', serial, 'install', '-r', fixtureApk], { stdio: 'inherit' });
// Install the app only when it is missing: reinstalling kills the process, and the offline
// sign-in stand-in (e2e/first-run.mjs) keeps its connected state in memory, not on disk.
if (!adb('shell', 'pm', 'path', pkg).includes('package:')) execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
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
await withNodes('the blank composer', list => !!list.find(node => node.className === 'android.widget.EditText' && node.editable), 20);
if (composerText()) throw new Error('The fixture composer did not start empty.');
shot('blank-composer');

// 3. The bubble over a blank composer: it asks for the one line the post is about.
if (nodes().some(node => (node.text ?? '').startsWith('Start your post') || (node.text ?? '').startsWith('Nothing to reply'))) { key(4); await wait(2000); }
bubble();
await wait(2000);
// The offline sign-in stand-in keeps its connected state in memory, so restarting the app (a theme
// flip does) ends it. Reconnect once through the app's own screen, then tap the bubble again.
if (nodes().some(node => (node.text ?? '').includes("can't write drafts on its own"))) {
  key(4);
  await wait(1500);
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source');
  await wait(6000);
  nodes('Continue with ChatGPT');
  for (let attempt = 0; attempt < 40 && !screenText().includes('is connected'); attempt++) await wait(1000);
  if (!screenText().includes('is connected')) throw new Error('The offline sign-in did not reconnect.');
  adb('shell', 'am', 'start', '-n', `${fixturePkg}/com.twitter.android.Composer`);
  await wait(2500);
  bubble();
  await wait(2000);
}
await withNodes('the ask', list => !!panelTitle(list), 25);
shot('ask');
const asked = nodes().map(node => node.text).filter(Boolean);

if (before) {
  console.log(`Base build: a blank X-style composer shows "${asked.filter(t => /write|nothing|polish/i.test(t)).join(' | ') || 'an empty state'}" - no ask for a line, no drafts. Shots in ${out}.`);
  process.exit(0);
}

const LINE = 'shipping offline notes';
const EDITED = 'What I learned shipping offline notes.';

// A blank post must give him something to work from, never a question he would have to post as his own:
// the panel asks for the one line the post is about, and drafts nothing until it has it.
if (!asked.some(text => /one line about what your post is about/i.test(text))) throw new Error(`The panel did not ask for the one line.\n${asked.join(' | ')}`);
if (asked.some(text => /^Use this$/.test(text))) throw new Error('The panel offered a draft from an empty composer.');
if (asked.join(' ').match(/\?|here are 3|viral|hook/i)) throw new Error(`The panel asked him a question instead of for a line.\n${asked.join(' | ')}`);

// 4. The one line, then the drafts: the post is written from what he actually said.
key(4); // Back closes the panel so the composer takes the line.
await wait(1500);
type(LINE);
await wait(1500);
if (composerText() !== LINE) throw new Error(`The composer did not take the line (saw "${composerText() || 'nothing'}").`);
shot('one-line');
bubble();
await withNodes('the drafts', list => list.some(node => /^Use this$/.test(node.text ?? '')), 25);
await wait(2500);
const cards = nodes().map(node => node.text).filter(Boolean);
if (!cards.some(text => text.trim() && text !== LINE && !/Use this|Copy|Edit|Why\?|Start your post|X/.test(text))) throw new Error(`The panel drafted nothing from his line.\n${cards.join(' | ')}`);
if (cards.some(text => /^\?$/.test(text.trim()))) throw new Error('A question was offered as his post.');
shot('drafts');

// 5. Edit one draft and insert exactly that text.
evidence('motion-start', 'ov-own-posts', 'edit-and-insert');
try {
// The sheet swallows coordinate taps, so its controls are driven through the probe's own
// ACTION_CLICK (the panel sequence in the verify-ownvoice skill uses DPAD where taps die).
nodes('Edit'); // The first card in the tree is the one being edited.
await withNodes('the opened editor', list => list.some(node => node.editable && node.windowType !== 4), 15);
shot('editing');
key(123); // MOVE_END, so the edit replaces the draft instead of appending to it.
await wait(400);
key(67, 80); // DEL back past the start.
await wait(400);

type(EDITED);
await wait(1200);
shot('edited');
if (nodes().find(node => node.editable && node.windowType !== 4)?.text !== EDITED) throw new Error('The edit did not take.');
nodes('Use this'); // The edited card's own Use this: it is the first one in the tree.
await wait(3500);
} finally { evidence('motion-stop'); }
shot('inserted');

// 5. The read-back: the composer holds exactly the edited text, and nothing was posted.
if (panelTitle(nodes())) { key(4); await wait(2000); }
if (composerText() !== EDITED) throw new Error(`The composer does not hold the edited text (saw "${composerText() || 'nothing'}").`);
if (!/insert result ok=true/.test(adb('logcat', '-d', '-s', 'OwnvoiceNative:I'))) throw new Error('The native module did not confirm the insertion.');
shot('read-back');
console.log(`Own-post proof on ${serial} (${avd}): blank composer -> asked for the one line -> drafts from it -> edited -> inserted and read back ("${composerText()}"). Shots in ${out}.`);
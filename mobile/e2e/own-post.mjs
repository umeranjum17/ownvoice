// ov-own-posts emulator proof: a blank X-style composer asks for the one line the post is
// about, drafts from that line, one draft is edited, and the edited text lands in the
// composer (read back from the fixture itself).
// Own lane AVD only; refuses to run on any other emulator or on a phone, except the lab phone for the
// phone writer leg (OWN_POST_WRITER=phone), which keeps its own settings and writer.
//
//   ANDROID_SERIAL=emulator-XXXX OWNVOICE_AVD_NAME=fm-ownposts1 \
//     node e2e/own-post.mjs <release-apk> [outdir]
//
// Needs the APK built with EXPO_PUBLIC_E2E_STUB=1 EXPO_PUBLIC_E2E_GPT=1 (fixed drafts and
// the offline sign-in stand-in), and e2e/first-run.mjs run once first so setup is finished.
// Set OWNVOICE_BEFORE=1 against the base build: it captures the same screens without the
// own-post assertions, so before and after sit side by side in one evidence folder.
// Never UiAutomator: it would unbind the running Ownvoice service (e2e/accessibility.mjs).
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { accessibilityProbe, center, emulatorName } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL?.trim();
// The phone leg (OWN_POST_WRITER=phone) runs only on the lab phone, with the phone's own writer and
// none of the emulator-only settings (its font, size, night mode and fixture are left as they are).
const LAB_PHONE = 'a4b93ea2';
const writer = process.env.OWN_POST_WRITER ?? '';
const phone = writer === 'phone';
const avd = process.env.OWNVOICE_AVD_NAME;
if (phone) {
  if (serial !== LAB_PHONE) throw new Error(`The phone writer proof runs only on the lab phone ${LAB_PHONE}.`);
} else {
  if (!/^emulator-\d+$/.test(serial ?? '')) throw new Error('Set ANDROID_SERIAL to an owned emulator (owner phones are refused).');
  const actual = emulatorName(serial);
  if (!avd || actual !== avd) throw new Error(`Refusing ${serial}: AVD ${actual} is not ${avd}.`);
}
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const before = process.env.OWNVOICE_BEFORE === '1';
const label = before ? 'before' : 'after';
const theme = process.env.OWNVOICE_THEME ?? 'light';
// The live leg (done-done journey own-posts): the real writer connected through the app's own screens,
// no stub text. OWN_POST_WRITER=opencode connects the OpenCode Go key; OWN_POST_WRITER=phone uses the
// phone's own writer. OWN_POST_NARROW=1 runs the emulator round at 720x1280, font 1.3.
const live = writer === 'opencode' || phone;
const out = resolve(process.argv[3] ?? 'mobile/.own-post');
mkdirSync(out, { recursive: true });
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// evidence.sh writes verify-artifacts/<task>/ relative to the repo root, so it runs from there.
const evidence = (...args) => execFileSync('bash', [resolve(repoRoot, 'mobile/e2e/evidence.sh'), ...args],
  { env: { ...process.env, ANDROID_SERIAL: serial }, encoding: 'utf8', cwd: repoRoot });
const shot = screen => evidence('shot', 'ov-own-posts', screen, label, theme);

const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const fixturePkg = 'com.twitter.android';
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const nodes = accessibilityProbe(serial, out, { phone });
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

// OnePlus phones (AGENTS.md) stop on a "Continue installation" page during adb install and leave an
// "Installed" page after it. Continue is tapped only while that page is in front, on the OnePlus 13
// it is known to sit at 540,1833; every install ends with Back on the installer's page.
async function installOnPhone(file) {
  let code = null;
  const child = spawn('adb', ['-s', serial, 'install', '-r', file], { stdio: 'inherit' });
  child.on('exit', status => { code = status ?? -1; });
  const model = adb('shell', 'getprop', 'ro.product.model').trim();
  const installerFocus = () => /InstallGuideActivity|PackageInstaller/.test(adb('shell', 'dumpsys', 'window').split('\n').find(line => line.includes('mCurrentFocus')) ?? '');
  for (let i = 0; i < 180 && code === null; i++) {
    await wait(1000);
    if (i >= 5 && model === 'PJZ110' && installerFocus()) adb('shell', 'input', 'tap', '540', '1833');
  }
  if (code !== 0) throw new Error(`adb install of ${file} on ${serial} exited with ${code}; the app is unchanged.`);
  await wait(1500);
  if (installerFocus()) { adb('shell', 'input', 'keyevent', '4'); await wait(1500); }
}

// 1. The fixture, the app, and the service. A first install never keeps the service bound,
//    so the documented off/on toggle follows; e2e/first-run.mjs restored its own settings.
// The phone keeps its own font, size, density and night mode: only the emulator rounds set them.
if (phone) {
  if (process.env.OWN_POST_NARROW === '1') throw new Error('The narrow round runs on an emulator only: the phone keeps its font and size.');
} else if (process.env.OWN_POST_NARROW === '1') {
  evidence('font', 'largest');
  adb('shell', 'wm', 'size', '720x1280');
  adb('shell', 'wm', 'density', '320');
} else {
  evidence('font', 'default');
  adb('shell', 'wm', 'size', 'reset');
  adb('shell', 'wm', 'density', 'reset');
}
if (!phone) evidence('theme', theme);
const fixtureApk = buildFixture(out);
if (phone) {
  // A real X on the phone is never replaced: only a fixture this run's adb installed may be.
  const installer = adb('shell', 'pm', 'list', 'packages', '-i', fixturePkg).trim();
  if (installer && !/installer=(com\.android\.shell|null)/.test(installer)) throw new Error(`${fixturePkg} on the phone is not our fixture (${installer}); the run stops.`);
  // An earlier run's fixture, adb-installed, is removed so this build's fixture can install (its version is lower).
  if (installer) adb('shell', 'pm', 'uninstall', fixturePkg);
} else {
  // A leftover fixture from an earlier run is fine; the install below replaces it.
  try { adb('shell', 'pm', 'uninstall', fixturePkg); } catch { /* nothing installed yet */ }
}
execFileSync('adb', ['-s', serial, 'install', '-r', fixtureApk], { stdio: 'inherit' });
// The phone install replaces the app in place, so its downloaded writer model stays. Otherwise install
// the app only when it is missing: reinstalling kills the process, and the offline sign-in stand-in
// (e2e/first-run.mjs) keeps its connected state in memory, not on disk.
if (phone) await installOnPhone(apk);
else if (!adb('shell', 'pm', 'path', pkg).includes('package:')) execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
// The OpenCode leg starts from a first install: a fresh process, setup not done, the service off, and
// no stored writer, so the module walks the setup and connects the real key itself.
if (writer === 'opencode') adb('shell', 'pm', 'clear', pkg);
adb('shell', 'logcat', '-c');
// Phone only: the phone's own settings are kept while the run changes them and put back at the end,
// also when the run is killed: its accessibility services, stay-awake and screen timeout. The music
// stream is at 30% or lower for the run, then 0 (the lead's steer for this proof).
const setting = (space, key) => adb('shell', 'settings', 'get', space, key).trim();
const putBack = (space, key, value) => (value === 'null' || value === '')
  ? adb('shell', 'settings', 'delete', space, key)
  : adb('shell', 'settings', 'put', space, key, value);
const phoneKeep = phone ? {
  services: setting('secure', 'enabled_accessibility_services'),
  enabled: setting('secure', 'accessibility_enabled'),
  stayOn: setting('global', 'stay_on_while_plugged_in'),
  timeout: setting('system', 'screen_off_timeout'),
} : null;
const musicStream = () => {
  const block = adb('shell', 'dumpsys', 'audio').split(/^\s*-\s*STREAM_MUSIC:/m)[1] ?? '';
  return { max: Number(block.match(/Max:\s*(\d+)/)?.[1] ?? 0), current: Number(block.match(/Current:\s*(\d+)/)?.[1] ?? -1) };
};
const setMusic = value => {
  for (const args of [['media', 'volume', '--show', '--stream', '3', '--set', String(value)], ['cmd', 'media_session', 'volume', '--show', '--stream', '3', '--set', String(value)]]) {
    try { adb('shell', ...args); } catch { continue; }
    if (musicStream().current === value) return true;
  }
  return false;
};
let restored = false;
const restorePhone = () => {
  if (!phoneKeep || restored) return;
  restored = true;
  putBack('secure', 'enabled_accessibility_services', phoneKeep.services);
  putBack('secure', 'accessibility_enabled', phoneKeep.enabled);
  // The lead's fixed values for this phone (not the ones read before the run).
  putBack('global', 'stay_on_while_plugged_in', '0');
  putBack('system', 'screen_off_timeout', '60000');
  if (!setMusic(0)) console.error('The phone music volume could not be set back to 0.');
  const readBack = ['global stay_on_while_plugged_in', 'system screen_off_timeout'].map(k => { const [a, b] = k.split(' '); return `${b}=${setting(a, b)}`; });
  console.log(`phone restored: ${readBack.join(' ')} volume=${musicStream().current}`);
};
const preparePhone = () => {
  // A locked phone needs its PIN, which is never typed: the run stops before anything changes.
  if (/isKeyguardShowing=true|mShowingLockscreen=true|mDreamingLockscreen=true/.test(adb('shell', 'dumpsys', 'window'))) throw new Error('The phone is locked; the run stops (no PIN is typed).');
  process.on('SIGTERM', () => { restorePhone(); process.exit(143); });
  process.on('SIGINT', () => { restorePhone(); process.exit(130); });
  try {
    adb('shell', 'settings', 'put', 'global', 'stay_on_while_plugged_in', '2');
    adb('shell', 'settings', 'put', 'system', 'screen_off_timeout', '3600000');
    // A phone that refuses the volume command still runs: the app plays no sound, and the log says so.
    const { max, current } = musicStream();
    const cap = Math.floor(max * 0.3);
    if (!max) console.error('The phone music volume cannot be read; it is left as it is.');
    else if (current > cap && !setMusic(cap)) console.error(`The phone music volume could not be set to ${cap} (30%); it is left as it is.`);
  } catch (error) {
    restorePhone();
    throw error;
  }
};
const toggleService = async on => {
  if (phone) {
    // Only Ownvoice's entry changes: the phone's other accessibility services stay on.
    const others = phoneKeep.services.split(':').filter(s => s && s !== 'null' && s !== component);
    const list = on ? [...others, component] : others;
    if (list.length) adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', list.join(':'));
    else adb('shell', 'settings', 'delete', 'secure', 'enabled_accessibility_services');
  } else {
    const list = on ? [component] : ['com.example.disabled/NoService'];
    adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', list.join(':'));
  }
  adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
  await wait(1500);
};
const bound = () => /Bound services:\s*\{[^}]*Ownvoice/.test(adb('shell', 'dumpsys', 'accessibility'));
if (live) {
  const { proveOwnPostLive } = await import('./own-post-live.mjs');
  if (phone) preparePhone();
  try {
    await toggleService(false);
    await proveOwnPostLive({
      adb, nodes, bubble, wait, evidence, theme, out, fixturePkg, pkg, type, key,
      withNodes, composerText, screenText, center, bound, phone, rebind: () => toggleService(true),
      // A settings CHANGE re-triggers the bind (an on→on put is no event): off, then on again.
      rebindCycle: async () => { await toggleService(false); await toggleService(true); },
    });
  } finally {
    restorePhone();
  }
  process.exit(0);
}
await toggleService(false);
await toggleService(true);
await wait(2500);
if (!bound()) throw new Error('Ownvoice accessibility service is not bound.');

if (process.env.OWNVOICE_OUTCOME_PROOF === '1') {
  const { proveOutcomes } = await import('./outcomes.mjs');
  await proveOutcomes({ adb, nodes, bubble, wait, evidence, theme, before, out, fixturePkg, pkg });
  process.exit(0);
}

// 2. The blank X-style composer: focused, empty, nothing on it about the post.
adb('shell', 'monkey', '-p', fixturePkg, '-c', 'android.intent.category.LAUNCHER', '1');
await withNodes('the blank composer', list => !!list.find(node => node.className === 'android.widget.EditText' && node.editable), 20);
if (composerText()) throw new Error('The fixture composer did not start empty.');
shot('blank-composer');

// 3. The bubble over a blank composer: it asks for the one line the post is about.
if (nodes().some(node => (node.text ?? '').startsWith('Start your post') || (node.text ?? '').startsWith('Nothing to reply'))) { key(4); await wait(2000); }
// The offline sign-in stand-in keeps its connected state in memory, so any restart of the app (an
// install, a theme flip, a force-stop) ends it. Reconnect once through the app's own screen, return to
// the composer and tap the bubble again; false when there was nothing to reconnect.
const ensureConnected = async () => {
  if (!nodes().some(node => (node.text ?? '').includes("can't write drafts on its own"))) return false;
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
  return true;
};

bubble();
await wait(2000);
await ensureConnected();
await withNodes('the ask', list => !!panelTitle(list), 30);
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
// The same reconnect applies to the second tap: the composer had no writer to route to, and a tap
// that lands while the composer is still settling can re-read the field as empty, which shows the ask
// again. Close it and tap once more before calling the journey a failure.
const useThis = list => list.some(node => /^Use this$/.test(node.text ?? ''));
const retypeLine = async () => {
  // Opening the panel can recreate the fixture activity, which loses the line it was holding, so a
  // retry starts from a fresh composer with the line typed again.
  adb('shell', 'am', 'force-stop', fixturePkg);
  await wait(1500);
  adb('shell', 'monkey', '-p', fixturePkg, '-c', 'android.intent.category.LAUNCHER', '1');
  await withNodes('the composer', list => !!list.find(node => node.className === 'android.widget.EditText' && node.editable), 15);
  type(LINE);
  await wait(1500);
  if (composerText() !== LINE) throw new Error(`The composer did not take the line again (saw "${composerText() || 'nothing'}").`);
  key(4); // Drop the keyboard so the bubble tap cannot land on it.
  await wait(1500);
};
for (let attempt = 0; attempt < 3; attempt++) {
  if (attempt) await retypeLine();
  bubble();
  await wait(2500);
  try { await withNodes('the drafts', useThis, 60); break; } catch { if (attempt === 2) { await ensureConnected(); await withNodes('the drafts', useThis, 90); } }
}
await wait(2500);
const cards = nodes().map(node => node.text).filter(Boolean);
if (!useThis(nodes())) throw new Error(`The panel drafted nothing from his line.\n${cards.join(' | ')}`);
if (cards.some(text => /^\?$/.test(text.trim()))) throw new Error('A question was offered as his post.');
shot('drafts');

// 5. Edit one draft and insert exactly that text.
evidence('motion-start', 'ov-own-posts', 'edit-and-insert');
try {
// The sheet swallows coordinate taps, so its controls are driven through the probe's own
// ACTION_CLICK (the panel sequence uses DPAD where taps die).
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
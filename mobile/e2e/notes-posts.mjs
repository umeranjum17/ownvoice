// Posts from notes on an owned emulator, written by the free phone writer. No browser, sign-in, stub, send or post tap.
// Install the candidate and get "On this phone" ready through setup first.
// ANDROID_SERIAL=emulator-NNNN OWNVOICE_AVD_NAME=<owned> node mobile/e2e/notes-posts.mjs <scratch> <evidence>
// NOTES_LEG=share (default): Umer's notes arrive as a share, as from a notes app; the first post is edited, then copied.
// NOTES_LEG=replace: the notes sit in the lab X composer and arrive as its selection; Replace puts the first post in the
// field, read back from the fixture; Post is never tapped.
// NOTES_LEG=before: the base build's sheet for the same share, captured with no writer call.
// OWNVOICE_THEME=dark captures in dark (the app process restarts so it reads the mode).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accessibilityProbe, emulatorName } from './accessibility.mjs';
import { copiesPost, norm } from '../../packages/engine/src/drafts.ts';
import { addedNumbers } from '../../packages/engine/src/slop.ts';
import { postInstruction } from '../src/core/notesPosts.ts';

const notes = 'focus timer app, week 12\n- shipped the break reminder today\n- 3 testers said the old one felt pushy\n- now a quiet sound, no popup\n- next up: weekly summary';
const leg = process.env.NOTES_LEG ?? 'share';
assert.ok(['share', 'replace', 'before'].includes(leg));
const theme = process.env.OWNVOICE_THEME ?? 'light';
const serial = process.env.ANDROID_SERIAL;
assert.match(serial ?? '', /^emulator-\d+$/);
assert.ok(process.env.OWNVOICE_AVD_NAME);
assert.equal(emulatorName(serial), process.env.OWNVOICE_AVD_NAME);
const [scratchArg, evidenceArg] = process.argv.slice(2);
assert.ok(scratchArg && evidenceArg, 'Pass task-owned scratch and evidence directories');
const scratch = resolve(scratchArg), evidence = resolve(evidenceArg);
mkdirSync(scratch, { recursive: true }); mkdirSync(evidence, { recursive: true });
const repo = fileURLToPath(new URL('../../', import.meta.url));
const pkg = 'dev.ownvoice.next', service = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`, sheet = `${pkg}/dev.ownvoice.bridge.RewriteActivity`;
const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
// adb shell joins its arguments again remotely: quote each one, so the notes keep their spaces and line breaks.
const adb = (...args) => execFileSync('adb', ['-s', serial, ...(args[0] === 'shell' ? ['shell', args.slice(1).map(quote).join(' ')] : args)], { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const nodes = accessibilityProbe(serial, scratch);
// A busy host can make the app's cold start trip Android's not-responding dialog: answer it with Wait, never Close.
const answerNotResponding = () => {
  const button = nodes().find(n => n.app === 'android' && n.text === 'Wait');
  if (button) adb('shell', 'input', 'tap', ...[(button.bounds[0] + button.bounds[2]) / 2, (button.bounds[1] + button.bounds[3]) / 2].map(n => String(Math.round(n))));
  return !!button;
};
const until = async (label, read, seconds = 60) => {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) { const found = answerNotResponding() ? null : read(); if (found) return found; await wait(2000); }
  throw new Error(`Timed out waiting for ${label}`);
};
const hashes = new Set();
const shot = name => {
  const png = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 24 * 1024 * 1024 });
  const hash = createHash('sha256').update(png).digest('hex');
  if (hashes.has(hash)) return null;
  hashes.add(hash);
  writeFileSync(join(evidence, `${name}.png`), png);
  writeFileSync(join(evidence, `${name}.nodes.json`), JSON.stringify(nodes(), null, 1));
  return `${name}.png`;
};

// The theme flips before the app process starts, since React Native reads it at process start; the service is
// toggled off and on afterwards because a stopped process is not rebound on its own (AGENTS.md).
adb('shell', 'cmd', 'uimode', 'night', 'custom_schedule', '-o', 'off');
adb('shell', 'cmd', 'uimode', 'night', theme === 'dark' ? 'yes' : 'no');
adb('shell', 'am', 'force-stop', pkg);
const enabled = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
const others = enabled === 'null' ? [] : enabled.split(':').filter(name => name && name !== service);
adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', (others.length ? others : ['com.example.disabled/NoService']).join(':'));
await wait(1500);
adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...others, service].join(':'));
adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
await wait(2500);

// The lab X composer with the notes pasted in, built with the installed SDK tools (no network).
const composer = () => nodes().find(n => n.editable && n.app === 'com.twitter.android');
if (leg === 'replace') {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  assert.ok(sdk && process.env.JAVA_HOME);
  const newest = dir => readdirSync(dir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
  const tools = join(sdk, 'build-tools', newest(join(sdk, 'build-tools')));
  const android = join(sdk, 'platforms', newest(join(sdk, 'platforms')), 'android.jar');
  const run = (command, args) => execFileSync(command, args, { stdio: 'pipe' });
  const classes = join(scratch, 'classes'); mkdirSync(classes, { recursive: true });
  const source = join(scratch, 'Composer.java'), manifest = join(scratch, 'AndroidManifest.xml');
  writeFileSync(source, readFileSync(join(repo, 'mobile/e2e/fixture/Composer.java')));
  writeFileSync(manifest, readFileSync(join(repo, 'mobile/e2e/fixture/AndroidManifest.xml')));
  run(join(process.env.JAVA_HOME, 'bin/javac'), ['-cp', android, '-d', classes, source]);
  const jar = join(scratch, 'composer.jar'), apk = join(scratch, 'fixture.apk');
  run(join(process.env.JAVA_HOME, 'bin/jar'), ['cf', jar, '-C', classes, '.']);
  run(join(tools, 'd8'), ['--lib', android, '--output', scratch, jar]);
  run(join(tools, 'aapt'), ['package', '-f', '-M', manifest, '-I', android, '-F', apk]);
  run('zip', ['-j', apk, join(scratch, 'classes.dex')]);
  run(join(tools, 'apksigner'), ['sign', '--ks', join(repo, 'mobile/android/app/debug.keystore'), '--ks-key-alias', 'androiddebugkey', '--ks-pass', 'pass:android', apk]);
  adb('install', '-r', apk);
  adb('shell', 'am', 'start', '-S', '-n', 'com.twitter.android/.Composer', '--es', 'text', notes);
  await until('the notes in the lab composer', () => composer()?.text === notes);
}

// The sheet opens as Android's share or selection action would open it, named explicitly so only Ownvoice answers.
const extra = leg === 'replace' ? 'android.intent.extra.PROCESS_TEXT' : 'android.intent.extra.TEXT';
adb('shell', 'am', 'start', '-n', sheet, '-a', leg === 'replace' ? 'android.intent.action.PROCESS_TEXT' : 'android.intent.action.SEND', '-t', 'text/plain', '--es', extra, notes);
const choice = 'Posts for X';
await until('the sheet with the notes', () => { const list = nodes(); return list.some(n => n.text === notes) && list.some(n => /^Shorter$/.test(n.label)) ? list : null; });
const captures = [];
const opened = shot(`${leg}-sheet-${theme}`);
if (opened) captures.push(opened);
const steps = [leg === 'replace' ? 'Open the lab X composer with Umer\'s notes pasted in, and select them for Ownvoice' : 'Share Umer\'s notes to Ownvoice, as from a notes app'];
let result = { notes, theme, sent: false };
if (leg === 'before') {
  assert.ok(!nodes().some(n => n.label === choice), 'The base build has no posts choice');
  steps.push('Look at the sheet: it offers only the rewrite choices');
} else {
  nodes(choice);
  steps.push(`Tap ${choice}`);
  // Writing ends with the sheet's own line; then the phone's fit, if any, lands as bars or as one line for the set.
  const DONE = /^Three posts from your notes\./, NONE = /^Couldn't write posts/;
  const end = await until('the posts', () => nodes().find(n => DONE.test(n.text ?? '') || NONE.test(n.text ?? '')), 1200);
  assert.ok(DONE.test(end.text), `The sheet said: ${end.text}`);
  const NEEDS_ONLINE = 'Fit levels need an online writer, such as your ChatGPT. The writer on this phone can’t rate them.';
  const LEVEL = /^(Likely to be skipped|Might get a reply|Good fit here|Strong fit here|Not sure about this one)$/;
  const fitRead = list => ({ line: list.filter(n => n.text === NEEDS_ONLINE).length, bars: list.filter(n => LEVEL.test(n.label ?? '')).map(n => n.label) });
  // The sheet scrolls only with a slow drag; the fit sits under the last post, so each look scrolls down first.
  const [width, height] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
  const scroll = down => adb('shell', 'input', 'swipe', String(width / 2), String(height * (down ? .72 : .3)), String(width / 2), String(height * (down ? .3 : .72)), '1200');
  const fit = await until('the fit', () => { scroll(true); const read = fitRead(nodes()); return read.line || read.bars.length ? read : null; }, 900);
  for (let i = 0; i < 5; i++) scroll(false);
  steps.push('Wait for the phone writer and its fit');

  // Every card: its label, its post and its rating rows, read while scrolling down the sheet.
  const labels = ['Main point', 'What happened', 'What I learned'];
  const posts = new Map(), rated = new Set();
  for (let step = 0; step < 6; step++) {
    const list = nodes();
    let current = null;
    for (let i = 0; i < list.length; i++) {
      const label = labels.find(label => label.toLowerCase() === list[i].text?.toLowerCase());
      if (label) {
        current = label;
        const body = list.slice(i + 1).find(n => n.text?.trim());
        if (body) posts.set(label, body.text.trim());
      }
      if (current && /^Engagement on X:/.test(list[i].label ?? '') && /Stock wording:/.test(list[i].label)) rated.add(current);
    }
    const name = shot(`${leg}-posts-${step + 1}-${theme}`);
    if (name) captures.push(name);
    // The fit's line or bars sit under the last post: once they show, every post has been on screen.
    if (posts.size && rated.size === posts.size && (fitRead(list).line || fitRead(list).bars.length)) break;
    scroll(true);
    await wait(1500);
  }
  const texts = [...posts.values()];
  assert.ok(texts.length > 0, 'No post was offered');
  assert.equal(new Set(texts.map(norm)).size, texts.length, 'Posts must differ');
  for (const text of texts) {
    assert.ok(!copiesPost(text, notes), `Post copies the notes: ${text}`);
    assert.ok(!postInstruction(text), `Post reads as an instruction: ${text}`);
    assert.deepEqual(addedNumbers(notes, text), [], `Post adds a number: ${text}`);
    assert.ok(text.length <= 280, `Post is too long for X: ${text}`);
  }
  assert.equal(rated.size, posts.size, 'Every post has its engagement and stock rows');
  if (fit.bars.length) assert.ok(!fit.line, 'A level shows bars only');
  else assert.equal(fit.line, 1, 'No level shows the online-writer line once');
  steps.push('Scroll every post and its rating rows');
  result = { ...result, posts: Object.fromEntries(posts), fit };

  // Back to the first card for the hand-off.
  for (let i = 0; i < 5; i++) scroll(false);
  await wait(1000);
  const first = posts.get(labels.find(label => posts.has(label)));
  const sha = text => createHash('sha256').update(text).digest('hex').slice(0, 12);
  adb('logcat', '-c');
  if (leg === 'share') {
    nodes('Edit');
    const field = await until('the edit field', () => nodes().find(n => n.editable && n.app === pkg && n.text === first));
    adb('shell', 'input', 'tap', ...[(field.bounds[0] + field.bounds[2]) / 2, (field.bounds[1] + field.bounds[3]) / 2].map(n => String(Math.round(n))));
    // Ctrl+End reaches the end of the whole post; End alone stops at the end of a wrapped line.
    adb('shell', 'input', 'keycombination', 'KEYCODE_CTRL_LEFT', 'KEYCODE_MOVE_END');
    adb('shell', 'input', 'text', '%sMore%ssoon.');
    const edited = `${first} More soon.`;
    await until('the edited post', () => nodes().some(n => n.editable && n.text === edited));
    // Back closes only the keyboard; with no keyboard up it would close the sheet.
    if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) adb('shell', 'input', 'keyevent', '4');
    await wait(800);
    const name = shot(`share-edited-${theme}`);
    if (name) captures.push(name);
    nodes('Copy');
    const copied = await until('the copy', () => adb('logcat', '-d', '-s', 'OwnvoiceNative:I').match(/rewrite copied sha=(\w+)/)?.[1]);
    assert.equal(copied, sha(edited), 'Copy hands over exactly the edited post');
    steps.push('Edit the first post, then Copy it; nothing is sent');
    result = { ...result, edited, copied: true };
  } else {
    nodes('Replace');
    const inserted = await until('the post in the composer', () => { const text = composer()?.text; return text === first ? text : null; });
    await wait(800);
    const name = shot(`replace-composer-${theme}`);
    if (name) captures.push(name);
    steps.push('Tap Replace on the first post; read the composer back; never tap Post');
    result = { ...result, inserted };
  }
}
// done-done reads `result` as one plain sentence; the texts and reads stay in `details`.
const said = leg === 'before' ? 'The sheet offers only the rewrite choices, with no posts choice.'
  : `${Object.keys(result.posts).length} distinct posts from the notes, each with its rating rows; ${result.fit.bars.length ? 'fit levels shown' : 'one line says fit levels need an online writer'}; ${leg === 'share' ? 'the first post was edited and exactly that text copied' : 'Replace put the first post in the composer'}; nothing was posted.`;
writeFileSync(join(evidence, `steps-${leg}-${theme}.json`), JSON.stringify({ target: { version: adb('shell', 'dumpsys', 'package', pkg).match(/versionName=(\S+)/)?.[1] }, start: 'Candidate installed on an owned x86_64 emulator, free phone writer ready', steps, result: said, details: result, captures }, null, 2));
adb('shell', 'input', 'keyevent', '4');
console.log(JSON.stringify({ leg, theme, ...result, captures, passed: true }));

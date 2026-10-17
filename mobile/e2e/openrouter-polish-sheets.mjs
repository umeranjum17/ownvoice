// OpenRouter/OpenCode Go polish-sheet live proof (real DeepSeek V4.1 Flash through Ownvoice, no stand-ins).
// Proves the output-fix acceptance cases on the real product, from a Chrome lab composer:
//   1 autosave      - the polished versions keep "autosave" and never offer "autoclave"
//   2 split capital - a rewrite that splits the sentence keeps "Make" capital after the full stop
//   3 nonsense      - meaningless input gets the honest no-clear-message refusal, not a retry line
//   4 empty         - an empty box asks for a line first (in Chrome, the one line for a new post)
//   5 non-polishable- keyboard mash is declined honestly
//   6 max text      - the documented Chrome capture limit renders honestly with no clipping
//   7 real message  - a plain message still gets versions (the decline only meets text with no clear message)
// Declined cases show no spelling guesses: for mash they are made-up words.
// Each case captured light and dark; the cases repeated once on a narrow phone at font scale 1.3.
// POLISH_ONLY=<ids> runs only those cases; POLISH_ROUNDS=light,dark (default light,dark,narrow; light
// only with POLISH_ONLY) picks the rounds.
// Build with no E2E flags: a stub build lets the canned phone writer stand in (the provenance guard
// below still fails a run on its fixed text). Env: ANDROID_SERIAL, OWNVOICE_AVD_NAME,
// JAVA_HOME, ANDROID_HOME. WRITER=openrouter (default, OPENROUTER_KEY_FILE) or opencode (OPENCODE_KEY:
// the OpenCode Go plan key, resolved from the desktop OpenCode login, never logged; OPENCODE_WORKSPACE
// names the workspace to pick when the key has several). Args: <apk> <out-dir>.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { accessibilityProbe, center, emulatorName } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL;
if (!/^emulator-\d+$/.test(serial ?? '')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const avd = process.env.OWNVOICE_AVD_NAME;
if (!avd || emulatorName(serial) !== avd) throw new Error(`Refusing ${serial}: AVD ${emulatorName(serial)} is not ${avd}.`);
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = resolve(process.argv[3] ?? 'e2e/artifacts/openrouter-polish');
mkdirSync(out, { recursive: true });
// The writer under proof: OpenRouter's per-use key, or OpenCode Go's plan key on the plan's own
// endpoint (PR 209 wiring). The key only ever enters the app's paste field: never printed,
// screenshotted, logged or committed.
const WRITER = process.env.WRITER ?? 'openrouter';
const WRITERS = {
  openrouter: { card: 'with your openrouter', field: 'paste your openrouter key', connected: 'openrouter is connected', signedOut: 'sign out of openrouter', name: 'OpenRouter' },
  opencode: { card: 'with your opencode go', field: 'paste your opencode go key', connected: 'opencode go is connected', signedOut: 'sign out of opencode go', name: 'OpenCode Go' },
};
const W = WRITERS[WRITER];
if (!W) throw new Error(`Unknown WRITER=${WRITER} (openrouter|opencode).`);
const key = WRITER === 'opencode'
  ? (process.env.OPENCODE_KEY ?? '').trim()
  : readFileSync(process.env.OPENROUTER_KEY_FILE ?? `${process.env.HOME}/.config/openrouter/api_key`, 'utf8').trim();
if (!key) throw new Error(`No ${W.name} key: ${WRITER === 'opencode' ? 'set OPENCODE_KEY' : 'set OPENROUTER_KEY_FILE'}.`);
const workspace = process.env.OPENCODE_WORKSPACE ?? 'Working2'; // the Go workspace to pick, as opencode-proof.mjs
if (WRITER === 'openrouter' && !key.startsWith('sk-')) throw new Error('OpenRouter key file did not look like a key.');

const AUTOSAVE = 'autosave locally and make export easy.';
const NONSENSE = 'the database got eaten backwards by purple toaster clouds banana banana';
const EMPTY = '';
const MASH = 'asdf qwer zxcv';
const MESSAGE = 'i think we should meet tomorrow at 10 to go over the plan and the budget';
// A run-on with no stops and three clear thoughts: any stop a version adds is the writer's own
// sentence split, so the casing at the split is actually observable (the autosave text below never
// split in practice, and the earlier two-thought run-on gave the writer nothing to split).
const SPLIT = 'we should meet tomorrow at 10 to go over the plan and the budget and ali can bring the extra chairs but he might be late so start without him if he is not there by ten and please send me the notes from last week because i want to check the numbers before we decide';
const MAX = 'We should meet tomorrow to go over the plan and the budget. '.repeat(175);
// The words the panel uses for each honest state (packages/engine/src/words.ts), asserted verbatim.
const DECLINED_LINE = 'This text has no clear message to polish yet.';
const EMPTY_LINE = 'Write a line or two first, and Ownvoice will help you polish it.';
// Chrome reads as a feed app, so its blank box asks for the post's one line instead (Panel modeOf 'own').
const OWN_LINE = 'Write one line about what your post is about, then tap the bubble again.';
const LIMITED_LINE = 'In very long notes, checks cover only the first part.';
const READY_LINE = 'Pick one to use instead of what you wrote. You send it yourself.';
// The E2E phone stub's fixed drafts (mobile/src/panel/phoneWriter.ts): if one appears, the cloud
// writer did not answer and the canned demo writer stood in — a failed provenance, not a result.
const STUB_TEXTS = ["Should be. What time were you thinking?", "Yes, still on! I'll bring the stove.", 'Saturday is tricky for me. Could we do Sunday instead?'];

const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const nodes = accessibilityProbe(serial, out);
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = line => { const s = `${new Date().toISOString().slice(11, 19)} ${line}`; console.log(s); appendFileSync(resolve(out, 'polish-sheets-run.log'), s + '\n'); };
const snap = name => {
  adb('shell', 'screencap', '-p', `/sdcard/${name}.png`);
  execFileSync('adb', ['-s', serial, 'pull', `/sdcard/${name}.png`, resolve(out, `${name}.png`)], { stdio: 'ignore' });
};
const [width, height] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
const tap = (x, y) => adb('shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y)));
const type = text => adb('shell', 'input', 'text', text.replaceAll(' ', '%s'));

const find = pred => nodes().find(pred);
const findText = label => find(n => `${n.label} ${n.text}`.toLowerCase().includes(label.toLowerCase()));
const screenWords = () => nodes().map(n => n.text || n.label).filter(Boolean).join(' | ').slice(0, 300);
const waitText = async (label, tries = 40) => {
  const wanted = Array.isArray(label) ? label : [label];
  for (let i = 0; i < tries; i++) { const n = wanted.map(findText).find(Boolean); if (n) return n; await wait(1000); }
  // Keep the whole tree for the failure itself: the run() wrapper truncates the message.
  try { writeFileSync(resolve(out, 'wait-fail.json'), JSON.stringify(nodes(), null, 1)); } catch { /* best effort */ }
  throw new Error(`Could not see "${wanted.join('" or "')}" on screen: ${screenWords()}`);
};
const tapText = async (label, tries = 20) => {
  for (let i = 0; i < tries; i++) { const n = findText(label); if (n) { tap(...center(n)); return n; } await wait(1000); }
  throw new Error(`Could not find visible ${label}: ${screenWords()}`);
};
const bubbleNode = () => find(n => n.windowType === 4 && /^Ownvoice(?:,|$)/.test(n.label));
const tapBubble = () => { const n = bubbleNode(); if (!n) throw new Error('Ownvoice bubble is not visible.'); tap(...center(n)); };

const setService = async on => {
  const put = want => {
    const cur = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
    const set = new Set(cur === 'null' ? [] : cur.split(':'));
    want ? set.add(component) : set.delete(component);
    adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...set].join(':') || 'com.example.disabled/NoService');
  };
  put(false);
  if (!on) return;
  await wait(1500);
  put(true);
  adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
  for (let i = 0; i < 45 && !adb('shell', 'dumpsys', 'accessibility').includes(component); i++) await wait(1000);
  if (!adb('shell', 'dumpsys', 'accessibility').includes(component)) throw new Error('Accessibility service did not bind.');
};
const fresh = async () => { execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' }); adb('shell', 'pm', 'clear', pkg); await setService(true); };
const theme = async dark => {
  adb('shell', 'cmd', 'uimode', 'night', dark ? 'yes' : 'no');
  adb('shell', 'am', 'force-stop', pkg); await wait(1500);
  await setService(true);
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`); await wait(4000);
};
// The first run's welcome. After a fresh install on a busy emulator the app can take longer to become
// readable than one wait covers, so relaunch it and wait again before giving up (the service can bind
// to a process that is still starting and expose only a partial tree for a while).
const launchHome = async () => { adb('shell', 'am', 'force-stop', pkg); await wait(1500); await setService(true); adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`); await wait(5000); };
const skipSetup = async () => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { await waitText('sound like you', 25); break; }
    catch (e) {
      if (attempt === 3) throw e;
      log(`setup text not seen (attempt ${attempt}); relaunching the app`);
      await launchHome();
    }
  }
  adb('shell', 'input', 'keyevent', '4'); await wait(2500); await waitText('where the bubble shows', 30);
};
const openSource = async () => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source', pkg);
    try { await waitText(W.card, 20); return; } catch (e) { if (attempt === 3) throw e; await wait(1500); }
  }
};
const revealWriter = async () => {
  for (let i = 0; i < 5 && !findText(W.card); i++) {
    adb('shell', 'input', 'swipe', String(width / 2), String(height * .7), String(width / 2), String(height * .3), '300');
    await wait(1200);
  }
};
// Turn the as-you-type spelling check on from Home, so the panel's "Check these" list renders.
// Best effort: the row sits below the fold on some screens, so scroll for it; a miss is recorded.
let typingCheckOn = false;
const enableTypingCheck = async () => {
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice:///', pkg);
  await waitText('where the bubble shows', 30);
  for (let i = 0; i < 5 && !findText('check my spelling as i type'); i++) {
    adb('shell', 'input', 'swipe', String(width / 2), String(height * .7), String(width / 2), String(height * .3), '300');
    await wait(1200);
  }
  const row = findText('check my spelling as i type');
  if (!row) { log('typing check row not found; Check these list will be absent'); return; }
  if (find(n => n.checkable && n.checked === true && /spelling/i.test(n.label || ''))) { typingCheckOn = true; return; }
  tap(...center(row));
  for (let i = 0; i < 8 && !find(n => n.checkable && n.checked === true && /spelling/i.test(n.label || '')); i++) await wait(500);
  typingCheckOn = !!find(n => n.checkable && n.checked === true && /spelling/i.test(n.label || ''));
  log(`typing check on=${typingCheckOn}`);
};
const findRowWithState = (label, state) => find(n => n.checkable && n.label === label && n.checked === (state === 'On'));
const enableChrome = async () => {
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://apps', pkg);
  await waitText('find an app', 30);
  await tapText('find an app');
  type('Chrome');
  await wait(500);
  adb('shell', 'input', 'keyevent', '4');
  await wait(400);
  const row = await waitText('chrome', 20);
  if (findRowWithState('Chrome', 'Off')) {
    tap(...center(findRowWithState('Chrome', 'Off')));
    for (let i = 0; i < 8 && !findRowWithState('Chrome', 'On'); i++) await wait(500);
    if (!findRowWithState('Chrome', 'On')) throw new Error('The Chrome row did not switch on.');
  } else if (!findRowWithState('Chrome', 'On')) {
    throw new Error(`Could not find a Chrome row to switch on (${row.text}).`);
  }
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice:///', pkg);
  await waitText('where the bubble shows', 30);
};
const captureWriterList = async tag => {
  await openSource();
  await revealWriter();
  const card = findText(W.card);
  if (!card) throw new Error(`The writer list does not offer ${W.name}: the kit did not report its key route ready.`);
  snap(`writer-list-${tag}`);
  await wait(500);
  return card;
};
const connectWriter = async tag => {
  const card = await captureWriterList(tag);
  tap(...center(card));
  await waitText(W.field, 30);
  const field = find(n => (n.label || '').toLowerCase().includes(W.field));
  if (!field) throw new Error(`The ${W.name} key field did not open.`);
  tap(...center(field)); await wait(700);
  adb('shell', 'input', 'text', `'${key}'`); await wait(700); // never logged or screenshotted
  if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) { adb('shell', 'input', 'keyevent', '4'); await wait(900); }
  await tapText('connect', 20);
  // A Go login key with several workspaces gets the kit's pick (PR 216): tap OPENCODE_WORKSPACE.
  await waitText([W.connected, W.signedOut, 'more than one workspace'], 60);
  if (findText('more than one workspace')) {
    const named = () => find(n => (n.text || n.label || '').trim() === workspace);
    for (let i = 0; i < 3 && !named(); i++) { adb('shell', 'input', 'swipe', String(width / 2), String(height * 0.75), String(width / 2), String(height * 0.35), '300'); await wait(800); }
    if (!named()) throw new Error(`The workspace pick shows no "${workspace}": ${screenWords()}`);
    snap(`workspace-pick-${tag}`);
    tap(...center(named()));
    await waitText([W.connected, W.signedOut], 60);
  }
  snap(`connected-${tag}`);
  log(`${W.name} connected (${tag})`);
};

// The lab page holds exactly one message box prefilled with the case text, and short headings
// (under four words) so the panel stays in typed-polish / empty mode, never a reply.
let current = AUTOSAVE;
const servePage = () => {
  const server = createServer((_request, response) => {
    const escaped = current.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Message lab</title><style>body{font:18px sans-serif;padding:24px}textarea{display:block;width:100%;min-height:140px;padding:12px;font:18px sans-serif;border:2px solid #777}</style><h1>Message lab</h1><textarea aria-label="Message">${escaped}</textarea>`);
  });
  return new Promise(resolvePort => server.listen(0, '127.0.0.1', () => resolvePort(server)));
};
let page = null;
const dismissChromeFirstRun = async () => {
  for (let i = 0; i < 12; i++) {
    if (findText('message lab')) return;
    const n = ['accept & continue', 'without an account', 'no thanks', 'no thank you', 'got it', 'i understand'].map(findText).find(Boolean);
    if (n) { tap(...center(n)); await wait(1500); continue; }
    if (findText('ad privacy in chrome')) {
      // The one-time ad-privacy consent keeps its button below the fold on the narrow font-1.3
      // screen (the tree ends at the More link): scroll the sheet up until the button shows.
      const [w, h] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
      for (let s = 0; s < 5 && !findText('i understand'); s++) {
        adb('shell', 'input', 'swipe', String(w / 2), String(h * .8), String(w / 2), String(h * .3), '300');
        await wait(1000);
      }
      const ok = findText('i understand');
      if (ok) { tap(...center(ok)); await wait(1500); continue; }
      await wait(1000); continue;
    }
    await wait(1000);
  }
};

const CASES = [
  { id: 'autosave', text: AUTOSAVE, expect: 'versions' },
  { id: 'message', text: MESSAGE, expect: 'versions' },
  { id: 'split', text: SPLIT, expect: 'versions' },
  { id: 'nonsense', text: NONSENSE, expect: 'declined' },
  { id: 'mash', text: MASH, expect: 'declined' },
  { id: 'empty', text: EMPTY, expect: 'empty' },
  { id: 'max', text: MAX, expect: 'any' },
];
const only = process.env.POLISH_ONLY ? new Set(process.env.POLISH_ONLY.split(',')) : null;
const cases = only ? CASES.filter(c => only.has(c.id)) : CASES;
const rounds = new Set((process.env.POLISH_ROUNDS ?? (only ? 'light' : 'light,dark,narrow')).split(','));
const results = [];
const classify = words => {
  if (words.includes(DECLINED_LINE)) return 'declined';
  if (words.includes(EMPTY_LINE) || words.includes(OWN_LINE)) return 'empty';
  if (words.includes(LIMITED_LINE)) return 'limited';
  if (words.includes(READY_LINE) || words.includes('shorter')) return 'versions';
  return 'unclear';
};
const runCase = async (testCase, tag, prefix) => {
  // Type the short cases like a person does (a text-change event, the working proof path); keep the
  // huge max case prefilled, since 9 KB cannot be typed through adb.
  const typeIt = testCase.text.length > 0 && testCase.text.length <= 300;
  current = typeIt ? '' : testCase.text;
  const url = `http://127.0.0.1:${page.address().port}/${testCase.id}`;
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url);
  await wait(3000);
  await dismissChromeFirstRun();
  await waitText('message lab', 20);
  const box = find(n => n.editable && !n.password);
  if (!box) throw new Error(`The lab message box is not editable: ${screenWords()}`);
  tap(Math.round(center(box)[0]), Math.round(center(box)[1])); await wait(700);
  if (typeIt) { type(testCase.text); await wait(1800); }
  tapBubble();
  // The panel header is enough to stop waiting: an unexpected state is still captured and judged below.
  await waitText(['polish your post', 'polish your message', DECLINED_LINE, EMPTY_LINE, OWN_LINE, LIMITED_LINE, 'pick one to use instead'], 60);
  for (let i = 0; i < 60 && findText('Writing…'); i++) await wait(1000); // let the writer finish before judging
  await wait(1800);
  const panel = nodes();
  const words = panel.map(n => n.text || n.label).filter(Boolean).join('\n');
  const cards = panel.filter(n => (n.text || '').trim().length > 12 && n.text.trim() !== testCase.text.trim()).map(n => n.text.trim());
  const seen = classify(words);
  const autoclave = /\bautoclave\b/i.test(words);
  const keep = /\bautosave\b/i.test(words);
  writeFileSync(resolve(out, `${prefix}-${testCase.id}-panel.json`), JSON.stringify(panel, null, 1));
  snap(`${prefix}-${testCase.id}`);
  const fallback = /this phone wrote these/i.test(words);
  // Draft bodies only: panel chrome, headings and the input itself are never a suggestion.
  const PANEL_CHROME = new Set(['polish your post', 'polish your message', 'pick one to use instead of what you wrote', 'pick one to use instead of what you wrote. you send it yourself.', 'you send it yourself.', 'this phone wrote these.', 'write new ones', 'check these', 'fix', 'why?', 'use this', 'copy', 'edit', 'share this text', 'yours', 'cleaned up', 'shorter', 'main point first']);
  const drafts = panel.map(n => (n.text || '').trim()).filter(text => text.length > 12 && text.toLowerCase() !== testCase.text.trim().toLowerCase() && !PANEL_CHROME.has(text.toLowerCase()) && !/^[A-Z0-9 .,'’:-]+$/.test(text));
  const row = { case: testCase.id, tag, expect: testCase.expect, seen, autoclave, keep, cards: cards.length, drafts: drafts.length, fallback };
  results.push(row);
  log(`case ${testCase.id} ${tag}: seen=${seen} expect=${testCase.expect} autoclave=${autoclave} keepAutosave=${keep} cards=${cards.length} drafts=${drafts.length} fallback=${fallback}`);
  const ok = testCase.expect === 'any' ? seen !== 'unclear' : seen === testCase.expect;
  if (!ok) throw new Error(`case ${testCase.id} ${tag}: saw ${seen}, expected ${testCase.expect} (${words.replaceAll('\n', ' | ').slice(0, 240)})`);
  // A decline keeps a repeat fix (banana banana) but offers no spelling guess: for mash those are made-up words.
  const guesses = testCase.id === 'mash' ? ['and', 'ewer', 'xxv'].filter(guess => panel.some(n => (n.text || '').trim() === guess)) : [];
  if (seen === 'declined' && guesses.length) throw new Error(`case ${testCase.id} ${tag}: the decline still offered spelling guesses (${guesses.join(', ')})`);
  if (testCase.id === 'autosave' && autoclave) throw new Error(`case autosave ${tag}: the panel offered the wrong word autoclave`);
  if (testCase.id === 'autosave' && !keep) throw new Error(`case autosave ${tag}: autosave did not survive the polish`);
  // Provenance: the canned phone stub's fixed text must never stand in for the cloud writer's answer.
  const stubLeak = drafts.find(text => STUB_TEXTS.includes(text));
  if (stubLeak) throw new Error(`case ${testCase.id} ${tag}: the phone stub's fixed text appeared (${stubLeak.slice(0, 80)})`);
  // Sentence-split capital: a full stop the rewrite introduced must be followed by a capital.
  if (testCase.id === 'autosave') {
    const split = drafts.find(text => /[.!?]\s+\p{Ll}/u.test(text) && !/\b(?:p|e|i|etc)\.\s/u.test(text));
    if (split) throw new Error(`case autosave ${tag}: a sentence split lost its capital (${split.slice(0, 100)})`);
  }
  // The split capital needs a real split to check: the run-on input has no stops, so a draft with a
  // stop followed by more words is a writer-introduced sentence split. No split offered = the
  // casing at the split is not observable and the case fails honestly rather than passing vacuous.
  if (testCase.id === 'split') {
    const split = drafts.filter(text => /[.!?]\s+\S/.test(text));
    if (!split.length) throw new Error(`case split ${tag}: the writer split no sentence, so the casing at the split is not observable`);
    const bad = split.filter(text => /[.!?]\s+\p{Ll}/u.test(text));
    if (bad.length) throw new Error(`case split ${tag}: a sentence split lost its capital (${bad[0].slice(0, 120)})`);
    log(`case split ${tag}: ${split.length} draft(s) split the run-on, capitals kept`);
  }
  adb('shell', 'input', 'keyevent', '4'); // dismiss the panel (no keyboard is up)
  await wait(1200);
};

const priorNight = adb('shell', 'cmd', 'uimode', 'night').trim().replace('Night mode: ', '');
const priorServices = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
const priorAccessibility = adb('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim();
const priorFont = adb('shell', 'settings', 'get', 'system', 'font_scale').trim();
let failed = 0;
const run = async (name, fn) => { log(`-- ${name}`); try { await fn(); } catch (e) { failed++; log(`FAILED ${name}: ${String((e && e.message) || e).slice(0, 260)}`); } };

try {
  page = await servePage();
  execFileSync('adb', ['-s', serial, 'reverse', `tcp:${page.address().port}`, `tcp:${page.address().port}`]);
  adb('shell', 'cmd', 'uimode', 'night', 'custom_schedule', '-o', 'off');
  adb('shell', 'cmd', 'uimode', 'night', 'no');
  await run('light-setup', async () => { await fresh(); await theme(false); await skipSetup(); await enableChrome(); await enableTypingCheck(); });
  await run('light-writer-list', async () => { await captureWriterList('light'); });
  await run('light-connect', async () => { await connectWriter('light'); });
  for (const testCase of cases) await run(`light-${testCase.id}`, () => runCase(testCase, 'light', 'light'));

  if (rounds.has('dark')) {
    await run('dark-setup', async () => { await theme(true); });
    for (const testCase of cases) await run(`dark-${testCase.id}`, () => runCase(testCase, 'dark', 'dark'));
  }
  if (rounds.has('narrow')) {
    // Narrow phone at font scale 1.3: the case set on a smaller screen, no clipping.
    await run('narrow-setup', async () => { adb('shell', 'wm', 'size', '720x1280'); adb('shell', 'settings', 'put', 'system', 'font_scale', '1.3'); await theme(false); });
    for (const testCase of cases) await run(`narrow-${testCase.id}`, () => runCase(testCase, 'narrow', 'narrow'));
  }

  writeFileSync(resolve(out, 'coverage.json'), JSON.stringify(results, null, 2));
  if (failed) throw new Error(`${failed} scenario(s) failed`);
  log(`polish-sheet proof saved to ${out}.`);
} finally {
  adb('shell', 'wm', 'size', 'reset');
  adb('shell', 'settings', 'put', 'system', 'font_scale', priorFont || '1.0');
  if (page) { try { execFileSync('adb', ['-s', serial, 'reverse', '--remove', `tcp:${page.address().port}`]); } catch { /* best-effort */ } page.close(); }
  adb('shell', 'cmd', 'uimode', 'night', priorNight || 'no');
  for (const [v, k] of [[priorServices, 'enabled_accessibility_services'], [priorAccessibility, 'accessibility_enabled']]) {
    try { adb('shell', 'settings', v === 'null' ? 'delete' : 'put', 'secure', k, ...(v === 'null' ? [] : [v])); } catch { /* best-effort restore */ }
  }
}

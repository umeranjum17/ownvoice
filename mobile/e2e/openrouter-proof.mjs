// OpenRouter writer live proof (real DeepSeek V4.1 Flash through Ownvoice, no stand-ins).
// Build with EXPO_PUBLIC_E2E_GPT=1 EXPO_PUBLIC_E2E_STUB=1 (the ChatGPT stand-in and phone stub; the
// OpenRouter key route still reaches the real OpenRouter API). Drives a release APK on a throwaway
// emulator. OpenRouter is added the way a person adds it now: not in first-run setup, but from the
// writer list (How Ownvoice writes, /source). The proof walks: finish setup with no writer (hardware
// Back), open the writer list, tap the "With your OpenRouter" card, paste the key from
// OPENROUTER_KEY_FILE (~/.config/openrouter/api_key by default; never printed, logged, committed or
// screenshotted) into the kit's own field, connect, then type a real reply into a Chrome text field
// and tap the bubble for a real DeepSeek polish panel (with a Shorter rewrite), light and dark.
// It also exercises the two cloud-availability gaps left open by the writer delivery:
//   B. compare the displayed OpenRouter result with the ChatGPT stand-in control. This is only a
//      string comparison: without a successful-response-to-panel binding it does not prove provenance.
//   A. an optional third APK built with EXPO_PUBLIC_E2E_OPENROUTER_OFF=1 (an injected capability
//      counterfactual, never a release build) shows no OpenRouter card in How Ownvoice writes and no
//      OpenRouter action on Home — captured at phone width, font 1.3, on a no-phone emulator, light and dark.
// `OPENROUTER_SCENARIOS=negative` runs only the credit-free refusal legs (the cloud choice + stand-in
// control + the unavailable-route counterfactual), so an empty account is proven without a paid call.
// `OPENROUTER_REFUSAL=1` runs only the refusal panel legs (the cloud choice + its Try again retry,
// light and dark) on any build: a key the provider refuses must show the cloud writer's own plain
// line with a retry, never the phone's own error and never the demo stand-in's text. On a stub
// build the phone stub would write instead, so this leg needs a build without EXPO_PUBLIC_E2E_STUB.
// Env: ANDROID_SERIAL, OWNVOICE_AVD_NAME, OPENROUTER_KEY_FILE, JAVA_HOME, ANDROID_HOME, OPENROUTER_SCENARIOS, OPENROUTER_REFUSAL.
// Args: <apk> <out-dir> [unavailable-apk].
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { accessibilityProbe, center, emulatorName } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL;
if (!/^emulator-\d+$/.test(serial ?? '')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const avd = process.env.OWNVOICE_AVD_NAME;
if (!avd || emulatorName(serial) !== avd) throw new Error(`Refusing ${serial}: AVD ${emulatorName(serial)} is not ${avd}.`);
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = resolve(process.argv[3] ?? 'e2e/artifacts/openrouter');
mkdirSync(out, { recursive: true });
// Optional APK built with EXPO_PUBLIC_E2E_OPENROUTER_OFF=1 (the injected capability counterfactual):
// the unavailable-route scenario runs against it instead of the ready/fixture build above.
const unavailableApk = process.argv[4];
// Credit-free negative scope (`OPENROUTER_SCENARIOS=negative`): prove the refusal paths — the cloud
// key writer's own refusal when the account cannot serve, that the demo stand-in's fixed text never
// appears as its result, and the injected unavailable-route counterfactual — with no paid generation.
// The default (full) journey still needs a funded account for a real draft comparison.
const negative = process.env.OPENROUTER_SCENARIOS === 'negative';
const pickScenario = process.env.OPENROUTER_SCENARIOS === 'pick';
// The refusal panel legs only (any build without the phone stub): a refused key must show the
// cloud writer's own plain line with a retry, light and dark, and the retry must re-run it.
const refusal = process.env.OPENROUTER_REFUSAL === '1';
const key = readFileSync(process.env.OPENROUTER_KEY_FILE ?? `${process.env.HOME}/.config/openrouter/api_key`, 'utf8').trim();
if (!key.startsWith('sk-')) throw new Error('OpenRouter key file did not look like a key.');
const REPLY = 'i think we should meet tomorrow at 10 to go over the plan and the budget';

const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;
const nodes = accessibilityProbe(serial, out);
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = line => { const s = `${new Date().toISOString().slice(11, 19)} ${line}`; console.log(s); appendFileSync(resolve(out, 'openrouter-run.log'), s + '\n'); };
const snap = name => {
  adb('shell', 'screencap', '-p', `/sdcard/${name}.png`);
  execFileSync('adb', ['-s', serial, 'pull', `/sdcard/${name}.png`, resolve(out, `${name}.png`)], { stdio: 'inherit' });
};
const [width, height] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
const tap = (x, y) => adb('shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y)));
// One word per input-text call: a single call loses everything after its second space
// under Gboard's composing session, while one word per call lands reliably.
const type = async text => { for (const word of text.split(' ').map(w => w.replaceAll(' ', '%s'))) { adb('shell', 'input', 'text', word); await wait(700); } };

const find = pred => nodes().find(pred);
const findText = label => find(n => `${n.label} ${n.text}`.toLowerCase().includes(label.toLowerCase()));
const screenWords = () => nodes().map(n => n.text || n.label).filter(Boolean).join(' | ').slice(0, 260);
const waitText = async (label, tries = 40) => {
  const wanted = Array.isArray(label) ? label : [label];
  for (let i = 0; i < tries; i++) { const n = wanted.map(findText).find(Boolean); if (n) return n; await wait(1000); }
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
// Setup is finished with no writer: hardware Back on the welcome completes it (the person can choose later).
const skipSetup = async () => { await waitText('sound like you', 30); adb('shell', 'input', 'keyevent', '4'); await wait(2500); await homeRows(); };
// Home's lower rows can sit below the narrow viewport after setup or returning from Apps.
const homeRows = async () => {
  adb('shell', 'input', 'swipe', String(width / 2), String(height * .7), String(width / 2), String(height * .3), '300');
  await wait(1200);
  await waitText('where the bubble shows', 30);
};
const openSource = async () => { adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source', pkg); await waitText('with your openrouter', 30); };
const revealOpenRouter = async () => {
  for (let i = 0; i < 5 && !findText('with your openrouter'); i++) {
    adb('shell', 'input', 'swipe', String(width / 2), String(height * .7), String(width / 2), String(height * .3), '300');
    await wait(1200);
  }
};

// Enable Chrome for the bubble through the app's own list, like a person would.
const findRowWithState = (label, state) => find(n => n.checkable && n.label === label && n.checked === (state === 'On'));
const enableChrome = async () => {
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://apps', pkg);
  await waitText('find an app', 30);
  await tapText('find an app');
  await type('Chrome');
  await wait(500);
  adb('shell', 'input', 'keyevent', '4'); // Hide the keyboard before tapping the filtered row.
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
  await wait(1500);
  await homeRows();
};

// The writer list: OpenRouter card present (the kit reports its key route ready), then connect with the key.
const captureWriterList = async tag => {
  await openSource();
  await revealOpenRouter();
  const card = findText('with your openrouter');
  if (!card) throw new Error('The writer list does not offer OpenRouter: the kit did not report its key route ready.');
  snap(`writer-list-${tag}`);
  await wait(500);
  return card;
};
// Right after the key connects the app asks which one writes: search the account's own list for PICK_MODEL (an explicit
// model id, never openrouter/auto; a live run uses a :free id) and tap that row, as a person would.
const PICK_MODEL = process.env.PICK_MODEL;
// PICK_BEFORE=1 runs the pick scenario on a build from before the list existed: no pick screen to walk.
const pickBefore = process.env.PICK_BEFORE === '1';
const pickModel = async tag => {
  if (!PICK_MODEL || /^openrouter\/auto$/.test(PICK_MODEL)) throw new Error('Set PICK_MODEL to the explicit model id to pick from the list.');
  await waitText('search the list', 90); // the list is read from the account, so it can take a moment
  snap(`pick-list-${tag}`);
  const field = find(n => (n.label || '').toLowerCase().includes('search the list'));
  if (!field) throw new Error('The model search field did not open.');
  tap(...center(field)); await wait(700);
  adb('shell', 'input', 'text', `'${PICK_MODEL.replace(/ /g, '%s')}'`); await wait(900);
  if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) { adb('shell', 'input', 'keyevent', '4'); await wait(900); }
  snap(`pick-search-${tag}`);
  await tapText(PICK_MODEL.toLowerCase(), 20);
  await wait(1200);
};
const connectOpenRouter = async (tag, { pick = true } = {}) => {
  const card = await captureWriterList(tag);
  tap(...center(card));
  await waitText('paste your openrouter key', 30); // The kit's own key field, inside the card.
  const field = find(n => (n.label || '').toLowerCase().includes('paste your openrouter key'));
  if (!field) throw new Error('The OpenRouter key field did not open.');
  tap(...center(field)); await wait(700);
  adb('shell', 'input', 'text', `'${key}'`); await wait(700); // never logged or screenshotted
  if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) { adb('shell', 'input', 'keyevent', '4'); await wait(900); } // hide the keyboard so Connect is visible
  await tapText('connect', 20);
  if (pick) {
    await pickModel(tag);
    await waitText('openrouter is connected', 60);
  } else if (!pickBefore) {
    // Left unpicked on purpose: the list shows, then Back leaves it, and the card says nothing is chosen yet.
    await waitText('search the list', 90);
    snap(`pick-list-${tag}`);
    adb('shell', 'input', 'keyevent', '4'); await wait(1500);
    await waitText('openrouter is connected', 60);
  } else await waitText('openrouter is connected', 60);
  snap(`connected-${tag}`);
  log(`OpenRouter connected (${tag})`);
};

// A draft through whichever writer is chosen, in a Chrome text field, captured light and dark.
const servePage = () => {
  const server = createServer((_request, response) => response.end(readFileSync(new URL('./page.html', import.meta.url))));
  return new Promise(resolvePort => server.listen(0, '127.0.0.1', () => resolvePort(server)));
};
let page = null;
// A fresh Chrome shows first-run sheets in order (welcome "Accept & continue", then the sign-in
// promo "No thanks"/"Use without an account"); clear whichever is in front until the page shows.
// At the largest font a sheet's button can sit below the fold, so scroll when nothing matches.
const dismissChromeFirstRun = async () => {
  for (let i = 0; i < 12; i++) {
    if (findText('textarea')) return;
    const n = ['accept & continue', 'without an account', 'no thanks', 'no thank you', 'got it']
      .map(findText).find(Boolean);
    if (!n) {
      if (i % 3 === 2) { adb('shell', 'input', 'swipe', String(width / 2), String(height * .7), String(width / 2), String(height * .3), '300'); await wait(1200); }
      else await wait(1000);
      continue;
    }
    tap(...center(n)); await wait(1500);
  }
};
// Type the reply into the page, tap the bubble, and return the ready panel's accessible nodes.
const openPanelOnce = async tag => {
  if (!page) { page = await servePage(); execFileSync('adb', ['-s', serial, 'reverse', `tcp:${page.address().port}`, `tcp:${page.address().port}`]); }
  const url = `http://127.0.0.1:${page.address().port}`;
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url); await wait(3500);
  await dismissChromeFirstRun();
  const heading = await waitText('textarea', 20);
  tap(Math.round(width / 2), Math.round(center(heading)[1] + 230)); // the field is borderless, under its heading
  await wait(700);
  await type(REPLY);
  await wait(4500);
  tapBubble();
  await waitText(['polish your message', 'polish your post'], 45); // the title shows while the writer works
  // The ready subtitle only appears once the drafts land; the cloud call can be slow.
  await waitText('pick one to use instead of what you wrote', 150);
  await wait(1200);
  const panel = nodes();
  snap(`polish-${tag}`);
  return panel;
};
// One flaky panel (a slow cloud call, or a Chrome sheet) must not fail the run: retry the whole open
// at most three times, re-toggling the service first in case its binding dropped.
const openPanel = async tag => {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await openPanelOnce(tag); }
    catch (e) {
      last = e;
      log(`panel(${tag}) attempt ${attempt} did not open: ${String((e && e.message) || e).slice(0, 140)}`);
      adb('shell', 'input', 'keyevent', '4'); await wait(1500);
      await setService(true); await wait(1500);
    }
  }
  throw last;
};
// Static panel text (title, instruction, card headings) is never a draft body: excluded so shared
// chrome can never look like a stand-in leak. Headings render all-caps; the rest are exact strings.
const PANEL_CHROME = new Set(['polish your post', 'polish your message', 'pick one to use instead of what you wrote', 'pick one to use instead of what you wrote. you send it yourself.', 'you send it yourself.']);
const draftsFrom = panel => panel
  .map(n => (n.text || '').trim())
  .filter(text => text.length > 12
    && text.toLowerCase() !== REPLY
    && !PANEL_CHROME.has(text.toLowerCase())
    && !/^[A-Z0-9 .,'’:-]+$/.test(text));
// A real draft through the chosen cloud key writer; returns the drafts so provenance can be checked.
const realDraft = async tag => {
  const panel = await openPanel(tag);
  const shorter = panel.find(n => n.text.trim().toUpperCase() === 'SHORTER');
  if (!shorter) throw new Error(`The polish panel showed no Shorter rewrite (${panel.map(n => n.text).filter(Boolean).join(' | ').slice(0, 200)}).`);
  const drafts = draftsFrom(panel);
  if (!drafts.length) throw new Error('The polish panel showed no real model versions.');
  log(`real DeepSeek polish panel captured (${tag})`);
  return drafts;
};
// The fixed text the ChatGPT stand-in supplies for the same typed reply.
const fixturePanel = async tag => {
  const panel = await openPanel(tag);
  const drafts = draftsFrom(panel);
  if (!drafts.length) throw new Error('The fixture panel showed no versions.');
  log(`fixture GPT stand-in panel captured (${tag}): ${JSON.stringify(drafts).slice(0, 200)}`);
  return drafts;
};
// Select the fixture's ChatGPT stand-in (offline mock sign-in, no key): signed out, so no switch sheet.
const chooseChatGptFixture = async () => {
  await openSource();
  await tapText('with your chatgpt');
  await waitText('chatgpt is connected', 45);
};

// Gap B: with the fixture GPT stand-in active, the cloud key writer must not return its canned text.
const fixtureComparison = async real => {
  await chooseChatGptFixture();
  const fixture = await fixturePanel('fixture-control');
  const overlap = real.filter(text => fixture.includes(text));
  log(`fixture comparison only; provenance unproven: overlap=${overlap.length > 0}; cloud-choice ${JSON.stringify(real).slice(0, 100)}; demo ${JSON.stringify(fixture).slice(0, 100)}`);
};
// A tolerant setup finisher for the repeated unavailable-route passes (setup may already be done).
const finishSetupIfNeeded = async () => {
  try { await waitText('sound like you', 12); adb('shell', 'input', 'keyevent', '4'); await wait(2500); } catch { /* already set up */ }
  await waitText(['where the bubble shows', 'how ownvoice writes'], 30);
};
const openSourceWait = async () => { adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source', pkg); await waitText('how ownvoice writes', 30); };
// Seed the stored writer choice in the kv-store (app stopped first), then rebind the service.
const seedSource = async value => {
  adb('shell', 'am', 'force-stop', pkg); await wait(1000);
  const db = '/data/data/dev.ownvoice.next/files/SQLite/ExpoSQLiteStorage';
  const sql = `INSERT OR REPLACE INTO storage(key,value) VALUES('writer-source',char(34)||'${value}'||char(34));`;
  try { adb('shell', 'su', '0', 'sqlite3', db, `"${sql}"`); }
  catch { adb('root'); await wait(1500); adb('shell', 'sqlite3', db, `"${sql}"`); }
  await setService(true);
};
// Gap A: on a build whose kit key route is not ready, no OpenRouter card and no Home action, at
// phone width, font 1.3, on this no-phone emulator, light and dark.
const unavailableRoute = async () => {
  execFileSync('adb', ['-s', serial, 'install', '-r', unavailableApk], { stdio: 'inherit' });
  adb('shell', 'pm', 'clear', pkg);
  await setService(true);
  // The writer list, both themes, with no stored OpenRouter choice (the card is gated by readiness alone).
  for (const dark of [false, true]) {
    const T = dark ? 'dark' : 'light';
    await theme(dark);
    await finishSetupIfNeeded();
    await openSourceWait();
    if (findText('with your openrouter')) throw new Error(`The ${T} writer list offers an OpenRouter card when the key route is not ready.`);
    snap(`unavailable-writer-list-${T}`);
    // The same screen at font 1.3: the refusal rendering must not clip and must not show the card.
    adb('shell', 'settings', 'put', 'system', 'font_scale', '1.3');
    adb('shell', 'am', 'force-stop', pkg); await wait(1200); await setService(true);
    await openSourceWait();
    if (findText('with your openrouter')) throw new Error(`At font 1.3 the ${T} writer list offers an OpenRouter card.`);
    snap(`unavailable-writer-list-${T}-font1.3`);
    adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0');
    log(`writer list hides OpenRouter on ${T} (phone width and font 1.3)`);
  }
  // Home: even with OpenRouter as the stored choice, no usable entry is offered, both themes.
  for (const dark of [false, true]) {
    const T = dark ? 'dark' : 'light';
    await theme(dark);
    await finishSetupIfNeeded();
    await seedSource('openrouter');
    adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
    await waitText('how ownvoice writes', 20);
    if (!findText('writes with your openrouter')) throw new Error(`The seeded OpenRouter choice did not reach Home at ${T}; the Home check is inconclusive.`);
    if (findText('connect with openrouter') || findText('switch to openrouter')) {
      throw new Error(`Home offers an OpenRouter action at ${T} although its key route is not ready.`);
    }
    snap(`unavailable-home-${T}`);
    log(`Home offers no OpenRouter action on ${T} (stored choice seeded)`);
    await seedSource('phone'); // reset so the next pass starts without an OpenRouter choice
  }
};


// The ChatGPT stand-in's fixed versions for this typed reply (src/panel/stubWriter.ts), computed
// here so a leak check is exact rather than fuzzy. It emits the capitalised line plus a
// "Just to confirm" line for a comma-less reply; duplicates are dropped.
const fixtureFixed = () => {
  const lead = REPLY.charAt(0).toUpperCase() + REPLY.slice(1);
  return [...new Set([lead.endsWith('.') ? lead : `${lead}.`, `${lead.split(',')[0]}.`, `Just to confirm, ${REPLY.charAt(0).toLowerCase()}${REPLY.slice(1)}.`])];
};
// Like openPanelOnce, but a cloud refusal can show an empty-state line instead of the ready
// subtitle, so wait for the panel title and settle instead of requiring drafts to appear.
// A failing cloud call can be slow: wait for a terminal state — drafts landing (the ready
// subtitle) or the writer's failure line — instead of a fixed settle.
const waitTerminal = async (tries = 120) => {
  const terminal = ['pick one to use instead', "didn't answer", 'not connected', 'turned off', 'sign in', 'get this phone ready', 'nothing to reply', 'write a reply first', 'choose which one writes first'];
  for (let i = 0; i < tries && !terminal.some(t => findText(t)); i++) await wait(1000);
  await wait(1500); // let the failure line render
};
const openPanelAny = async tag => {
  if (!page) { page = await servePage(); execFileSync('adb', ['-s', serial, 'reverse', `tcp:${page.address().port}`, `tcp:${page.address().port}`]); }
  const url = `http://127.0.0.1:${page.address().port}`;
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url); await wait(3500);
  await dismissChromeFirstRun();
  const heading = await waitText('textarea', 20);
  tap(Math.round(width / 2), Math.round(center(heading)[1] + 230));
  await wait(700);
  await type(REPLY);
  await wait(4500);
  tapBubble();
  await waitText(['polish your message', 'polish your post'], 45);
  await waitTerminal();
  const panel = nodes();
  snap(`polish-${tag}`);
  return panel;
};
// The empty/refusing cloud writer: select OpenRouter (its key already pasted), tap the bubble, and
// capture whatever the account can return. Needs no credit — a funded account yields real drafts,
// an empty one the provider's own refusal — and either way the demo stand-in's fixed text must not
// be the OpenRouter result. The stand-in's text is confirmed separately by the fixture-control leg.
const cloudChoice = async tag => {
  const panel = await openPanelAny(tag);
  const texts = panel.map(n => (n.text || '').trim()).filter(Boolean);
  const leaked = fixtureFixed().filter(f => texts.includes(f));
  if (leaked.length) throw new Error(`The ChatGPT stand-in's fixed text was the OpenRouter result: ${JSON.stringify(leaked)}`);
  // The refusal/empty-state lines are not drafts; everything longer that is left is a real draft.
  const drafts = draftsFrom(panel).filter(t => !/couldn't polish|try again|didn't answer|turned off|sign in/i.test(t));
  const refused = !drafts.length;
  log(`OpenRouter choice (${tag}): ${refused ? 'refused (no usable draft)' : 'returned drafts'} drafts=${JSON.stringify(drafts).slice(0, 160)}; panel=${JSON.stringify(texts).slice(0, 200)}`);
  return { refused, drafts };
};
// The credit-free negative journey: the cloud choice leg, then the stand-in control that proves the
// fixture's fixed text IS produced when ChatGPT is chosen (so its absence above is meaningful).
const negativeJourney = async () => {
  await fresh(); await theme(false); await skipSetup(); await enableChrome();
  await connectOpenRouter('light');
  const cloud = await cloudChoice('cloud-choice-light');
  if (cloud.refused) log('OpenRouter produced no draft: the key writer refused (live negative recorded; no credit spent, no stand-in text)');
  await chooseChatGptFixture();
  const fixture = await fixturePanel('fixture-control');
  const expected = fixtureFixed().filter(f => fixture.includes(f));
  log(`fixture control (ChatGPT stand-in) produced ${expected.length}/${fixtureFixed().length} expected fixed lines: ${JSON.stringify(fixture).slice(0, 160)}`);
  if (!expected.length) throw new Error(`The ChatGPT stand-in control produced none of its fixed text; the leak check above is inconclusive (${JSON.stringify(fixture).slice(0, 200)}).`);
};
// The refusal panel legs (OPENROUTER_REFUSAL=1, any build without the phone stub): a key the
// provider refuses must show the cloud writer's own plain line with a retry — never the phone's
// own error, never the stand-in's text — at default and largest font, light and dark (the
// visual-guard matrix). Tapping Try again re-runs the writer and refuses the same way.
// A bad key is enough: the provider's own refusal is the real failure.
// Like finishSetupIfNeeded, but Home's lower rows can sit below the fold on builds without
// the phone stub, so scroll once before asserting setup finished.
const finishSetupScrolled = async () => {
  try { await waitText('sound like you', 30); adb('shell', 'input', 'keyevent', '4'); await wait(2500); } catch { /* already set up */ }
  adb('shell', 'input', 'swipe', String(width / 2), String(height * .7), String(width / 2), String(height * .3), '300');
  await wait(1200);
  await waitText(['where the bubble shows', 'how ownvoice writes'], 20);
};
const refusalLeg = async (T, F) => {
  const panel = await openPanelAny(`refusal-${T}${F}`);
  const texts = panel.map(n => (n.text || '').trim()).filter(Boolean);
  const leaked = fixtureFixed().filter(f => texts.includes(f));
  if (leaked.length) throw new Error(`The ChatGPT stand-in's fixed text was the OpenRouter result: ${JSON.stringify(leaked)}`);
  if (!texts.some(t => /didn't answer|not connected|turned off|sign in/i.test(t))) throw new Error(`The refusal panel showed no cloud failure line (${T}${F}): ${JSON.stringify(texts).slice(0, 220)}`);
  if (texts.some(t => /get this phone ready/i.test(t))) throw new Error(`The refusal panel masked the cloud failure with the phone's error (${T}${F}).`);
  await tapText('try again', 20);
  await waitTerminal(); // the writer re-runs and the provider refuses again
  const retry = nodes();
  snap(`refusal-retry-${T}${F}`);
  const retryTexts = retry.map(n => (n.text || '').trim()).filter(Boolean);
  if (!retryTexts.some(t => /didn't answer|not connected|turned off|sign in/i.test(t))) throw new Error(`The retried panel showed no cloud failure line (${T}${F}): ${JSON.stringify(retryTexts).slice(0, 220)}`);
  log(`refusal + retry captured (${T}${F})`);
};
const refusalJourney = async () => {
  await fresh(); await theme(false); await finishSetupScrolled(); await enableChrome();
  await connectOpenRouter('light');
  for (const font of ['1.0', '1.3']) {
    const F = font === '1.0' ? '' : '-font1.3';
    if (F) {
      adb('shell', 'settings', 'put', 'system', 'font_scale', font);
      adb('shell', 'am', 'force-stop', pkg); await wait(1200); await setService(true);
    }
    for (const dark of [false, true]) {
      const T = dark ? 'dark' : 'light';
      if (dark) await theme(true);
      // Each matrix cell runs even when an earlier one failed, so a before/after pair
      // captures every cell; the run log keeps one FAILED line per failing cell.
      await run(`refusal-${T}${F}`, async () => refusalLeg(T, F));
    }
    if (F) {
      adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0');
      adb('shell', 'am', 'force-stop', pkg); await wait(1200); await setService(true);
    }
  }
};

// The pick scenario (OPENROUTER_SCENARIOS=pick): each changed screen in light, dark and font 1.3. With PICK_BEFORE=1 it
// captures the same screens on the build from before the list, for the before/after pair.
const pickScreens = async (T, F) => {
  await openSourceWait(); await revealOpenRouter();
  snap(`source-${T}${F}`);
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`); await wait(2500);
  await waitText('how ownvoice writes', 30);
  snap(`home-${T}${F}`);
};
const withFont = async (font, fn) => {
  adb('shell', 'settings', 'put', 'system', 'font_scale', font);
  adb('shell', 'am', 'force-stop', pkg); await wait(1200); await setService(true);
  try { await fn(); } finally { adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0'); adb('shell', 'am', 'force-stop', pkg); await wait(1200); await setService(true); }
};
const pickJourney = async () => {
  await fresh(); await theme(false); await skipSetup(); await enableChrome();
  // 1. Connected but nothing picked: the card, Home and the panel ask (after only; before there is nothing to ask).
  await connectOpenRouter('light', { pick: false });
  await pickScreens('light', '');
  if (!pickBefore) {
    await run('panel-asks', async () => { const panel = await openPanelAny('panel-asks-light'); if (!panel.map(n => n.text).join(' ').toLowerCase().includes('choose which one writes first')) throw new Error('The panel did not ask which one writes.'); });
  }
  // 2. Picked from the list (after): the pick list in each look, then the card, Home and a real panel.
  if (!pickBefore) {
    for (const [T, F, dark, font] of [['light', '', false, '1.0'], ['dark', '', true, '1.0'], ['light', '-font1.3', false, '1.3'], ['dark', '-font1.3', true, '1.3']]) {
      await run(`pick-${T}${F}`, async () => {
        await theme(dark);
        await withFont(font, async () => {
          adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://model?account=openrouter', pkg);
          await waitText('search the list', 90);
          snap(`pick-list-${T}${F}`);
        });
      });
    }
    await theme(false);
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://model?account=openrouter', pkg);
    await pickModel('final');
    await waitText('openrouter is connected', 60);
  }
  for (const [T, F, dark, font] of [['dark', '', true, '1.0'], ['light', '-font1.3', false, '1.3']]) {
    await run(`screens-${T}${F}`, async () => { await theme(dark); await withFont(font, () => pickScreens(`${T}-picked`, F)); });
  }
  await theme(false);
  if (!pickBefore) await run('panel-picked', async () => { await realDraft('picked-light'); });
};

const priorNight = adb('shell', 'cmd', 'uimode', 'night').trim().replace('Night mode: ', '');
const priorServices = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
const priorAccessibility = adb('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim();
const priorFont = adb('shell', 'settings', 'get', 'system', 'font_scale').trim();
let failed = 0;
const run = async (name, fn) => { log(`-- ${name}`); try { await fn(); } catch (e) { failed++; log(`FAILED ${name}: ${String((e && e.message) || e).slice(0, 220)}`); } };

try {
  adb('shell', 'cmd', 'uimode', 'night', 'custom_schedule', '-o', 'off');
  adb('shell', 'cmd', 'uimode', 'night', 'no');
  let realDrafts = [];
  // Capture the displayed result. A different string is only an observation, not source provenance.
  const captureReal = async tag => realDraft(tag);
  if (pickScenario) {
    await run('pick', pickJourney);
  } else if (refusal) {
    await run('refusal-panels', refusalJourney);
  } else if (negative) {
    await run('negative-cloud-choice', negativeJourney);
  } else {
    await run('light-setup', async () => { await fresh(); await theme(false); await skipSetup(); await enableChrome(); });
    await run('light-writer-list', async () => { await captureWriterList('light'); });
    await run('light-connect', async () => { await connectOpenRouter('light'); });
    await run('light-draft', async () => { realDrafts = realDrafts.concat(await captureReal('light')); });

    await run('dark-writer-list', async () => { await theme(true); await captureWriterList('dark'); });
    await run('dark-draft', async () => { realDrafts = realDrafts.concat(await captureReal('dark')); });

    await run('fixture-comparison', async () => { if (!realDrafts.length) throw new Error('No cloud-choice drafts to compare (both draft scenarios failed).'); await fixtureComparison(realDrafts); });
  }
  if (unavailableApk) await run('unavailable-route', unavailableRoute);

  if (failed) throw new Error(`${failed} scenario(s) failed`);
  log(`openrouter proof saved to ${out}.`);
} finally {
  if (page) { try { execFileSync('adb', ['-s', serial, 'reverse', '--remove', `tcp:${page.address().port}`]); } catch { /* best-effort */ } page.close(); }
  adb('shell', 'cmd', 'uimode', 'night', priorNight || 'no');
  try { adb('shell', 'settings', 'put', 'system', 'font_scale', priorFont || '1.0'); } catch { /* best-effort restore */ }
  for (const [v, k] of [[priorServices, 'enabled_accessibility_services'], [priorAccessibility, 'accessibility_enabled']]) {
    try { adb('shell', 'settings', v === 'null' ? 'delete' : 'put', 'secure', k, ...(v === 'null' ? [] : [v])); } catch { /* best-effort restore */ }
  }
}

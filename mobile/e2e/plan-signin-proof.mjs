// Plan chooser sign-in proof (PR 156): EXPO_PUBLIC_E2E_STUB=1 EXPO_PUBLIC_E2E_DOWNLOAD=1
// EXPO_PUBLIC_E2E_AUTH_BASE=http://10.0.2.2:<port>; ChatGPT via host stand-in, Claude hits its real page. Args: <apk> <out> [only].
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mockOpenAI } from '@byokit/accounts/testing';

const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const avd = (process.env.OWNVOICE_AVD_NAME ?? '').trim();
if (!avd) throw new Error('Set OWNVOICE_AVD_NAME to your own AVD name.');
const apk = process.argv[2];
if (!apk) throw new Error('Pass the release APK path.');
const out = resolve(process.argv[3] ?? 'e2e/artifacts');
const only = (process.argv[4] ?? '').split(',').filter(Boolean);
mkdirSync(out, { recursive: true });
const port = Number(process.env.MOCK_PORT ?? 21455);
const pkg = 'dev.ownvoice.next';
const component = `${pkg}/dev.ownvoice.bridge.OwnvoiceService`;

const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = line => { const s = `${new Date().toISOString().slice(11, 19)} ${line}`; console.log(s); appendFileSync(resolve(out, 'plan-run.log'), s + '\n'); };
if (adb('shell', 'getprop', 'ro.boot.qemu.avd_name').trim() !== avd) throw new Error(`Serial ${serial} is not the owned AVD ${avd}.`);
const [width, height] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
const tap = (x, y) => adb('shell', 'input', 'tap', String(x), String(y));
const snap = () => execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 12 * 1024 * 1024 });
const shot = name => writeFileSync(resolve(out, `${name}.png`), snap());
const ocr = (image, dy = 0, psm) => {
  const tsv = execFileSync('tesseract', ['stdin', 'stdout', ...(psm ? ['--psm', psm] : []), 'tsv'], { input: image, encoding: 'utf8' });
  const lines = new Map();
  for (const row of tsv.split('\n').slice(1)) {
    const c = row.split('\t');
    if (c.length < 12 || !c[11].trim()) continue;
    const line = lines.get(c.slice(0, 5).join(':')) ?? { words: [], left: Infinity, top: Infinity, right: 0, bottom: 0 };
    line.words.push(c[11]);
    line.left = Math.min(line.left, +c[6]); line.top = Math.min(line.top, +c[7] + dy);
    line.right = Math.max(line.right, +c[6] + +c[8]); line.bottom = Math.max(line.bottom, +c[7] + +c[9] + dy);
    lines.set(c.slice(0, 5).join(':'), line);
  }
  return [...lines.values()];
};
const screenText = () => ocr(snap()).map(l => l.words.join(' ')).join(' ').toLowerCase();
const waitForAbsent = async (label, tries = 30) => {
  for (let i = 0; i < tries; i++) {
    if (!screenText().includes(label.toLowerCase())) return;
    if (i < tries - 1) await wait(1000);
  }
  throw new Error(`"${label}" never left the screen.`);
};
const waitForLine = async (labels, tries = 30) => {
  const wanted = (Array.isArray(labels) ? labels : [labels]).map(l => l.toLowerCase());
  let seen = '';
  for (let i = 0; i < tries; i++) {
    seen = screenText();
    if (wanted.some(w => seen.includes(w))) return;
    if (i % 10 === 9) log(`still waiting for "${wanted.join('" or "')}" (${i + 1}/${tries})`);
    if (i < tries - 1) await wait(1000);
  }
  throw new Error(`Could not see "${wanted.join('" or "')}" on screen. On screen: ${seen.slice(0, 160)}`);
};
const tapText = async label => {
  const want = label.toLowerCase();
  for (let attempt = 0; attempt < 10; attempt++) {
    const image = snap();
    for (const top of [0, ...Array.from({ length: Math.ceil(height / 75) }, (_, i) => i * 75)].reverse()) {
      const crop = top ? execFileSync('magick', ['png:', '-crop', `${width}x150+0+${top}`, '+repage', 'png:-'], { input: image }) : image;
      const band = ocr(crop, top, top ? '7' : undefined);
      const line = band.find(l => l.words.join(' ').toLowerCase().includes(want));
      if (line) { tap(Math.round((line.left + line.right) / 2), Math.round((line.top + line.bottom) / 2)); return; }
      const rawLine = ocr(crop, top, '13').find(l => l.words.join(' ').toLowerCase().includes(want));
      if (rawLine) { tap(Math.round((rawLine.left + rawLine.right) / 2), Math.round((rawLine.top + rawLine.bottom) / 2)); return; }
    }
    await wait(1000);
  }
  throw new Error(`Could not find visible ${label}.`);
};
const record = async (name, fn, limit = 120) => {
  const device = `/data/local/tmp/${name}.mp4`;
  const proc = spawn('adb', ['-s', serial, 'shell', 'screenrecord', '--time-limit', String(limit), device]);
  let err;
  try { await fn(); } catch (e) { err = e; }
  try { adb('shell', 'pkill', '-2', 'screenrecord'); } catch {}
  await Promise.race([new Promise(r => proc.on('exit', r)), wait(15000)]);
  proc.kill();
  try { execFileSync('adb', ['-s', serial, 'pull', device, resolve(out, `${name}.mp4`)], { stdio: 'inherit' }); } catch (e) { if (!err) err = e; }
  adb('shell', 'rm', '-f', device); if (err) throw err;
};
// Android rebinds only on a settings change: toggle after every install/clear/force-stop, then check the bound list.
const setService = async on => {
  const put = want => {
    const e = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim();
    const s = new Set(e === 'null' ? [] : e.split(':'));
    want ? s.add(component) : s.delete(component);
    adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...s].join(':') || 'com.example.disabled/NoService');
  };
  put(false);
  if (!on) return;
  await wait(1500);
  put(true);
  adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
  for (let i = 0; i < 45 && !adb('shell', 'dumpsys', 'accessibility').includes(component); i++) await wait(1000); // Cold boots bind slowly.
  if (!adb('shell', 'dumpsys', 'accessibility').includes(component)) throw new Error('Accessibility service did not bind after re-enable.');
};
const fresh = async () => {
  execFileSync('adb', ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' }); adb('shell', 'pm', 'clear', pkg); await setService(true);
};
const cleanOff = async () => { adb('shell', 'am', 'force-stop', pkg); await setService(false); await wait(1500); };
const theme = async dark => {
  adb('shell', 'cmd', 'uimode', 'night', dark ? 'yes' : 'no');
  adb('shell', 'am', 'force-stop', pkg); await wait(1200);
  await setService(true); // A force-stop unbinds the service; Android rebinds only on a settings change.
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
};
const toChoose = async () => {
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`);
  try { await waitForLine('replies that sound', 15); } catch (e) {
    if (!screenText().includes("isn't responding")) throw e;
    await tapText('wait'); await waitForLine('replies that sound', 30); // Cold-boot ANR: let it finish loading.
  }
  await tapText('continue'); await waitForLine('how should ownvoice write');
};
const pickPlan = async name => {
  await tapText(`with your ${name}`); await tapText('continue');
  try { await waitForLine('your code', 20); } catch (e) {
    if (!screenText().includes('try again')) throw e; // Stalled start: a real user retries it.
    await tapText('try again'); await waitForLine('your code', 30);
  }
};
const code = async (mock, tag) => {
  let c;
  for (let i = 0; i < 30 && !(c = mock.lastCode()); i++) await wait(1000);
  if (tag) shot(tag); // The code screen itself, whatever issued the code.
  if (!c) throw new Error(`The app never asked the stand-in for a code. On screen: ${screenText().slice(0, 160)}`);
  return c;
};
const approve = async (mock, c) => {
  const res = await fetch(`${mock.base}/codex/device`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ user_code: c }).toString() }).then(r => r.text());
  if (!res.includes('Signed in')) throw new Error('The code page refused the approval.');
};

const mock = await mockOpenAI({ port, host: '0.0.0.0', log: line => appendFileSync(resolve(out, 'plan-mock.log'), `${new Date().toISOString().slice(11, 19)} ${line}\n`) }); log(`stand-in on ${mock.base}`);
const priorServices = adb('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim(); const priorAccessibility = adb('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim();
let failed = 0;
const run = async (name, fn) => { if (only.length && !only.includes(name)) return log(`skip ${name}`); log(`-- ${name}`);
  try { await fn(); } catch (e) { failed++; log(`FAILED ${name}: ${String((e && e.message) || e).slice(0, 160)}`); } };
try {
  for (const dark of [false, true]) { const T = dark ? 'dark' : 'light';
    await run(`s1-chooser-${T}`, async () => {
      await theme(dark); await fresh(); await record(`s1-chooser-${T}`, toChoose);
      const text = screenText(), a = text.indexOf('claude'), b = text.indexOf('chatgpt');
      if (a < 0 || b < 0 || a > b) throw new Error(`Plan order wrong on screen: ${text.slice(0, 200)}`);
      log(`chooser: Claude card before ChatGPT card (${T})`); shot(`s1-chooser-${T}`);
    });
    await run(`s3-approve-${T}`, async () => {
      await theme(dark); await fresh(); await cleanOff(); await toChoose();
      await pickPlan('chatgpt');
      const c = await code(mock, `s3-code-` + T);
      log(`chatgpt code issued: ${c}`);
      await record(`s3-approve-${T}`, async () => {
        await approve(mock, c);
        await waitForLine(['signed in to', 'will write your drafts'], 40);
      });
      log('chatgpt connected'); shot(`s3-connected-${T}`);
      await tapText('continue'); // Stores the plan; the permission step follows the choice.
      await waitForLine('let ownvoice see');
      shot(`s3-permission-${T}`); // The ChatGPT promise row shows the stored plan.
    });
    await run(`s4-backout-${T}`, async () => {
      await theme(dark); await fresh(); await toChoose();
      await pickPlan('chatgpt');
      const c = await code(mock, `s4-code-` + T);
      await record(`s4-backout-${T}`, async () => {
        if (dark) await tapText('cancel'); else adb('shell', 'input', 'keyevent', '4');
        await waitForLine('how should ownvoice write');
      });
      await approve(mock, c); await wait(6000); // A late approval after leaving must not bring the code back.
      const text = screenText();
      if (!text.includes('how should ownvoice write') || text.includes('will write your drafts')) throw new Error('Back-out did not hold.');
      log('back-out held after late approval; nothing stored'); shot(`s4-backout-${T}`);
    });
    await run(`s5-failed-${T}`, async () => {
      await theme(dark); await fresh(); await toChoose();
      await pickPlan('chatgpt');
      const c = await code(mock, `s5-code-` + T);
      await record(`s5-retry-${T}`, async () => {
        mock.approve(c, true); // The page declines: the step must explain and offer retry plus the phone.
        await waitForLine('try again', 40);
      });
      if (!screenText().includes('use this phone instead')) throw new Error('Failed sign-in offered no phone.');
      log(`failed note shown with retry + phone (${T})`); shot(`s5-failed-${T}`);
      await tapText('try again'); await waitForLine('your code');
      shot(`s5-retry-code-${T}`); await tapText('cancel');
    });
  }
  await run('s6-wrappers', async () => {
    for (const dark of [false, true]) { const T = dark ? 'dark' : 'light';
      await theme(dark); await fresh(); await toChoose();
      adb('shell', 'input', 'keyevent', '4'); await waitForLine('where the bubble shows', 30); // Back with no sign-in finishes setup storing nothing.
      adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'ownvoice://source', pkg);
      await waitForLine(['how ownvoice writes', 'choose who writes'], 20);
      shot(`s6-source-${T}`);
      for (let i = 0; i < 3; i++) { // Re-renders can swallow a press; retry on effect.
        await tapText('with your chatgpt');
        try { await waitForLine('your code', 10); break; } catch (e) { if (i === 2) throw new Error('ChatGPT sign-in never started.'); }
      }
      const c = await code(mock, `s6-code-${T}`);
      const connect = async () => { await approve(mock, c); await waitForAbsent('your code', 40); };
      if (!dark) await record('s6-wrappers-signin', connect); else await connect();
      if (/try again|something went wrong/.test(screenText())) throw new Error('Legacy wrapper sign-in failed.');
      log(`legacy wrappers signed in and connected (${T})`); shot(`s6-connected-${T}`);
    }
  });
  await run('s9-e2e', async () => {
    for (const dark of [false, true]) { const T = dark ? 'dark' : 'light';
      await theme(dark); await fresh(); await cleanOff(); await toChoose();
      await pickPlan('chatgpt');
      await approve(mock, await code(mock, `s9-code-` + T));
      await waitForLine(['signed in to', 'will write your drafts'], 40);
      await record(`s9-walk-${T}`, async () => {
        await tapText('continue');
        await waitForLine('let ownvoice see'); // Permission follows the ChatGPT choice.
        await tapText('turn on');
        let focus = '';
        for (let i = 0; i < 10 && !/settings/i.test(focus); i++) { await wait(1000); focus = adb('shell', 'dumpsys', 'window'); }
        if (!/settings/i.test(focus)) throw new Error('Turn on did not open settings.');
        await setService(false); await wait(1500); await setService(true); await wait(1500);
        await setService(false); await wait(1000); await setService(true); await wait(2500);
        await waitForLine('tap the bubble to polish it', 30);
        if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) { adb('shell', 'input', 'keyevent', '4'); await wait(1000); } // Skill: Back only when the keyboard shows.
        adb('shell', 'input', 'text', 'yes%saturday,%sI%scan%sbring%sthe%stent');
        await wait(1200);
        tap(width - Math.round(90 * width / 1080), Math.round(height * .53));
        await waitForLine('pick one to use instead of what you wrote', 30);
        await wait(2500);
        shot(`s9-panel-${T}`); // The plan session's drafts; Skip finishes practice without inserting.
        adb('shell', 'input', 'keyevent', '4');
        await wait(1500);
        if (screenText().includes('polish your message')) { adb('shell', 'input', 'keyevent', '4'); await wait(1500); }
        if (/mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) { adb('shell', 'input', 'keyevent', '4'); await wait(1000); } // Footer Skip hides under the keyboard.
        for (let i = 0; i < 3; i++) { // Covered taps land on the sheet; retry on effect.
          await tapText('skip');
          try { await waitForLine('the bubble shows only', 10); break; } catch (e) { if (i === 2) throw new Error('Skip never left practice.'); }
        }
        tap(Math.round(width / 2), height - Math.round(160 * width / 1080)); await waitForLine('where the bubble shows');
      });
      shot(`s9-home-${T}`);
      log(`full plan walk done (${T})`);
    }
  });
  // Claude reaches its real page unapproved (no account): code screen + back-out at most; a failed start is evidence.
  await run('sX-claude', async () => {
    for (const dark of [false, true]) { const T = dark ? 'dark' : 'light';
      await theme(dark); await fresh(); await cleanOff(); await toChoose();
      adb('shell', 'logcat', '-c'); await tapText('with your claude'); await tapText('continue');
      let started = true;
      try { await waitForLine('your code', 30); } catch { started = false; shot(`sX-claude-failed-${T}`); log(`claude sign-in did not start (${T})`); }
      if (started) { shot(`sX-claude-code-${T}`); log(`claude waiting screen (${T})`); } // A real unapproved code; it expires untouched.
      await record(`sX-backout-${T}`, async () => {
        if (started) await tapText('cancel'); else adb('shell', 'input', 'keyevent', '4');
        await waitForLine('how should ownvoice write');
      });
      shot(`sX-claude-backout-${T}`);
    }
  });
  if (failed) throw new Error(`${failed} scenario(s) failed`);
  log(`plan proof saved to ${out}.`);
} finally {
  for (const [v, key] of [[priorServices, 'enabled_accessibility_services'], [priorAccessibility, 'accessibility_enabled']]) {
    try { adb('shell', 'settings', v === 'null' ? 'delete' : 'put', 'secure', key, ...(v === 'null' ? [] : [v])); } catch {}
  }
  await mock.close();
}

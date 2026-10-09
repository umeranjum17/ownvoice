// Live platform-fit proof on X and Reddit through the wired grow panel on a signed-in emulator.
// Chrome is host-mapped so x.com and reddit.com both show a fictional post with the reply already in
// the field; the bubble is tapped and each `ownvoice-fit` device-log line (levels and probabilities,
// never text) is read. No Jev key: the fit runs on the signed-in ChatGPT plan through @byokit/decide.
// Env: ANDROID_SERIAL=emulator-NNNN, OWNVOICE_AVD_NAME, JAVA_HOME; KEEP=1 leaves the last panel open;
// DARK=1 adds one dark capture per platform after the light run. Args: <cases.json> [out-dir] [limit].
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { resolve } from 'node:path';
import { accessibilityProbe, center } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const cases = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = resolve(process.argv[3] ?? 'e2e/artifacts/fit-live');
const limit = Number(process.argv[4] ?? 10);
mkdirSync(out, { recursive: true });
const PORT = 18613;
const HOSTS = { x: 'x.com', reddit: 'reddit.com' };
const pkg = 'dev.ownvoice.next';
const nodes = accessibilityProbe(serial, out);
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const snap = name => writeFileSync(resolve(out, `${name}.png`), execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 24 * 1024 * 1024 }));
const tap = (x, y) => adb('shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y)));
const until = async (find, label, tries = 90) => {
  for (let i = 0; i < tries; i++) { const found = find(); if (found) return found; await wait(1000); }
  throw new Error(`Timed out waiting for ${label}.`);
};

const keyFile = resolve(out, 'x.key'), certFile = resolve(out, 'x.crt');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=x.com', '-addext', 'subjectAltName=DNS:x.com,DNS:reddit.com', '-keyout', keyFile, '-out', certFile], { stdio: 'pipe' });
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const page = createServer({ key: readFileSync(keyFile), cert: readFileSync(certFile) }, (req, res) => {
  const host = (req.headers.host ?? '').replace(/:\d+$/, '');
  const platform = host === HOSTS.reddit ? 'reddit' : 'x';
  const i = Number(new URL(req.url, `https://${host}`).pathname.split('/').pop());
  const c = cases[platform]?.[i];
  if (!c) { res.writeHead(404).end(); return; }
  const heading = platform === 'reddit'
    ? `<p class="h">r/androidapps · posted by UmerDemo · 2h</p>`
    : `<p class="h">Umer Demo @umerdemo · 2h</p>`;
  const label = platform === 'reddit' ? 'Add a comment' : 'Post your reply';
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${platform === 'reddit' ? 'Reddit-style thread' : 'Umer Demo on X'}</title>
<style>body{font:17px sans-serif;margin:0;padding:16px}p{margin:0 0 6px}.h{color:#555}.b{font-size:19px;line-height:1.35;margin-bottom:28px}textarea{display:block;width:100%;box-sizing:border-box;min-height:150px;padding:12px;font:17px sans-serif;border:1px solid #999;border-radius:10px;margin-top:28px}</style>
${heading}<p class="b">${esc(c.post)}</p><button aria-label="12 ${platform === 'reddit' ? 'comments' : 'replies'}">12</button>
<textarea aria-label="${label}">${esc(c.reply)}</textarea>`);
});
await new Promise(r => page.listen(PORT, '0.0.0.0', r));
// Chrome's host-resolver-rules are comma-separated; a space between rules makes Chrome ignore the flag.
adb('shell', `echo '_ --host-resolver-rules="MAP x.com 10.0.2.2:${PORT},MAP reddit.com 10.0.2.2:${PORT}" --ignore-certificate-errors' > /data/local/tmp/chrome-command-line`);
adb('shell', 'am', 'force-stop', 'com.android.chrome');

const bubbleNode = () => nodes().find(node => node.windowType === 4 && /^Ownvoice(?:,|$)/.test(node.label));
const fitLines = () => adb('logcat', '-d', '-s', 'ReactNativeJS:I').split('\n').filter(line => line.includes('ownvoice-fit '));
const results = resolve(out, 'results.jsonl');
writeFileSync(results, '');
const SVC = 'dev.ownvoice.next/dev.ownvoice.bridge.OwnvoiceService';
// `cmd uimode night` rejects the `custom -o off` spelling on API 36; plain yes/no is the portable form.
const tryAdb = (...a) => { try { return adb(...a); } catch { return ''; } };
// RN reads the colour scheme at process start, so a theme change needs a fresh app process; force-stop
// unbinds the accessibility service, so toggle it off and on again to make Android rebind it.
const rebind = async () => {
  adb('shell', 'am', 'force-stop', pkg);
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', 'null');
  await wait(700);
  adb('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', SVC);
  adb('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1');
  await wait(2000);
};

const one = async (platform, i, tag) => {
  const c = cases[platform][i];
  adb('logcat', '-c');
  const host = HOSTS[platform];
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `https://${host}/${i}`, '-e', 'com.android.browser.application_id', 'fit-live', 'com.android.chrome');
  const field = await until(() => nodes().find(node => node.editable && node.text === c.reply), `the ${platform} reply field`);
  tap(...center(field));
  // The bubble node is an accessibility overlay; when its label isn't exposed, tap its saved spot
  // (right edge, halfway down) so the journey still opens the panel.
  const bubble = await until(bubbleNode, 'the bubble', 25).catch(() => null);
  if (bubble) tap(...center(bubble)); else { console.log('no bubble node; using the right-edge fallback'); tap(1010, 1150); }
  const line = await until(() => fitLines().at(-1), 'the fit log line').catch(async error => { snap(`FAIL-${tag}`); throw error; });
  await wait(900);
  snap(tag);
  const fits = JSON.parse(line.slice(line.indexOf('ownvoice-fit ') + 'ownvoice-fit '.length));
  appendFileSync(results, JSON.stringify({ platform, case: i, reply: c.reply, fits, shot: `${tag}.png` }) + '\n');
  console.log(`${tag}: ${fits.map(f => f.level ?? f.words).join(' | ')}`);
  return fits;
};

try {
  tryAdb('shell', 'cmd', 'uimode', 'night', 'no');
  await rebind();
  for (const platform of ['x', 'reddit']) {
    const n = Math.min(limit, cases[platform].length);
    for (let i = 0; i < n; i++) await one(platform, i, `${platform}-${String(i).padStart(2, '0')}-light`);
  }
  if (process.env.DARK) {
    tryAdb('shell', 'cmd', 'uimode', 'night', 'yes');
    await rebind();
    await one('x', 0, 'x-00-dark');
    await one('reddit', 0, 'reddit-00-dark');
  }
} finally {
  page.close();
  adb('shell', 'rm', '-f', '/data/local/tmp/chrome-command-line');
}

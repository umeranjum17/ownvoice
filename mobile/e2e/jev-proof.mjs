// Jev fit ratings on the emulator: each case's X post as a lab page Chrome shows at x.com (Chrome's
// host rules map x.com to this script's HTTPS server), each reply typed in its field, the bubble
// tapped, and the panel's Jev levels read from the `ownvoice-fit` log line plus a screenshot.
// Needs a release APK built with EXPO_PUBLIC_E2E_GPT=1 EXPO_PUBLIC_E2E_STUB=1, already set up
// with ChatGPT (the E2E ChatGPT session lives in memory: sign in again after any force-stop), and, for levels, EXPO_PUBLIC_JEV_KEY plus EXPO_PUBLIC_E2E_JEV_BASE
// pointing at `node e2e/jev-standin.mjs serve`. Without a key every card says it can't rate the fit.
// Env: ANDROID_SERIAL=emulator-NNNN, OWNVOICE_AVD_NAME, JAVA_HOME; KEEP=1 leaves the last panel open (for
// evidence.sh shots), NOFIT=1 waits a fixed time instead of the log line (a build without fit).
// Args: <cases.json> [out-dir] [limit].
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { resolve } from 'node:path';
import { accessibilityProbe, center } from './accessibility.mjs';

const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('Set ANDROID_SERIAL to a throwaway emulator (owner phones are refused).');
const cases = JSON.parse(readFileSync(process.argv[2], 'utf8')).slice(0, Number(process.argv[4] ?? Infinity));
const out = resolve(process.argv[3] ?? 'e2e/artifacts/jev');
mkdirSync(out, { recursive: true });
const pkg = 'dev.ownvoice.next';
const nodes = accessibilityProbe(serial, out);
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const snap = name => writeFileSync(resolve(out, `${name}.png`), execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 24 * 1024 * 1024 }));
const tap = (x, y) => adb('shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y)));
const until = async (find, label, tries = 30) => {
  for (let i = 0; i < tries; i++) { const found = find(); if (found) return found; await wait(1000); }
  throw new Error(`Timed out waiting for ${label}.`);
};

// A self-signed certificate for x.com; Chrome is told to accept it through its command line below.
const keyFile = resolve(out, 'x.key'), certFile = resolve(out, 'x.crt');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=x.com', '-addext', 'subjectAltName=DNS:x.com', '-keyout', keyFile, '-out', certFile], { stdio: 'pipe' });
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const page = createServer({ key: readFileSync(keyFile), cert: readFileSync(certFile) }, (req, res) => {
  const url = new URL(req.url, 'https://x.com');
  const c = cases[Number(url.pathname.split('/').pop())];
  if (!c) { res.writeHead(404).end(); return; }
  const reply = c.replies[Number(url.searchParams.get('r') ?? 0)]?.text ?? '';
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Umer Demo on X</title>
<style>body{font:17px sans-serif;margin:0;padding:16px}p{margin:0 0 6px}.h{color:#555}.b{font-size:19px;line-height:1.35;margin-bottom:28px}textarea{display:block;width:100%;box-sizing:border-box;min-height:150px;padding:12px;font:17px sans-serif;border:1px solid #999;border-radius:10px;margin-top:28px}</style>
<p class="h">Umer Demo @umerdemo · 2h</p><p class="b">${esc(c.post)}</p><button aria-label="12 replies">12</button>
<textarea aria-label="Post your reply">${esc(reply)}</textarea>`);
});
await new Promise(r => page.listen(18611, '0.0.0.0', r));
adb('shell', `echo '_ --host-resolver-rules="MAP x.com 10.0.2.2:18611" --ignore-certificate-errors' > /data/local/tmp/chrome-command-line`);
adb('shell', 'am', 'force-stop', 'com.android.chrome');

const bubbleNode = () => nodes().find(node => node.windowType === 4 && /^Ownvoice(?:,|$)/.test(node.label));
const fitLines = () => adb('logcat', '-d', '-s', 'ReactNativeJS:I').split('\n').filter(line => line.includes('ownvoice-fit '));
const results = resolve(out, 'results.jsonl');
writeFileSync(results, '');
try {
  for (const [i, c] of cases.entries()) for (const [j, reply] of c.replies.entries()) {
    adb('logcat', '-c');
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `https://x.com/umerdemo/status/${i}?r=${j}`, '-e', 'com.android.browser.application_id', 'jev-proof', 'com.android.chrome'); // one reused tab
    const field = await until(() => nodes().find(node => node.editable && node.text === reply.text), 'the reply field');
    tap(...center(field));
    tap(...center(await until(bubbleNode, 'the bubble')));
    const name = `x-${String(i).padStart(2, '0')}-${j}-${reply.kind}`;
    if (process.env.NOFIT) await wait(8000);
    else {
      const line = await until(() => fitLines().at(-1), 'the fit log line', 90);
      await wait(800);
      snap(name);
      const fits = JSON.parse(line.slice(line.indexOf('ownvoice-fit ') + 'ownvoice-fit '.length));
      // fits[0] is the Yours card: the reply as typed. The rest are the writer's versions of it.
      appendFileSync(results, JSON.stringify({ case: i, kind: reply.kind, text: reply.text, yours: fits[0], versions: fits.slice(1), shot: `${name}.png` }) + '\n');
      console.log(`${name}: ${fits[0].words} (${fits[0].probability ?? 'no level'})`);
    }
    if (process.env.KEEP && i === cases.length - 1 && j === c.replies.length - 1) break;
    adb('shell', 'input', 'keyevent', '4');
    await wait(600);
    if (adb('shell', 'dumpsys', 'window').split('\n').find(l => l.includes('mCurrentFocus'))?.includes(pkg)) adb('shell', 'input', 'keyevent', '4');
    await wait(600);
  }
} finally {
  page.close();
  adb('shell', 'rm', '-f', '/data/local/tmp/chrome-command-line');
}

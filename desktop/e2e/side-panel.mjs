// Proof driver for the side panel.
// Serves post.html (modeled on x.com markup, not a captured copy) over HTTPS, host-maps it as x.com, loads the unpacked extension in Chromium
// and reads what the panel shows. Usage: PLAYWRIGHT_DIR=<playwright install> node side-panel.mjs <dist dir> <evidence dir>
import { createRequire } from 'node:module';
import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_DIR || 'playwright');
const [dist, out] = [resolve(process.argv[2]), resolve(process.argv[3])]; mkdirSync(out, { recursive: true });
const PORT = 18711, tmp = mkdtempSync(join(tmpdir(), 'ovdesk-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=x.com', '-addext', 'subjectAltName=DNS:x.com', '-keyout', join(tmp, 'k'), '-out', join(tmp, 'c')], { stdio: 'pipe' });
const served = [];
const server = createServer({ key: readFileSync(join(tmp, 'k')), cert: readFileSync(join(tmp, 'c')) }, (req, res) => { served.push(req.url); res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(readFileSync(new URL('./post.html', import.meta.url))); });
await new Promise(r => server.listen(PORT, '127.0.0.1', r));
const fails = []; const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
const remote = [];
const run = async scheme => {
  const ctx = await chromium.launchPersistentContext(join(tmp, `p-${scheme}`), { headless: false, colorScheme: scheme, args: ['--headless=new', `--disable-extensions-except=${dist}`, `--load-extension=${dist}`, `--host-resolver-rules=MAP x.com 127.0.0.1:${PORT}`, '--ignore-certificate-errors'] });
  ctx.on('request', r => { if (!r.url().startsWith('chrome-extension://') && !r.url().startsWith('data:')) remote.push(r.url()); });
  try {
    const sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker');
    const id = new URL(sw.url()).host;
    const tab = await ctx.newPage();
    const panel = await ctx.newPage(); // panel as a tab; the page it reads is the other tab, brought to front
    await panel.goto(`chrome-extension://${id}/panel.html`);
    await panel.setViewportSize({ width: 400, height: 260 }); // side-panel width, so the shots show the panel and not an empty window
    const read = async (path, shot) => {
      await tab.goto(`https://x.com${path}`); await tab.bringToFront();
      await panel.evaluate(() => document.getElementById('again').click());
      await panel.waitForTimeout(600);
      const text = await panel.evaluate(() => document.body.innerText);
      if (shot) await panel.screenshot({ path: join(out, `${shot}-${scheme}.png`) });
      return text;
    };
    const SHIPPED = 'Shipped the reply flow end to end today';
    const post = await read('/umer/status/42', 'post');
    check(post.includes(SHIPPED) && post.includes('Umer'), `${scheme}: panel shows the post it read and its author`);
    check(!post.includes('Earlier post in the thread') && !post.includes('The plan we set on Monday'), `${scheme}: thread parent and quoted post are not read as the post`);
    const photo = await read('/umer/status/42/photo/1');
    check(photo.includes(SHIPPED) && !photo.includes('Earlier post in the thread'), `${scheme}: photo suffix reads the post whose status id matches`);
    const quoted = await read('/umer/status/42?case=quoted');
    check(quoted.includes(SHIPPED) && !quoted.includes('Earlier post in the thread'), `${scheme}: thread parent that quotes this post is not read as the post`);
    const wrapped = await read('/umer/status/42?case=wrapped');
    check(wrapped.includes(SHIPPED), `${scheme}: post inside a link block is still read`);
    const inner = await read('/umer/status/42?case=inner');
    check(inner.includes(SHIPPED), `${scheme}: post text inside a link inside the post is still read`);
    const empty = await read('/umer/status/42?case=notext', 'notext');
    check(empty.includes('Nothing to reply to yet') && !empty.includes('The post I read'), `${scheme}: image-only post shows the plain note and no post`);
    const home = await read('/home?case=home');
    check(home.includes('Nothing to reply to yet') && !home.includes('The post I read') && !home.includes('Home timeline'), `${scheme}: timeline page shows the plain note and no post`);
    await tab.goto('about:blank'); await tab.bringToFront(); await panel.evaluate(() => document.getElementById('again').click()); await panel.waitForTimeout(400);
    const other = await panel.evaluate(() => document.body.innerText);
    check(other.includes('Nothing to reply to yet') && !other.includes('The post I read'), `${scheme}: a non-X page shows the plain note and no post`);
  } finally { await ctx.close(); }
};
try { await run('light'); await run('dark'); } finally { server.close(); rmSync(tmp, { recursive: true, force: true }); }
check(remote.every(u => u.startsWith('https://x.com/')), `no request left the browser except the fixture page (${remote.length} requests: ${[...new Set(remote.map(u => new URL(u).origin))].join(', ')})`);
// done-done step record: what a person did and saw, written only from a run that passed.
if (!fails.length) writeFileSync(join(out, 'steps.json'), JSON.stringify({
  target: { version: JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8')).version },
  start: 'desktop Chrome with the unpacked Ownvoice extension and a fixture post page served as x.com',
  steps: ['open an x.com post in desktop Chrome', 'open the Ownvoice side panel and read the post', 'open a post with no words and a page that is not x.com'],
  result: 'the Ownvoice side panel shows the post Ownvoice read, and shows "Nothing to reply to yet" when there is nothing to reply to',
}, null, 2));
process.exit(fails.length ? 1 : 0);

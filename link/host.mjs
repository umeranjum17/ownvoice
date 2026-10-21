#!/usr/bin/env node
// The computer's end of "Use my computer". Start it by hand, pair the phone, stop it with Ctrl-C.
//   node host.mjs [--via lan|tailscale|private] [--port 7441] [--url ws://host:port]
// It keeps no credential: each write is one run of your own, already signed-in `claude -p` with every tool off.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { reach } from '@byokit/discover';
import { Host } from '@byokit/pair';
import { hostKeyFile } from '@byokit/pair/node';
import { WebSocketServer } from 'ws';

const { values: flags } = parseArgs({ options: { via: { type: 'string', default: 'lan' }, port: { type: 'string', default: '7441' }, url: { type: 'string' }, claude: { type: 'string', default: 'claude' } } });
const state = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'ownvoice-computer');
mkdirSync(state, { recursive: true, mode: 0o700 });

const input = createInterface({ input: process.stdin });
const ask = (question) => new Promise((done) => { process.stdout.write(question); input.once('line', done); });

const MAX_INPUT = 64_000;
// One run of the user's own Claude, tool-free, in an empty folder, so a hostile post on screen can't make it read a file.
function write({ instructions, input: text }) {
  if (typeof instructions !== 'string' || typeof text !== 'string' || text.length > MAX_INPUT) throw new Error('Bad request.');
  const cwd = mkdtempSync(join(tmpdir(), 'ownvoice-link-'));
  return new Promise((done, fail) => {
    const run = spawn(flags.claude, ['-p', '--model', 'sonnet', '--safe-mode', '--tools', '', '--no-session-persistence', '--strict-mcp-config', '--system-prompt', instructions], { cwd, env: { ...process.env, MAX_THINKING_TOKENS: '0' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => run.kill(), 90_000);
    run.stdin.on('error', () => {});
    run.stdout.setEncoding('utf8');
    run.stdout.on('data', (chunk) => { out += chunk; });
    const finish = () => { clearTimeout(timer); rmSync(cwd, { recursive: true, force: true }); };
    run.on('error', (error) => { finish(); fail(error); });
    run.on('close', (code) => { finish(); code === 0 && out.trim() ? done({ text: out.trim().replace(/^```(?:json)?\s*|\s*```$/g, '') }) : fail(new Error('Claude did not answer.')); });
    run.stdin.end(`Screen:\n${text}`);
  });
}

const host = await Host.open({
  keys: hostKeyFile(join(state, 'host.key')),
  name: hostname(),
  grants: { load: () => { try { return JSON.parse(readFileSync(join(state, 'phones.json'), 'utf8')); } catch { return []; } }, save: (g) => writeFileSync(join(state, 'phones.json'), JSON.stringify(g), { mode: 0o600 }) },
  confirm: async ({ name, words }) => /^y/i.test(await ask(`\n${name} wants to pair. Does it show "${words}"? (y/n) `)),
  handle: async (req) => {
    if (req.op === 'hello') return { ok: true };
    if (req.op === 'write') { console.log('A phone asked for a draft.'); return write(req.args ?? {}); }
    throw new Error('Unknown request.');
  },
});

const port = Number(flags.port);
const { urls, bind } = await reach({ port, via: flags.via });
const wss = new WebSocketServer({ host: bind, port });
wss.on('connection', (socket) => host.accept(socket));
const offer = host.compactOffer({ role: 'control', urls: flags.url ? [flags.url] : urls });
console.log(`Ownvoice link on ${hostname()}. On the phone: Home, Use my computer, paste:\n\n${offer.text}\n\nIt works for 5 minutes. Ctrl-C stops it.`);

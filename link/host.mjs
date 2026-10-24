#!/usr/bin/env node
// The computer's end of "Use my computer". Start it by hand, pair the phone, stop it with Ctrl-C.
//   node host.mjs [--via lan|tailscale|private] [--port 7441] [--url ws://host:port]
// It keeps no credential: each write is one run of your own, already signed-in `claude -p` with every tool off.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { reach } from '@byokit/discover';
import { Host } from '@byokit/pair';
import { hostKeyFile } from '@byokit/pair/node';
import { WebSocketServer } from 'ws';
import { write } from './write.mjs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const { values: flags } = parseArgs({ options: { via: { type: 'string', default: 'lan' }, port: { type: 'string', default: '7441' }, url: { type: 'string' }, claude: { type: 'string', default: 'claude' } } });
const state = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'ownvoice-computer');
mkdirSync(state, { recursive: true, mode: 0o700 });

const input = createInterface({ input: process.stdin });
const ask = (question) => new Promise((done) => { process.stdout.write(question); input.once('line', done); });

const host = await Host.open({
  keys: hostKeyFile(join(state, 'host.key')),
  name: hostname(),
  grants: { load: () => { try { return JSON.parse(readFileSync(join(state, 'phones.json'), 'utf8')); } catch { return []; } }, save: (g) => writeFileSync(join(state, 'phones.json'), JSON.stringify(g), { mode: 0o600 }) },
  confirm: async ({ name, words }) => /^y/i.test(await ask(`\n${name} wants to pair. Does it show "${words}"? (y/n) `)),
  handle: async (req) => {
    if (req.op === 'hello') return { ok: true, version };
    if (req.op === 'write') { console.log('A phone asked for a draft.'); return write(req.args ?? {}, { claude: flags.claude }); }
    throw new Error('Unknown request.');
  },
});

const port = Number(flags.port);
const { urls, bind } = await reach({ port, via: flags.via });
const wss = new WebSocketServer({ host: bind, port });
wss.on('connection', (socket) => host.accept(socket));
const offer = host.compactOffer({ role: 'control', urls: flags.url ? [flags.url] : urls });
console.log(`Ownvoice link on ${hostname()}. On the phone: Home, Use my computer, paste:\n\n${offer.text}\n\nIt works for 5 minutes. Ctrl-C stops it.`);

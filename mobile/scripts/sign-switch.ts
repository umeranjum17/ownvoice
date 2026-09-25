#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
const [keyPath, status, note = ''] = process.argv.slice(2);
if (!keyPath || !['on', 'off'].includes(status)) throw new Error('Usage: sign-switch.ts PRIVATE_KEY on|off [note]');
const payload = { v: 1, app: 'ownvoice', seq: Number(process.env.SWITCH_SEQ), chatgpt: status, ...(note ? { note } : {}) };
if (!Number.isSafeInteger(payload.seq) || payload.seq < 1) throw new Error('Set SWITCH_SEQ to a positive integer.');
const sig = await ed.signAsync(new TextEncoder().encode(JSON.stringify(payload)), Buffer.from(readFileSync(keyPath, 'utf8').trim(), 'hex'));
console.log(JSON.stringify({ payload, sig: Buffer.from(sig).toString('base64') }, null, 2));

#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { signDetached, signingKeyPairFromSeed } from '@byokit/seal';
const [keyPath, status] = process.argv.slice(2);
if (process.argv.length !== 4 || !keyPath || !['on', 'off'].includes(status)) throw new Error('Usage: sign-switch.ts PRIVATE_KEY on|off');
const payload = { v: 1, app: 'ownvoice', seq: Number(process.env.SWITCH_SEQ), chatgpt: status };
if (!Number.isSafeInteger(payload.seq) || payload.seq < 1) throw new Error('Set SWITCH_SEQ to a positive integer.');
const seed = Uint8Array.from(Buffer.from(readFileSync(keyPath, 'utf8').trim(), 'hex'));
const sig = signDetached(new TextEncoder().encode(JSON.stringify(payload)), signingKeyPairFromSeed(seed).secretKey);
console.log(JSON.stringify({ payload, sig: Buffer.from(sig).toString('base64') }, null, 2));

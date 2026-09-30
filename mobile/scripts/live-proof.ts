import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { memoryStore, portableEngine, claims, respond } from '@byokit/accounts';
import { rewritePrompt } from '../src/core/judge';

async function main() {
const authPath = process.argv[2] ?? '../.live-proof-home/.codex/auth.json';
const codex = JSON.parse(readFileSync(authPath, 'utf8'));
const token = codex?.tokens?.access_token, refresh = codex?.tokens?.refresh_token;
if (typeof token !== 'string' || typeof refresh !== 'string') throw new Error('Copied sign-in has no usable tokens.');
const tokenClaims = claims(token), accountId = tokenClaims['https://api.openai.com/auth']?.chatgpt_account_id;
const expires = Number(tokenClaims.exp) * 1000;
if (!accountId || expires - Date.now() < 5 * 60_000) throw new Error('Copied sign-in expires too soon; refusing to refresh it.');
const credentials = memoryStore();
await credentials.modify('openai-codex', async () => ({ type: 'oauth', access: token, refresh, expires, accountId }));
const runtime = portableEngine(credentials);
const resolved = await runtime.getAuth('openai-codex', { minOAuthValidityMs: 0 });
if (!resolved?.auth?.apiKey) throw new Error('Copied sign-in is not usable; no refresh was attempted.');
const prompt = rewritePrompt('ya im in', 'bro are you still up for padel', 'No em dashes.');
const started = performance.now();
let firstTextMs: number | undefined;
const text = await respond({ access: resolved.auth.apiKey, accountId, model: 'gpt-6-sol', originator: 'ownvoice', instructions: 'Return the requested three rewrite versions as JSON.', input: prompt, text: { verbosity: 'low', format: { type: 'json_object' } }, onText: () => { firstTextMs ??= performance.now() - started; } });
const drafts = (JSON.parse(text) as { versions: unknown }).versions;
console.log(JSON.stringify({ firstTextMs: Math.round(firstTextMs ?? -1), totalMs: Math.round(performance.now() - started), drafts }, null, 2));
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Live proof failed.'); process.exitCode = 1; });

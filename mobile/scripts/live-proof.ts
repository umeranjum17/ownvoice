import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { memoryStore, portableEngine, claims } from '@byokit/accounts';
import { rewritePrompt, versions } from '../src/core/judge';

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
const response = await fetch('https://chatgpt.com/backend-api/codex/responses', {
  method: 'POST', headers: { Authorization: `Bearer ${resolved.auth.apiKey}`, 'Content-Type': 'application/json', 'chatgpt-account-id': accountId, originator: 'ownvoice', 'OpenAI-Beta': 'responses=experimental', accept: 'text/event-stream' },
  body: JSON.stringify({ model: 'gpt-6-sol', instructions: 'Return the requested three rewrite versions as JSON.', input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }], stream: true, store: false, reasoning: { effort: 'none' }, text: { verbosity: 'low', format: { type: 'json_object' } } }),
});
if (!response.ok || !response.body) throw new Error(`The streamed call failed (${response.status}): ${await response.text()}; no token was refreshed.`);
const reader = response.body.getReader(), decoder = new TextDecoder();
let pending = '', text = '', firstTextMs: number | undefined;
while (true) {
  const { value, done } = await reader.read();
  pending += decoder.decode(value, { stream: !done });
  const events = pending.split('\n\n'); pending = events.pop() ?? '';
  for (const event of events) for (const line of event.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim(); if (!data || data === '[DONE]') continue;
    const item = JSON.parse(data);
    const delta = item.type === 'response.output_text.delta' ? item.delta : undefined;
    if (typeof delta === 'string') { firstTextMs ??= performance.now() - started; text += delta; }
    if (item.type === 'response.failed') throw new Error('The streamed answer failed.');
  }
  if (done) break;
}
const drafts = versions(text);
if (drafts.length !== 3) throw new Error(`Expected three versions; got ${drafts.length}.`);
console.log(JSON.stringify({ firstTextMs: Math.round(firstTextMs ?? -1), totalMs: Math.round(performance.now() - started), drafts }, null, 2));
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Live proof failed.'); process.exitCode = 1; });

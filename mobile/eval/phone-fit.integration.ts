// Offline replay of real native answers through the published decision engine and app fit mapping.
// --deadline additionally drives a real delayed HTTP response past the former 60-second deadline.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { answerer } from '@byokit/decide';
import { judgeFit, LEVELS } from '../src/grow/fit.ts';

// Native Qwen2.5 1.5B, x86_64 two-core emulator, 2026-10-24: complete after 172054 ms,
// after allowing the unchanged phone prompt/schema to finish instead of cancelling at 60 s.
const nativeRaw = `<|im_start|>assistant
{
  "fit_0": {"probabilities": {"0": 0.1, "1": 0.8, "2": 0.1, "3": 0.0}},
  "fit_1": {"probabilities": {"0": 0.1, "1": 0.8, "2": 0.1, "3": 0.0}},
  "fit_2": {"probabilities": {"0": 0.1, "1": 0.8, "2": 0.1, "3": 0.0}},
  "fit_3": {"probabilities": {"0": 0.1, "1": 0.8, "2": 0.1, "3": 0.0}}
}`;
// Earlier retained native failure (2026-10-18): truncated before the second rationale ended.
const cut = '{"fit_0":{"probabilities":{"0":0.1,"1":0.8,"2":0.1,"3":0},"rationale":"The post is about the balance between emails and face-to-face meetings."},"fit_1":{"probabilities":{"0":0.1,"1":0.8,"2":0.1,"3":0},"rationale":"';
const input = {
  post: 'Shipping a tiny app every week this year. Week 12: a focus timer that only counts focused minutes. What should week 13 be?',
  candidates: ['I would add a break timer next.', 'A timer that reminds you to take a break.', 'Rest helps focus too.', 'Could it remind you to take a break?'],
  platform: { id: 'x', label: 'X' } as Parameters<typeof judgeFit>[0]['platform'], voice: false,
};
const backend = (ask: (signal: AbortSignal) => Promise<string>) => answerer({ name: 'recorded-phone', leaves: false,
  ask: async (_prompt, signal) => (await ask(signal)).replace(/^\s*(?:<\|im_start\|>assistant\s*)?(?:```(?:json)?\s*)?|\s*```\s*$/g, '') });
const rated = await judgeFit({ ...input, backends: [backend(async () => nativeRaw)] });
assert.deepEqual(rated.map(f => [f.level, f.probability, f.words]), input.candidates.map(() => [1, 0.8, LEVELS[1]]));
for (const raw of [cut, nativeRaw.replaceAll('0.8', '0.4').replaceAll('0.1', '0.3')]) {
  const fits = await judgeFit({ ...input, backends: [backend(async () => raw)] });
  assert.ok(fits.every(f => f.level === null && f.probability === null), 'Malformed or below-floor answers must still abstain');
}
console.log('PASS: complete native answer maps to four real levels; truncated and low-confidence answers abstain');

if (process.argv.includes('--deadline')) {
  // A real loopback HTTP fixture, not an inference server or simulated clock. No text leaves the host.
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const server = createServer((_req, res) => {
    const timer = setTimeout(() => { timers.delete(timer); res.end(nativeRaw); }, 61000);
    timers.add(timer);
    res.on('close', () => { clearTimeout(timer); timers.delete(timer); });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const { port } = server.address() as { port: number };
  const http = backend(async signal => (await fetch(`http://127.0.0.1:${port}`, { signal })).text());
  try {
    const [old, phone] = await Promise.all([
      judgeFit({ ...input, backends: [http] }),
      judgeFit({ ...input, backends: [http], timeoutMs: 300000 }),
    ]);
    assert.ok(old.every(f => f.level === null), 'Default/cloud minute deadline must remain bounded');
    assert.deepEqual(phone.map(f => f.level), [1, 1, 1, 1], 'Phone must retain real judgments arriving after one minute');
    console.log('PASS: same 61-second HTTP answer abstains at cloud/default deadline and rates all four at phone deadline');
  } finally {
    for (const timer of timers) clearTimeout(timer);
    server.closeAllConnections(); server.close();
  }
}

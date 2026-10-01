// Runs the eval set through the app's live phone-writer pipeline
// (mobile/src/panel/phoneWriter.ts polish + replies, mobile/src/rewrite/Rewrite.tsx
// selection) against an OpenAI-compatible endpoint (llama-server on the host,
// or ollama's /v1). Dev-only: never imported by the app, never bundled.
//
// Usage: node run.ts <label> <baseUrl> <out.json>
// Env: MODEL (default llama-server's loaded model), TEMP (default 0),
//      SEED (default 7), ONLY (comma prefixes, e.g. ONLY=R07 or ONLY=P01,P13,S05,R01,R07).
import { readFileSync, writeFileSync } from 'node:fs';
import { cases } from './cases.ts';
import { platformForApp } from 'ownvoice-engine/src/platforms.ts';
import * as J from 'ownvoice-engine/src/judge.ts';
import * as D from 'ownvoice-engine/src/drafts.ts';
import * as T from 'ownvoice-engine/src/threads.ts';

import nspell from 'nspell';
import { polishAcceptor } from '../src/core/polish.ts';
import { polishGuard } from '../src/core/polishGuard.ts';

const spell = nspell(readFileSync(new URL('../assets/dictionary/en-affixes.aff', import.meta.url), 'utf8'), readFileSync(new URL('../assets/dictionary/en-words.dic', import.meta.url), 'utf8'));

const [label, base, outPath] = process.argv.slice(2);
if (!label || !base || !outPath) {
  console.error('usage: node run.ts <label> <baseUrl> <out.json>');
  process.exit(2);
}
const MODEL = process.env.MODEL ?? '';
type Call = { prompt: string; maxTokens: number; answer: string; ms: number; promptTokens: number; genTokens: number };

async function call(prompt: string, maxTokens: number, calls: Call[], signal?: AbortSignal): Promise<string> {
  const started = Date.now();
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify({
      ...(MODEL ? { model: MODEL } : {}),
      messages: [{ role: 'user', content: prompt }],
      // MAXTOK_EXTRA is headroom for thinking models (their thinking consumes
      // the same budget); 0 keeps the phone pipeline's budgets untouched.
      max_tokens: maxTokens + Number(process.env.MAXTOK_EXTRA ?? 0),
      temperature: Number(process.env.TEMP ?? 0),
      seed: Number(process.env.SEED ?? 7),
    }),
  });
  const json: any = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 300));
  let answer: string = json.choices[0].message.content ?? '';
  answer = answer.replace(/<think>[\s\S]*?<\/think>\s*/g, '').replace(/^<think>[\s\S]*$/, '');
  calls.push({
    prompt, maxTokens, answer, ms: Date.now() - started,
    promptTokens: json.usage?.prompt_tokens ?? 0, genTokens: json.usage?.completion_tokens ?? 0,
  });
  return answer;
}

// Local cleanup uses the shared polish acceptor; slot-0 fixtures need no writer call.
// Other polish fixtures collect the two writer cards, then retry flattened layouts.
async function polish(c: any, calls: Call[]) {
  const dashes = D.dashDecision(false, c.typed);
  const engine = { ask: (p: string, n: number) => call(p, n, calls) };
  const acceptor = await polishAcceptor(c.typed, dashes, [], spell);
  const raw: Record<string, string> = { LIGHT: acceptor.local ?? c.typed };
  if (c.slot === 0) return { raw, shown: acceptor.results, rescued: [] };
  const guard = await polishGuard(c.typed, (prompt, signal) => call(prompt, 768, calls, signal), false);
  const candidates: { text: string; slot: number }[] = [];
  if (acceptor.local != null) candidates.push({ text: acceptor.local, slot: 0 });
  await J.rewrite(engine, c.typed, c.screen, c.guide ?? '', (v: any, text: string) => {
    raw[v.name] = text;
    candidates.push({ text, slot: J.versionsList.findIndex((x: any) => x.name === v.name) });
  }, dashes).catch(e => { raw.error = String(e); });
  const qualified = await guard.qualify(candidates);
  if (!qualified.some(candidate => candidate.slot === 0)) acceptor.rejectLocal();
  for (const candidate of qualified) if (candidate.slot !== 0) acceptor.accept(candidate.text, candidate.slot, J.versionsList[candidate.slot].label);
  const rescued: number[] = [];
  for (const fail of acceptor.layoutFails) {
    const prompt = J.lineRetryPrompt(c.typed, c.screen, J.versionsList[fail.slot], c.guide ?? '', dashes);
    const rebuilt = D.rebuildLines(c.typed, await call(prompt, 256, calls));
    if (rebuilt == null || !(await guard.qualify([{ text: rebuilt, slot: fail.slot }])).length) continue;
    const fixed = acceptor.fix(rebuilt, fail.slot, fail.label);
    if (fixed != null) rescued.push(fail.slot);
  }
  return { raw, shown: acceptor.results.sort((a: any, b: any) => a.slot - b.slot), rescued };
}

// Same shape as Panel.tsx: one batched tonePrompt call for the single text,
// scored off its raw answer.
async function tone(c: any, calls: Call[]) {
  const answer = await call(J.tonePrompt([c.typed]), 80, calls);
  return { shown: [{ text: answer, slot: 0 }] };
}

// Same shape as Rewrite.tsx: one selectionRewritePrompt call, cleaned with the
// selection chatter filter, with the single-word full-stop guard for Fix spelling.
async function select(c: any, calls: Call[]) {
  const raw = await call(J.selectionRewritePrompt(c.typed, c.how, ''), 256, calls);
  const out = D.cleanSelection(c.typed, J.clean(raw));
  return { shown: [{ text: c.how === 'Fix spelling' ? D.preserveFragment(c.typed, out) : out, slot: 0 }] };
}

// Package 5 thread writer: one model call for nicer breaks plus 3 hooks, checked
// by cleanThread (caps, words, numbers and times both ways); the deterministic
// split is the fallback when the answer fails the check, same as the app will do.
async function thread(c: any, calls: Call[]) {
  const platform = c.app ? platformForApp(c.app) : undefined;
  const limit = T.threadLimit(platform) ?? 280;
  const answer = await call(T.threadPrompt(c.typed, platform, c.guide ?? '', 'remove'), 512 + Math.ceil(c.typed.length / 4), calls);
  const good = T.cleanThread(answer, c.typed, limit);
  if (good) return { shown: good.parts.map((text, slot) => ({ text, slot })), hooks: good.hooks, fallback: false };
  const fb = T.fallbackThread(c.typed, limit);
  return { shown: fb.parts.map((text, slot) => ({ text, slot })), hooks: fb.hooks, fallback: true };
}

// Same shape as phoneWriter.replies: one numbered call, then one retry per empty slot.
async function reply(c: any, calls: Call[]) {
  const input = { latest: c.latest ?? '', conversation: c.screen, guide: c.guide, platform: c.app ? platformForApp(c.app) : undefined };
  const slots = D.slotsFor(input.platform);
  const exclude: string[] = [];
  const made: (string | null)[] = [null, null, null];
  const first = await call(D.phoneReplyPrompt(input), 220, calls);
  D.acceptReplies([first], exclude, 3, 'remove', []).forEach((t, i) => { if (t) { made[i] = t; exclude.push(t); } });
  for (let slot = 0; slot < 3; slot++) {
    if (made[slot]) continue;
    const [d] = D.acceptReplies([await call(D.phoneSlotPrompt(slots[slot], input, exclude), 120, calls)], exclude, 1, 'remove', []);
    if (d) { made[slot] = d; exclude.push(d); }
  }
  return { shown: made.map((text, slot) => ({ text, slot })).filter(x => x.text) };
}

const results: any[] = [];
for (const c of cases) {
  if ((c as any).from) continue; // P13 is scored off the P01 run, same as the report
  if (process.env.ONLY && !process.env.ONLY.split(',').some((p: string) => c.id.startsWith(p))) continue;
  const calls: Call[] = [];
  const started = Date.now();
  let r: any;
  try { r = c.kind === 'polish' ? await polish(c, calls) : c.kind === 'select' ? await select(c, calls) : c.kind === 'tone' ? await tone(c, calls) : c.kind === 'thread' ? await thread(c, calls) : await reply(c, calls); }
  catch (e) { r = { error: String(e), shown: [] }; }
  results.push({ id: c.id, ...r, calls, wallMs: Date.now() - started });
  process.stderr.write(`${label} ${c.id} ${Date.now() - started}ms shown=${r.shown.length}\n`);
}
writeFileSync(outPath, JSON.stringify({ label, results }, null, 1));

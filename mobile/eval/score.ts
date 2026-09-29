// Scores run.ts outputs (report Appendix C, plus the invented-times check).
// Usage: node --import ./register.mjs score.ts out/<run>.json [out/<run2>.json ...]
// Prints a table, writes out/scores.json, and exits non-zero when the gate
// fails: P01, P13, S05, R01 and R07 must all pass, so a model or prompt change
// can never silently drop below the study's numbers on them (README).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cases } from './cases';
import * as S from '../src/core/slop';
import { layoutKept } from '../src/core/drafts';
import { ALL_SLOTS } from '../src/core/platforms';

const here = dirname(fileURLToPath(import.meta.url));
const byId = Object.fromEntries(cases.map(c => [c.id, c]));
const low = (s: string) => s.toLowerCase();
const commentary = (t: string) => {
  const lines = t.trim().split('\n').map(l => l.trim()).filter(Boolean);
  return /^(here|sure|okay|ok,|certainly|of course|rewritten|version \d|improved|polished)\b/i.test(lines[0] ?? '')
    || lines.some(l => /^(note|explanation|changes?( made)?)\s*:/i.test(l) || /^row \d+:/i.test(l) || /^-{3,}$/.test(l) || /```|^\{|"versions"/.test(l))
    || /(hope (this|that) helps|let me know if|i('ve| have)? (kept|changed|made|removed|fixed|cut)|the (text|message) (is|was) already)/i.test(lines.at(-1) ?? '');
};
const echoesPrompt = (t: string) => ALL_SLOTS.some(s => low(t).includes(low(s).slice(0, 25))) || /\b(draft|slot|latest message|conversation:)\b/i.test(t) || /^not sure yet:/i.test(t);
const emoji = (s: string) => [...s].filter(ch => /\p{Extended_Pictographic}/u.test(ch));
const numbersChanged = (a: string, b: string) => [...S.addedNumbers(a, b), ...S.addedNumbers(b, a)];

function scoreRewrite(c: any, text: string, needLayout: boolean) {
  const day = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*day$/i;
  const missing = c.keep.filter((k: string) => !low(text).includes(day.test(k) ? low(k).slice(0, 3) : low(k)));
  const nums = numbersChanged(c.typed, text);
  const issues: string[] = [];
  if (missing.length) issues.push(`drops ${missing.join('/')}`);
  if (nums.length) issues.push(`numbers ${nums.join('/')}`);
  if (commentary(text)) issues.push('commentary');
  if (needLayout && !layoutKept(c.typed, text)) issues.push('layout');
  if (c.exact && low(text) !== low(c.exact)) issues.push(`not exact (${JSON.stringify(text)})`);
  if (c.screen && c.screen.split('\n').some((l: string) => { const m = l.replace(/^[^:]{1,20}:\s*/, ''); return m.length > 15 && text.includes(m) && !c.typed.includes(m); })) issues.push('copied screen text');
  const voice: string[] = [];
  if (c.guide?.includes('lowercase') && /[A-Z]/.test(text[0] ?? '')) voice.push('capitalised');
  if (c.guide?.includes('exclamation') && text.includes('!')) voice.push('added !');
  if (emoji(c.typed).length && emoji(text).length < emoji(c.typed).length) voice.push('lost emoji');
  if (!c.typed.includes('—') && /—/.test(text)) voice.push('added long dash');
  if (text.length > c.typed.length * 1.6 + 20) voice.push('much longer');
  if (c.exact && text !== c.exact) voice.push('changed casing');
  if (c.how === 'Fix spelling' && c.id === 'S03-spelling' && !/gonna/i.test(text)) voice.push('dropped slang');
  if (c.how === 'Shorter' && text.length >= c.typed.length) voice.push('not shorter');
  return { meaningOk: !issues.length, issues, voiceOk: !voice.length, voice };
}

function scoreReply(c: any, text: string) {
  const issues: string[] = [];
  const added = S.addedNumbers(c.screen, text);
  if (added.length) issues.push(`invented number ${added.join('/')}`);
  const times = S.inventedTimes(c.screen, text);
  if (times.length) issues.push(`invented time ${times.join('/')}`);
  if (echoesPrompt(text)) issues.push('echoes instructions');
  if (commentary(text)) issues.push('commentary');
  if ((c.noise ?? []).some((n: string) => text.includes(n))) issues.push('screen label leaked');
  const answersAll = c.points.every((group: string[]) => group.some(k => low(text).includes(k)));
  const voice: string[] = [];
  if (c.guide?.includes('lowercase') && /[A-Z]/.test(text[0] ?? '')) voice.push('capitalised');
  if (c.guide?.includes('exclamation') && text.includes('!')) voice.push('added !');
  if (text.length > 220) voice.push('long');
  const stock = S.hits(text).length;
  if (stock) voice.push(`${stock} stock`);
  if (/—/.test(text)) voice.push('long dash');
  return { meaningOk: !issues.length, issues, answersAll, voiceOk: !voice.length, voice };
}

// The regression gate: these five must pass, or the model/prompt change is out.
const GATE = ['P01-noon-list', 'P13-tent-shorter', 'S05-list-shorter', 'R01-sam-practice', 'R07-two-questions'];

const table: any[] = [];
for (const file of process.argv.slice(2)) {
  const { label, results } = JSON.parse(readFileSync(file, 'utf8'));
  const found = Object.fromEntries(results.map((r: any) => [r.id, r]));
  const rows = cases.filter(c => found[(c as any).from ?? c.id]).map((c: any) => {
    const r = { ...found[c.from ?? c.id], id: c.id };
    if (c.slot != null) { r.shown = r.shown.filter((s: any) => s.slot === c.slot); if (c.from) r.calls = []; }
    const cards = r.shown.map((s: any) => c.kind === 'reply' ? scoreReply(c, s.text) : scoreRewrite(c, s.text, c.kind === 'polish' || !!c.layout));
    const allSafe = cards.every((x: any) => x.meaningOk);
    const pass = c.kind === 'reply'
      ? cards.length >= 2 && allSafe && cards.some((x: any) => x.answersAll)
      : cards.length >= 1 && allSafe;
    const gen = r.calls.reduce((a: number, x: any) => a + x.genTokens, 0);
    const prompt = r.calls.reduce((a: number, x: any) => a + x.promptTokens, 0);
    return { id: r.id, kind: c.kind, pass, cards: cards.length, safe: cards.filter((x: any) => x.meaningOk).length,
      voice: cards.filter((x: any) => x.voiceOk).length, calls: r.calls.length, gen, prompt, wallMs: r.wallMs, detail: cards, texts: r.shown.map((s: any) => s.text) };
  });
  const sum = (f: (r: any) => number) => rows.reduce((a: number, r: any) => a + f(r), 0);
  const kinds = ['polish', 'select', 'reply'].map(k => { const rs = rows.filter((r: any) => r.kind === k); return `${rs.filter((r: any) => r.pass).length}/${rs.length}`; });
  const cardsTotal = sum(r => r.cards);
  // The gate only judges cases this run covered; a partial (ONLY) run names
  // the gate cases it skipped instead of failing them.
  const gateSkipped = GATE.filter(id => !rows.find((r: any) => r.id === id));
  const gateFails = GATE.filter(id => rows.find((r: any) => r.id === id) && !rows.find((r: any) => r.id === id)?.pass);
  table.push({ label, pass: sum(r => r.pass ? 1 : 0), of: rows.length, polish: kinds[0], select: kinds[1], reply: kinds[2],
    cards: cardsTotal, safePct: Math.round(100 * sum(r => r.safe) / Math.max(1, cardsTotal)), voicePct: Math.round(100 * sum(r => r.voice) / Math.max(1, cardsTotal)),
    calls: sum(r => r.calls), genTok: sum(r => r.gen), promptTok: sum(r => r.prompt), gateFails, gateSkipped, rows });
}
table.sort((a, b) => b.pass - a.pass || b.safePct - a.safePct);
console.log('label           pass  polish select reply  cards safe% voice% calls genTok promptTok gate');
for (const t of table) console.log(`${t.label.padEnd(15)} ${String(t.pass).padStart(2)}/${t.of}  ${t.polish.padEnd(6)} ${t.select.padEnd(6)} ${t.reply.padEnd(6)} ${String(t.cards).padStart(4)} ${String(t.safePct).padStart(4)} ${String(t.voicePct).padStart(5)} ${String(t.calls).padStart(5)} ${String(t.genTok).padStart(6)} ${String(t.promptTok).padStart(8)} ${t.gateFails.length ? 'FAIL ' + t.gateFails.join(',') : t.gateSkipped.length ? 'ok (gate skipped: ' + t.gateSkipped.join(',') + ')' : 'ok'}`);
writeFileSync(resolve(here, 'out/scores.json'), JSON.stringify(table, null, 1));
const failed = table.filter(t => t.gateFails.length);
if (failed.length) {
  console.error(`gate failed: ${failed.map(t => `${t.label} (${t.gateFails.join(',')})`).join('; ')}`);
  process.exit(1);
}

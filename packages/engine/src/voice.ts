import { NO_RULES, matcher, NEVER_SAY, LONG_DASH, ENDS_ON_QUESTION } from './slop.ts';
import type { Hit, Rules } from './slop.ts';
import { MAX_SAMPLES, MAX_MARKDOWN_LENGTH, MAX_GUIDE_LENGTH, normalizeSample, normalizeSamples, selectExamples } from './samples.ts';

export type Found = { never: string[]; noDashes: boolean; statementEndings: boolean; samples: string[]; skipped: number };
const heading = /^\s*(?:#{1,6}\s+(.+?)\s*#*|\*\*([^*]+)\*\*:?)\s*$/;
const bullet = /^\s*(?:[-*+•]|\d+[.)])\s+(.+)$/;
const quoted = /"([^"\n]+)"|“([^”\n]+)”|`([^`\n]+)`/g;
const dedupe = (xs: string[]) => xs.filter(x => x.trim()).filter((x,i,a)=>a.findIndex(y=>y.toLocaleLowerCase()===x.toLocaleLowerCase())===i);
export function parse(markdown: string): Found {
  if (markdown.length > MAX_MARKDOWN_LENGTH) throw new RangeError('voice markdown too long');
  const never: string[] = [], samples: string[] = [], ruleLines: string[] = [];
  let skipped = 0, section = '';
  for (const line of markdown.split(/\r?\n/)) {
    const h = line.match(heading);
    if (h) {
      const name = (h[1] || h[2]).toLowerCase().trim();
      section = name === 'how i reply' ? 'samples' : name.replace(/-/g, ' ').includes('never say') ? 'never' : '';
      if (section !== 'samples') ruleLines.push(line);
      continue;
    }
    if (section === 'samples') {
      const b = line.match(bullet)?.[1];
      if (!b) { if (line.trim()) skipped++; continue; }
      const sample = normalizeSample(b);
      if (sample === null || !sample) { skipped++; continue; }
      if (samples.includes(sample)) continue;
      if (samples.length === MAX_SAMPLES) { skipped++; continue; }
      samples.push(sample);
      continue;
    }
    ruleLines.push(line);
    if (section !== 'never') continue;
    const b = line.match(bullet)?.[1];
    if (!b) continue;
    const qs = [...b.matchAll(quoted)].map(m => m[1] || m[2] || m[3]);
    const plain = b.replace(/[*_`]/g, '').trim().replace(/[.,;:!]+$/, '').trim();
    if (qs.length) never.push(...qs);
    else if (plain && plain.split(/\s+/).length <= 5) never.push(plain);
    else skipped++;
  }
  const rulesText = ruleLines.join('\n');
  const dash = /(?:\b(?:no|zero|never|avoid|ban(?:ned)?|don'?t|without|cut)\b[^\n]{0,40}\bem[- ]?dash|em[- ]?dash(?:es)?\b[^\n]{0,20}\b(?:banned|never))/i;
  return { never: dedupe(never.map(x => x.trim())), noDashes: dash.test(rulesText), statementEndings: /statements?,? not questions|end (?:posts |each post )?(?:on|with) (?:a )?statements?/i.test(rulesText), samples, skipped };
}
export function merge(rules: Rules, found: Found): Rules {
  const samples = normalizeSamples(rules.samples);
  if (samples === null) throw new TypeError('invalid reply samples');
  const imported = normalizeSamples(found.samples);
  if (imported === null) throw new TypeError('invalid reply samples');
  return { ...rules, never: dedupe([...rules.never, ...found.never]), noDashes: rules.noDashes || found.noDashes, statementEndings: rules.statementEndings || found.statementEndings,
    samples: [...new Set([...samples, ...imported])].slice(0, MAX_SAMPLES) };
}
export { matcher };
/** Reuse samples from this result for writer and fit; budget is the remaining guide space. */
export function selectedGuide(r: Rules, post: boolean, budget = MAX_GUIDE_LENGTH): { line: string; samples: string[] } {
  const samples = normalizeSamples(r.samples);
  if (samples === null) throw new TypeError('invalid reply samples');
  const base = [r.noDashes ? 'No em dashes.' : null, r.statementEndings && post ? 'End on a statement, not a question.' : null,
    r.note.trim() ? `How they write: ${r.note.trim().slice(0,200)}` : null].filter(Boolean).join(' ');
  return selectExamples(samples, base, budget);
}
export function guide(r: Rules, post: boolean): string { return selectedGuide(r, post).line; }
export function broken(hits:Hit[],text:string,r:Rules){const out:string[]=[];const phrases=hits.filter(h=>h.reason===NEVER_SAY).map(h=>'“'+text.slice(h.start,h.end)+'”').filter((x,i,a)=>a.findIndex(y=>y.toLowerCase()===x.toLowerCase())===i);if(phrases.length)out.push('says '+phrases.join(', ')+' from your never-say list');if(r.noDashes&&hits.some(h=>h.reason===LONG_DASH))out.push('has a long dash (—)');if(hits.some(h=>h.reason===ENDS_ON_QUESTION))out.push('ends on a question');return out;}

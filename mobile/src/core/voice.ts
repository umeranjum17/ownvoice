export * from 'ownvoice-engine/src/voice.ts';
import { MAX_SAMPLES, normalizeSample, normalizeSamples } from 'ownvoice-engine/src/samples.ts';
import type { Rules } from './slop';

export type Found = { never: string[]; noDashes: boolean; statementEndings: boolean; samples: string[]; skipped: number };
const heading = /^\s*(?:#{1,6}\s+(.+?)\s*#*|\*\*([^*]+)\*\*:?)\s*$/;
const bullet = /^\s*(?:[-*+•]|\d+[.)])\s+(.+)$/;
const quoted = /"([^"\n]+)"|“([^”\n]+)”|`([^`\n]+)`/g;
const dedupe = (xs: string[]) => xs.filter(x => x.trim()).filter((x,i,a)=>a.findIndex(y=>y.toLocaleLowerCase()===x.toLocaleLowerCase())===i);
// Same `## How I reply` shape as the engine parser; lenient where the engine throws so a picked
// file previews instead of failing the screen. `guide()` (with its budgeted sample selection)
// and `selectedGuide` come from the engine re-export above.
export function parse(markdown: string): Found {
 const never:string[]=[]; const samples:string[]=[]; const ruleLines:string[]=[];
 let skipped=0, section='';
 for(const line of markdown.split(/\r?\n/)) {
  const h=line.match(heading);
  if(h){const name=(h[1]||h[2]).toLowerCase().trim();section=name==='how i reply'?'samples':name.replace(/-/g,' ').includes('never say')?'never':'';if(section!=='samples')ruleLines.push(line);continue;}
  if(section==='samples'){
   const b=line.match(bullet)?.[1];
   if(!b){if(line.trim())skipped++;continue;}
   const sample=normalizeSample(b);
   if(sample===null||!sample){skipped++;continue;}
   if(samples.includes(sample))continue;
   if(samples.length===MAX_SAMPLES){skipped++;continue;}
   samples.push(sample);continue;
  }
  ruleLines.push(line);
  if(section!=='never')continue;
  const b=line.match(bullet)?.[1]; if(!b) continue; const qs=[...b.matchAll(quoted)].map(m=>m[1]||m[2]||m[3]);
  const plain=b.replace(/[*_`]/g,'').trim().replace(/[.,;:!]+$/,'').trim(); if(qs.length) never.push(...qs); else if(plain && plain.split(/\s+/).length<=5) never.push(plain); else skipped++;
 }
 const rulesText=ruleLines.join('\n');
 const dash=/(?:\b(?:no|zero|never|avoid|ban(?:ned)?|don'?t|without|cut)\b[^\n]{0,40}\bem[- ]?dash|em[- ]?dash(?:es)?\b[^\n]{0,20}\b(?:banned|never))/i;
 return {never:dedupe(never.map(x=>x.trim())),noDashes:dash.test(rulesText),statementEndings:/statements?,? not questions|end (?:posts |each post )?(?:on|with) (?:a )?statements?/i.test(rulesText),samples,skipped};
}
export const merge=(rules:Rules, found:Found):Rules=>({...rules,never:dedupe([...rules.never,...found.never]),noDashes:rules.noDashes||found.noDashes,statementEndings:rules.statementEndings||found.statementEndings,samples:[...new Set([...normalizeSamples(rules.samples)??[],...normalizeSamples(found.samples)??[]])].slice(0,MAX_SAMPLES)});

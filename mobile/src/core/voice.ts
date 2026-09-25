import { Hit, Rules, matcher, NEVER_SAY, LONG_DASH, ENDS_ON_QUESTION } from './slop';
export type Found = { never: string[]; noDashes: boolean; statementEndings: boolean; skipped: number };
const heading = /^\s*(?:#{1,6}\s+(.+?)\s*#*|\*\*([^*]+)\*\*:?)\s*$/;
const bullet = /^\s*(?:[-*+•]|\d+[.)])\s+(.+)$/;
const quoted = /"([^"\n]+)"|“([^”\n]+)”|`([^`\n]+)`/g;
const dedupe = (xs: string[]) => xs.filter(x => x.trim()).filter((x,i,a)=>a.findIndex(y=>y.toLocaleLowerCase()===x.toLocaleLowerCase())===i);
export function parse(markdown: string): Found {
 const never:string[]=[]; let skipped=0, inNever=false;
 for(const line of markdown.split(/\r?\n/)) { const h=line.match(heading); if(h){inNever=(h[1]+h[2]).toLowerCase().replace(/-/g,' ').includes('never say'); continue;} if(!inNever) continue;
  const b=line.match(bullet)?.[1]; if(!b) continue; const qs=[...b.matchAll(quoted)].map(m=>m[1]||m[2]||m[3]);
  const plain=b.replace(/[*_`]/g,'').trim().replace(/[.,;:!]+$/,'').trim(); if(qs.length) never.push(...qs); else if(plain && plain.split(/\s+/).length<=5) never.push(plain); else skipped++;
 }
 const dash=/(?:\b(?:no|zero|never|avoid|ban(?:ned)?|don't|without|cut)\b[^\n]{0,40}\bem[- ]?dash|em[- ]?dash(?:es)?\b[^\n]{0,20}\b(?:banned|never))/i;
 return {never:dedupe(never.map(x=>x.trim())),noDashes:dash.test(markdown),statementEndings:/statements?,? not questions|end (?:posts |each post )?(?:on|with) (?:a )?statements?/i.test(markdown),skipped};
}
export const merge=(rules:Rules, found:Found):Rules=>({...rules,never:dedupe([...rules.never,...found.never]),noDashes:rules.noDashes||found.noDashes,statementEndings:rules.statementEndings||found.statementEndings});
export { matcher };
export function guide(r:Rules,post:boolean){return [r.noDashes?'No em dashes.':null,r.statementEndings&&post?'End on a statement, not a question.':null,r.note.trim()?`How they write: ${r.note.trim().slice(0,200)}`:null].filter(Boolean).join(' ')}
export function broken(hits:Hit[],text:string,r:Rules){const out:string[]=[];const phrases=hits.filter(h=>h.reason===NEVER_SAY).map(h=>'“'+text.slice(h.start,h.end)+'”').filter((x,i,a)=>a.findIndex(y=>y.toLowerCase()===x.toLowerCase())===i);if(phrases.length)out.push('says '+phrases.join(', ')+' from your never-say list');if(r.noDashes&&hits.some(h=>h.reason===LONG_DASH))out.push('has a long dash (—)');if(hits.some(h=>h.reason===ENDS_ON_QUESTION))out.push('ends on a question');return out;}

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import * as Voice from '../voice';
import * as Slop from '../slop';
import * as Judge from '../judge';
import * as Drafts from '../drafts';
import * as Platforms from '../platforms';
const fixture=readFileSync(join(__dirname,'voice-fixture.md'),'utf8');
const voice:Slop.Rules={never:['circle the wagons','low-hanging fruit',"don't worry",'AI'],noDashes:true,statementEndings:true,note:''};
const marked=(text:string,post=false)=>Slop.hits(text,voice,post).filter(h=>h.reason===Slop.NEVER_SAY||h.reason===Slop.ENDS_ON_QUESTION).map(h=>text.slice(h.start,h.end));
test('importsNeverSayBulletsAndRules',()=>{const f=Voice.parse(fixture);expect(f.never).toEqual(['circle the wagons','low-hanging fruit','synergy','Hand on heart','wheelhouse']);expect(f.skipped).toBe(1);expect(f.noDashes).toBe(true);expect(f.statementEndings).toBe(true);});
test('importsNothingFromOtherSections',()=>{const f=Voice.parse('# Me\n## Diction\n- "delve"\n- Uses em dashes a lot — like this.\n## Endings\nAsk questions freely.');expect(f.never).toEqual([]);expect(f.noDashes).toBe(false);expect(f.statementEndings).toBe(false);});
test('readsBoldHeadingsAndZeroEmDashes',()=>{const f=Voice.parse('**Never say:**\n* per my last email\n\nZero em-dashes, ever.');expect(f.never).toEqual(['per my last email']);expect(f.noDashes).toBe(true);});
test('importsDashRuleWithoutApostrophe',()=>{const rules=Voice.parse('Dont use em dashes');expect(rules.noDashes).toBe(true);expect(Voice.guide({...Slop.NO_RULES,noDashes:rules.noDashes},true)).toContain('No em dashes.');});
test('mergeAddsWithoutDuplicatesOrSwitchingOff',()=>{const r=Voice.merge({never:['Synergy'],noDashes:false,statementEndings:true,note:'blunt'},Voice.parse(fixture));expect(r.never).toEqual(['Synergy','circle the wagons','low-hanging fruit','Hand on heart','wheelhouse']);expect(r.noDashes&&r.statementEndings).toBe(true);expect(r.note).toBe('blunt');});
test('mobileImportsKeepReplySamplesAndMergeThemBounded',()=>{
 const found=Voice.parse('## Never say\n- synergy\n## How I reply\n- private reply\nunsupported prose\n## Never-say\n- circle back');
 expect(found).toEqual({never:['synergy','circle back'],noDashes:false,statementEndings:false,samples:['private reply'],skipped:1});
 const base={never:['Synergy'],noDashes:false,statementEndings:true,note:'blunt'};
 expect(Voice.merge(base,found)).toEqual({...base,never:['Synergy','circle back'],samples:['private reply']});
 const withSamples={...base,samples:['already stored']};
 expect(Voice.merge(withSamples,{...found,samples:['unpreviewed reply',...Array.from({length:8},(_,i)=>`extra ${i}`)]})).toEqual({...withSamples,never:['Synergy','circle back'],samples:['already stored','unpreviewed reply',...Array.from({length:8},(_,i)=>`extra ${i}`)]});
 expect(Voice.parse('**How I reply:**\n- No em dashes.\n- end on a statement')).toEqual({never:[],noDashes:true,statementEndings:true,samples:[],skipped:0});
});
test('matchesNeverSayPhrases',()=>{expect(marked('Time to Circle  the\nwagons, team.')).toEqual(['Circle  the\nwagons']);expect(marked('Grab the low-hanging fruit first.')).toEqual(['low-hanging fruit']);expect(marked('Don’t worry about it.')).toEqual(['Don’t worry']);expect(marked('The AI wrote it.')).toEqual(['AI']);expect(marked('She said it again. Maintain the pace.')).toEqual([]);expect(marked('We circled the wagons.')).toEqual([]);});
test('reasonSaysNeverSayList',()=>{expect(Slop.hits('low-hanging fruit',voice)[0].reason).toBe('on your never-say list');});
test('endingQuestionOnlyInPosts',()=>{expect(marked('Shipped it. Who else ships on Fridays?',true)).toEqual(['Who else ships on Fridays?']);expect(marked('Shipped it. Who else ships on Fridays?')).toEqual([]);expect(marked('Shipped it on a Friday.',true)).toEqual([]);});
test('rulesDecideSoundsLikeYou',()=>{const answer='GENERIC: 2\nSPECIFICITY: 8\nSPECIFIC: pass\nCLEAR: pass\nVOICE: pass - fine\nFITS: pass\nCLAIMS: pass';const s=Judge.scoreDraft("Let's circle the wagons — who's in?",answer,false,voice,true);const check=s.quality.find(x=>x.name==="Doesn't sound like you")!;expect(check.ok).toBe(false);expect(check.reason).toBe('Breaks your rules: says “circle the wagons” from your never-say list; has a long dash (—); ends on a question.');expect(s.quality.map(x=>x.name)).toEqual(['Says something real','One clear point',"Doesn't sound like you",'Fits the conversation',"Doesn't make anything up"]);expect(Judge.scoreDraft('Saturday works.',answer,false,voice,true).quality.find(x=>x.name==='Sounds like you')?.ok).toBe(true);});
test('guideIsShortAndSkipsEndingsInReplies',()=>{const r={...voice,note:'short, lowercase'};expect(Voice.guide(r,false)).toBe('No em dashes. Never use: "circle the wagons", "low-hanging fruit", "don\'t worry", "AI". How they write: short, lowercase');expect(Voice.guide(r,true)).toBe('No em dashes. End on a statement, not a question. Never use: "circle the wagons", "low-hanging fruit", "don\'t worry", "AI". How they write: short, lowercase');expect(Voice.guide({...Slop.NO_RULES,never:Array.from({length:40},(_,i)=>`phrase number ${i}`)},true)).toBe('Never use: "phrase number 0", "phrase number 1", "phrase number 2", "phrase number 3", "phrase number 4", "phrase number 5", "phrase number 6", "phrase number 7", "phrase number 8", "phrase number 9".');expect(Voice.guide({...Slop.NO_RULES,note:'x'.repeat(900)},true)).toHaveLength(216);});

test('writersShareOneBudgetedSampleSelectionWithFit',async()=>{
 const base:Slop.Rules={never:['synergy'],noDashes:true,statementEndings:true,note:'n'.repeat(200)};
 const profile:Slop.Rules={...base,samples:['a'.repeat(155),'b'.repeat(155),...Array.from({length:8},(_,i)=>String(i).repeat(1000))]};
 // The writer and the fit call select once: the same two shortest that hold the budget.
 const picked=Voice.selectedGuide(profile,true);
 expect(picked.samples).toHaveLength(2);
 expect(picked.line.length).toBeLessThanOrEqual(700);
 expect(Voice.guide(profile,true)).toBe(picked.line);
 expect(picked.line).toContain("Replies they wrote (match this voice, don't copy)");
 // A fat profile drops the samples before breaking the phone floor, on every platform.
 for(const app of ['com.twitter.android','com.linkedin.android','com.reddit.frontpage','com.Slack','com.whatsapp','com.google.android.gm','com.example.other']){
  const platform=Platforms.platformForApp(app);
  // Grow adds their reply so far (`point`) on X, LinkedIn and Reddit; the budget holds with it too.
  for(const point of app === 'com.twitter.android' || app === 'com.linkedin.android' || app === 'com.reddit.frontpage' ? [undefined, 'Saturday works for me'] : [undefined]){
   const input={latest:'Sam: Saturday?',conversation:'Sam: Saturday?',point,platform,samples:picked.samples};
   const prompt=Drafts.phoneReplyPrompt(input);
   expect(prompt).toBe(Drafts.phoneReplyPrompt({...input,samples:[]}));
   expect(prompt.split('\n\nLatest message:')[0].length).toBeLessThanOrEqual(700);
   const slot=Drafts.phoneSlotPrompt(Drafts.slotsFor(platform)[0],input,[]);
   expect(slot).toBe(Drafts.phoneSlotPrompt(Drafts.slotsFor(platform)[0],{...input,samples:[]},[]));
  }
 }
 // Short samples ride the roomy phone prompts with their label, still inside the floor.
 const short=['Sounds good.',"I'm in.",'See you at eight.'];
 const gmail=Platforms.platformForApp('com.google.android.gm');
 const carried=Drafts.phoneReplyPrompt({latest:'Sam: Saturday?',conversation:'Sam: Saturday?',platform:gmail,samples:short});
 expect(carried).toContain("Replies they wrote (match this voice, don't copy)");
 expect(carried).toContain('"Sounds good."');
 expect(carried.split('\n\nLatest message:')[0].length).toBeLessThanOrEqual(700);
 const prompts:string[]=[];
 await Judge.rewrite({ask:async(prompt:string)=>{prompts.push(prompt);return JSON.stringify({versions:['Typed, shorter.','Typed, first.']});}},'Typed.','Screen.',picked.line,()=>{},'remove');
 expect(prompts).toEqual([Judge.rewritePrompt('Typed.','Screen.',picked.line,'remove')]);
 expect(prompts[0]).toContain("Replies they wrote (match this voice, don't copy)");
});

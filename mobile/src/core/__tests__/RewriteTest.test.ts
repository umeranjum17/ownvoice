import {RewriteEngine,versionsList,versions,clean,rewrite,rewritePrompt,versionPrompt,Rewrite,rewriteAsk,selectionRewritePrompt,tonePrompt,parseTones,cleanTone,toneLine} from '../judge';
test('readsTheVersions',()=>{expect(versions('{"versions":["hey, i\'m in","in","i\'m in, see you at 7"]}')).toEqual(["hey, i'm in",'in',"i'm in, see you at 7"]);const fenced='Sure:\n```json\n{ "versions" : [\n  "line one\\nline \\"two\\"",\n  "caf\\u00e9 at 9" ,"a\\\\b"\n] }\n```';expect(versions(fenced)).toEqual(['line one\nline "two"','café at 9','a\\b']);expect(versions('["one", "two"]')).toEqual([]);});
test('keepsQuotedStructuredDraftText',async()=>{const json='{"versions":["\\\"OK\\\""," keep this ","third"]}';expect(versions(json)).toEqual(['"OK"',' keep this ','third']);const {got,landed}=await run(new Fake(json));expect(got.map(x=>x[1])).toEqual(['"OK"',' keep this ']);expect(landed).toContain('TIGHTER="OK"');});
test('readsVersionsAsTheyLand',()=>{const full='{"versions":["first one","second\\none","third"]}';const seen=[...full].map((_,i)=>versions(full.slice(0,i+1)).length);expect(seen).toEqual([...seen].sort((a,b)=>a-b));expect([...new Set(seen)]).toEqual([0,1,2,3]);expect(versions('{"versions":["first one","sec')).toEqual(['first one']);expect(versions('{"versions":["first one","a\\u00')).toEqual(['first one']);});
test('notJsonGivesNothing',()=>{expect(versions('ya im in, might be 10 min late')).toEqual([]);expect(versions('{"drafts":["a"]}')).toEqual([]);expect(versions('{"versions":["", "  "]}')).toEqual(['','  ']);});
test('rejectsInvalidEscapesWithoutChangingDrafts',()=>{expect(versions('{"versions":["a\\q","safe"]}')).toEqual([]);expect(versions('{"versions":["a\\u00zz","safe"]}')).toEqual([]);expect(versions('{"versions":["safe","a\\q"]}')).toEqual(['safe']);});
test('promptsCarryTheTextScreenAndRules',()=>{const p=rewritePrompt('ya im in','bro are you still up for padel','No em dashes.');expect(p.endsWith('Screen (context only):\nbro are you still up for padel\n\nTheir text:\nya im in\n\nTheir rules and note: No em dashes.')).toBe(true);expect(p).toContain('{"versions"');expect(p).toContain('1. Shorter:');expect(p).toContain('strictly fewer words');expect(p).toContain('\n2. Main point first:');expect(p).toContain('Actually reorder');expect(rewritePrompt('ya im in','','')).toContain('(none)');const one=versionPrompt('ya im in','',versionsList[1]);expect(one).toContain(versionsList[1].ask);expect(one).not.toContain(versionsList[0].ask);expect(one).not.toContain('JSON');});
class Fake implements RewriteEngine{calls:string[]=[];constructor(private json:string|null,private partials:string[]=[]){ }async ask(prompt:string,_max:number,partial?:(text:string)=>void){if(prompt.includes('{"versions"')){this.calls.push('all');this.partials.forEach(x=>partial?.(x));if(this.json===null)throw new Error('Your phone is busy. Try again in a moment.');return this.json;}const v=versionsList.find(x=>prompt.includes(x.ask))!;this.calls.push(v.name);return v.name==='TIGHTER'&&this.json===''?'':`Here's the new version:\n"${v.label} of it"`;}}
async function run(engine:Fake){const landed:string[]=[];const got=await rewrite(engine,'ya im in','','',(v,t)=>landed.push(`${v.name}=${t}`));return {got,landed};}
test('streams only the two writer versions and keeps their labels', async () => {
  const engine = new Fake('{"versions":["shorter","first"]}', ['{"versions":["shorter",']);
  const { got, landed } = await run(engine);
  expect(engine.calls).toEqual(['all']);
  expect(got).toEqual([[versionsList[1], 'shorter'], [versionsList[2], 'first']]);
  expect(landed).toEqual(['TIGHTER=shorter', 'FIRST=first']);
});
test('fallbacks request only missing writer versions', async () => {
  const engine = new Fake('not json');
  const { got } = await run(engine);
  expect(engine.calls).toEqual(['all', 'TIGHTER', 'FIRST']);
  expect(got.map(([version]) => version.name)).toEqual(['TIGHTER', 'FIRST']);
  const cut = new Fake('{"versions":["shorter","cut');
  expect((await run(cut)).landed).toEqual(['TIGHTER=shorter', 'FIRST=Main point first of it']);
  expect(cut.calls).toEqual(['all', 'FIRST']);
});
test('empty writer slots and extra answers never create a Cleaned up writer card', async () => {
  const engine = new Fake('{"versions":["","first","extra"]}');
  expect((await run(engine)).got.map(([version, text]) => [version.name, text])).toEqual([
    ['TIGHTER', 'Shorter of it'], ['FIRST', 'first'],
  ]);
  expect(engine.calls).toEqual(['all', 'TIGHTER']);
  expect((await run(new Fake(''))).got.map(([version]) => version.name)).toEqual(['FIRST']);
});
test('later writer fallback survives a failed first fallback', async () => {
  const calls: string[] = [];
  const error = new Error('busy');
  const engine: RewriteEngine = { async ask(prompt) {
    if (prompt.includes('{"versions"')) return 'not json';
    const version = versionsList.find(v => prompt.includes(v.ask))!;
    calls.push(version.name);
    if (version.name === 'TIGHTER') throw error;
    return 'main point first';
  } };
  expect((await rewrite(engine, 'ya im in', '', '', () => {})).map(([v,t]) => [v.name,t])).toEqual([['FIRST','main point first']]);
  expect(calls).toEqual(['TIGHTER', 'FIRST']);
  await expect(rewrite({ ask: async prompt => { if (prompt.includes('{"versions"')) return 'not json'; throw error; } }, 'ya im in', '', '', () => {})).rejects.toBe(error);
});
test('anErrorBeforeAnyVersionReachesTheUser',async()=>{await expect(run(new Fake(null))).rejects.toBeInstanceOf(Error);});
// Slice 8 (R3): the selection-menu chips and their prompts, word for word from the Kotlin Judge.Rewrite and Judge.rewritePrompt.
test('selection chips deliver the full-stop instruction only for Fix spelling',()=>{
  expect([Rewrite.TIGHTEN,Rewrite.PLAINER,Rewrite.GRAMMAR,Rewrite.FRIENDLIER,Rewrite.FIRMER]).toEqual(['Shorter','Simpler','Fix spelling','Friendlier','Firmer']);
  expect(selectionRewritePrompt('Hi',Rewrite.FRIENDLIER)).toContain(rewriteAsk[Rewrite.FRIENDLIER]);
  expect(selectionRewritePrompt('Hi',Rewrite.FIRMER)).toContain(rewriteAsk[Rewrite.FIRMER]);
  expect(selectionRewritePrompt('Hi',Rewrite.FRIENDLIER)).not.toContain('do not add a full stop');
  expect(selectionRewritePrompt('Hi',Rewrite.FIRMER)).not.toContain('do not add a full stop');
  expect(selectionRewritePrompt('Hi',Rewrite.TIGHTEN)).toContain(rewriteAsk[Rewrite.TIGHTEN]);
  expect(selectionRewritePrompt('Hi',Rewrite.PLAINER)).toContain(rewriteAsk[Rewrite.PLAINER]);
  expect(selectionRewritePrompt('Hi',Rewrite.GRAMMAR)).toContain(rewriteAsk[Rewrite.GRAMMAR]);
  expect(selectionRewritePrompt('Hi',Rewrite.GRAMMAR)).toContain('If the input is a single word without punctuation, do not add a full stop.');
  expect(selectionRewritePrompt('Hi',Rewrite.TIGHTEN)).not.toContain('do not add a full stop');
  expect(selectionRewritePrompt('Hi',Rewrite.PLAINER)).not.toContain('do not add a full stop');
  expect(selectionRewritePrompt('Hi',Rewrite.GRAMMAR,'no dashes')).toContain("Follow the writer's rules: no dashes ");
});
test('tonePromptNamesOneWordPerTextAndParsesOnlyCleanOnes',()=>{
  const prompt=tonePrompt(['Fine. Do whatever you want.','Thanks so much!']);
  expect(prompt).toContain('1: Fine. Do whatever you want.');
  expect(prompt).toContain('2: Thanks so much!');
  expect(parseTones('1: a bit sharp\n2: friendly')).toEqual(['a bit sharp','friendly']);
  expect(parseTones('Sure! Here you go:\n1: Friendly.\n2: "warm"')).toEqual(['friendly','warm']);
  expect(parseTones('no numbered lines here')).toEqual([]);
  expect(parseTones(null)).toEqual([]);
  expect(parseTones('1: the on-device model is ready')).toEqual([]);
  expect(parseTones('1: quite extraordinarily and remarkably verbose today')).toEqual([]);
  expect(cleanTone('Friendly.')).toBe('friendly');
  expect(cleanTone('42')).toBe(null);
  expect(toneLine('friendly')).toBe('Sounds friendly');
  expect(toneLine('a bit sharp')).toBe('Sounds a bit sharp');
});
// S05 (offline-model study §5.1): selection Shorter/Simpler on a numbered list must
// ask the model to keep the lines, or every model flattens it to one line.
test('selectionPromptKeepsListLines',()=>{
  const list='Please bring the tent\n1. Pack the stove\n2. Meet Saturday at noon';
  for(const how of [Rewrite.TIGHTEN,Rewrite.PLAINER]){
    const prompt=selectionRewritePrompt(list,how);
    expect(prompt).toContain('Keep its line breaks and list markers (1. 2. or -) exactly, one item per line.');
    expect(prompt).toContain(list);
  }
});

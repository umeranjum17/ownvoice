import * as S from '../slop';
import * as V from '../voice';
import * as J from '../judge';
import * as P from '../privacy';
import * as O from '../onboarding';
import { message } from '../nano';
import { words } from '../words';

test('stock phrases, Unicode and number normalization',()=>{
 expect(S.hits("Let's dive in").length).toBeGreaterThan(0);
 expect(S.matcher("don't").test('don’t')).toBe(true);
 expect(S.addedNumbers('It is 1,000 at 9.30','It is 1000 at 9:30')).toEqual([]);
 expect(S.addedNumbers('We met','We met in 2025')).toEqual(['2025']);
});
test('voice import, merge, guide and rule breaks',()=>{
 const found=V.parse('# Never Say\n- “game changer”\n- circle back\n# Rules\n- no em dash\n');
 expect(found.never).toEqual(['game changer','circle back']);
 expect(V.merge({never:[],noDashes:false,statementEndings:false,note:''},found).noDashes).toBe(true);
 expect(V.matcher("don't").test('dont')).toBe(false);
 expect(V.guide({...S.NO_RULES,noDashes:true},true)).toContain('No em dashes.');
});
test('judge parsing, checks, prompts, rewrite and meaning',()=>{
 expect(J.parse('**VOICE**: pass - sounds like you').VOICE).toMatch(/pass/);
 expect(J.number('11')).toBe(10);
 expect(J.meaning('I have 3','I have 4',null)?.ok).toBe(false);
 expect(J.clean('Here is a rewrite:\n"Hello."')).toBe('Hello.');
 expect(J.versions('{"versions":["one","two","three"]}')).toEqual(['one','two','three']);
 expect(J.kindPrompt('hello')).toContain('MESSAGE');
});
test('privacy encoding, retention, summary and defaults',()=>{
 const r={time:10,app:'pkg',label:'Chat',summary:'Read it'};
 expect(P.decode(P.encode(r))).toEqual(r);
 expect(P.allowed('com.whatsapp')).toBe(true);
 expect(P.keep([r],10+P.KEEP_MS)).toHaveLength(0);
 expect(P.summary('EMPTY','','')).toContain('Nothing was on screen');
});
test('onboarding transitions and message words',()=>{
 expect(O.first(false)).toBe('WELCOME');
 expect(O.next('WELCOME',false,false,true)).toBe('PERMISSION');
 expect(O.next('TRY',true,false,false)).toBe('DONE');
 expect(O.finish('TRY').setUp).toBe(true);
 expect(message(999)).toBe(words.failed);
});

import fs from 'node:fs';
import * as Slop from './src/packages/engine/src/slop.ts';
import * as Voice from './src/packages/engine/src/voice.ts';
const root='/home/umer/lab-tmp/ov-agent-a5-live';
const fixture=JSON.parse(fs.readFileSync(`${root}/src/mobile/e2e/agent-tasks.json`));
const rules={...Slop.NO_RULES,...fixture.voice};
const rows=[];
for(const t of fixture.tasks)for(const mode of ['loop','script']){
 const path=`${root}/captures/${mode}-${t.id}/events.json`;if(!fs.existsSync(path))continue;
 const d=JSON.parse(fs.readFileSync(path));const ev=d.events,start=ev.find(e=>e.event==='start')?.at;
 const displays=ev.filter(e=>e.event==='display'&&e.latest.trim());
 const final=displays.at(-1)?.latest??'';
 const first=ev.filter(e=>e.event==='first-text'||e.event==='display'&&e.latest.trim()).at(0)?.at;
 const ready=displays.find(e=>e.latest===final)?.at;
 const done=ev.find(e=>e.event==='done');
 const calls=ev.filter(e=>e.event==='response').flatMap(e=>e.turn.calls);
 const approvals=ev.filter(e=>e.event==='approval'),reply=ev.find(e=>e.event==='reply');
 const checkProblems=Voice.broken(Slop.hits(final,rules),final,rules);
 const added=Slop.addedNumbers(t.task,final),dropped=Slop.addedNumbers(final,t.task),names=t.names.filter(n=>!final.includes(n));
 rows.push({task:t.id,mode,final,finalLine:done?.out.text??'',callCount:ev.filter(e=>e.event==='request').length,steps:done?.out.steps,stop:done?.out.stop,toolNames:calls.map(c=>c.name),approvalCount:approvals.length,reply:reply?.yes,firstSeconds:(first-start)/1000,noteSeconds:(ready-start)/1000,endSeconds:(done?.at-start)/1000,P1:!added.length&&!dropped.length&&!names.length,added,dropped,missingNames:names,P2:!checkProblems.length&&(t.id!==4||mode==='script'||calls.some(c=>c.name==='check_voice')),checkProblems,P4:t.id===6?!!reply&&reply.yes===false&&!ev.some(e=>e.event==='request'&&e.at>reply.at)&&done?.out.stop==='declined':t.id<5?approvals.length===1:approvals.length===1,P5:ev.filter(e=>e.event==='request').length<=6,P6:t.id===5?calls.every(c=>['check_voice','share_note'].includes(c.name))&&/can[’']?t.*email|cannot.*email/i.test(done?.out.text??'')&&/calendar/i.test(done?.out.text??'')&&/share/i.test(done?.out.text??''):null});
}
fs.writeFileSync(`${root}/evaluated.json`,JSON.stringify(rows,null,2));
for(const r of rows)console.log(JSON.stringify(r));

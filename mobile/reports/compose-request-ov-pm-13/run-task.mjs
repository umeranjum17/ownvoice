import {execFileSync,spawn} from 'node:child_process';
import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='/home/umer/lab-tmp/ov-pm-13';
const serial='emulator-5684';
const [mode='loop',taskId='1']=process.argv.slice(2);
const out=`${root}/captures/${mode}-${taskId}`;
mkdirSync(out,{recursive:true});
const adb=(...a)=>execFileSync('adb',['-s',serial,...a],{encoding:'utf8',maxBuffer:16*1024*1024});
if(!adb('emu','avd','name').startsWith('ownvoice-signed'))throw Error('Wrong AVD');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const snap=name=>{adb('shell','screencap','-p',`/sdcard/a5-${name}.png`);adb('pull',`/sdcard/a5-${name}.png`,`${out}/${name}.png`);};
const events=()=>adb('logcat','-d','-s','ReactNativeJS:I').split('\n').filter(x=>x.includes('A5LIVE ')).map(x=>{try{return JSON.parse(x.slice(x.indexOf('A5LIVE ')+7));}catch{return null;}}).filter(Boolean);
let pid='';try{pid=adb('shell','pidof','dev.ownvoice.next').trim();}catch{}
if(pid)adb('shell','su','0','kill','-9',...pid.split(' '));
adb('logcat','-c');
adb('shell','am','start','-a','android.intent.action.VIEW','-d',`'ownvoice://agent?mode=${mode}&taskId=${taskId}'`);
await sleep(2800);
snap('empty');
const recording=spawn('adb',['-s',serial,'shell','screenrecord','--bit-rate','2000000','--time-limit','120',`/sdcard/a5-${mode}-${taskId}.mp4`],{stdio:['ignore','ignore','ignore']});
await sleep(300);
adb('shell','input','tap','540','2200');
let approved=false,seenShare=false,finished=false;
const polling=[];
for(let n=0;n<100;n++){
 await sleep(1000);
 const ev=events();
 const approval=ev.find(e=>e.event==='approval');
 const failure=ev.find(e=>e.event==='failure');
 const done=ev.find(e=>e.event==='done');
 polling.push({hostAt:Date.now(),events:ev.length});
 if(approval&&!approved){
   let previous='', stable=false;
   for(let frame=0;frame<20;frame++){
     snap(`approval-frame-${frame}`);
     const file=`${out}/approval-frame-${frame}.png`;
     const hash=createHash('sha256').update(readFileSync(file)).digest('hex');
     const pix=execFileSync('magick',[file,'-depth','8','rgb:-'],{maxBuffer:12*1024*1024});
     let colour=0;for(let n=0;n<pix.length;n+=3)if(Math.abs(pix[n]-71)<8&&Math.abs(pix[n+1]-93)<8&&Math.abs(pix[n+2]-146)<8)colour++;
     if(hash===previous&&colour>4000){writeFileSync(`${out}/share.png`,readFileSync(file));stable=true;break;}
     previous=hash;await sleep(500);
   }
   if(!stable)throw Error('Approval frame never stabilized with expected button colour');
   seenShare=true;
   // Locate the filled Share button by its rendered colour, excluding the footer.
   // OCR can read the heading while missing white text on the filled button.
   const rgb=execFileSync('magick',[`${out}/share.png`,'-depth','8','rgb:-'],{maxBuffer:12*1024*1024});
   const width=1080, rows=[];
   const blue=(x,y)=>{const n=(y*width+x)*3;return Math.abs(rgb[n]-71)<8&&Math.abs(rgb[n+1]-93)<8&&Math.abs(rgb[n+2]-146)<8;};
   for(let y=600;y<2100;y++){let count=0;for(let x=80;x<380;x++)if(blue(x,y))count++;if(count>100)rows.push(y);}
   if(!rows.length)throw Error('Cannot locate filled Share button');
   const y=(rows[0]+rows.at(-1))/2;
   const xs=[];for(let x=80;x<380;x++)if(blue(x,Math.round(y)))xs.push(x);
   if(!xs.length)throw Error('Cannot locate Share button width');
   let x=(xs[0]+xs.at(-1))/2;
   if(taskId==='6'){
     const text=[];for(let py=Math.round(y)-30;py<y+30;py++)for(let px=xs.at(-1)+40;px<800;px++)if(blue(px,py))text.push(px);
     if(!text.length)throw Error('Cannot locate Not now label');
     x=(Math.min(...text)+Math.max(...text))/2;
   }
   adb('shell','input','tap',String(Math.round(x)),String(Math.round(y)));
   await sleep(400);
   if(!events().some(e=>e.event==='reply'))throw Error('Approval tap did not reach reply handler');
   approved=true;
   if(taskId!=='6'){await sleep(900);snap('sheet');adb('shell','input','keyevent','KEYCODE_BACK');}
 }
 if(failure||done){await sleep(1000);snap('done');finished=true;break;}
}
recording.kill('SIGINT');
// Device-side screenrecord must close its file before pull.
try {const rec=adb('shell','pidof','screenrecord').trim();if(rec)adb('shell','su','0','kill','-2',...rec.split(' '));}catch{}
await sleep(600);
try{adb('pull',`/sdcard/a5-${mode}-${taskId}.mp4`,`${out}/run.mp4`);}catch{}
const ev=events();writeFileSync(`${out}/events.json`,JSON.stringify({mode,taskId,seenShare,finished,events:ev,polling},null,2));
console.log(JSON.stringify({mode,taskId,seenShare,finished,events:ev},null,2));
if(!finished)process.exitCode=2;

import { Mode } from './judge';
export const DEFAULT_ON=new Set(['com.twitter.android','com.linkedin.android','com.google.android.gm','com.whatsapp','com.whatsapp.w4b']);
export const KEEP_MS=30*24*60*60*1000;
export type Read={time:number;app:string;label:string;summary:string};
export const allowed=(app:string,choice?:boolean|null)=>choice??DEFAULT_ON.has(app);
export const keep=(reads:Read[],now:number)=>reads.filter(r=>now-r.time<KEEP_MS);
export function encode(r:Read){return [r.time,r.app,r.label,r.summary].map(x=>String(x).replace(/[\t\n\r]/g,' ')).join('\t');}
export function decode(s:string):Read|null{const f=s.split('\t');if(f.length!==4||!Number.isFinite(Number(f[0])))return null;return {time:Number(f[0]),app:f[1],label:f[2],summary:f[3]};}
export function summary(mode:Mode,conversation:string,typed:string){const ran=mode==='REPLY'?'Suggested replies':mode==='COMPOSE'?'Polished your message':'Nothing to help with';const read=[conversation.trim()?'the chat on screen':'',typed.trim()?'your message':''].filter(Boolean);return `${ran}. ${read.length?'Read '+read.join(' and ')+'.':'Nothing was on screen.'}`;}
const OLD=/^(Reply drafts|Compose boost|Nothing to work on)\. (\d+) characters on screen, (\d+) in your field\.$/;
export function plain(s:string){const m=s.match(OLD);return m?summary(m[1]==='Reply drafts'?'REPLY':m[1]==='Compose boost'?'COMPOSE':'EMPTY',m[2]!=='0'?'x':'',m[3]!=='0'?'x':''):s;}

export const STEPS = ['WELCOME','PERMISSION','TRY','APPS','CHATGPT','DONE'] as const;
export type Step = typeof STEPS[number];
export const offered=[['com.twitter.android','X'],['com.linkedin.android','LinkedIn'],['com.reddit.frontpage','Reddit'],['com.Slack','Slack'],['com.whatsapp','WhatsApp'],['com.google.android.gm','Gmail']] as const;
export function offeredApps(installed:(packageName:string)=>boolean){return offered.filter(([pkg])=>installed(pkg));}
export const first=(setUp:boolean):Step=>setUp?'PERMISSION':'WELCOME';
export function next(step:Step,on:boolean,setup:boolean,apps:boolean):Step {
 if(step==='WELCOME')return on?'TRY':'PERMISSION';
 if(step==='PERMISSION')return setup?'DONE':on?'TRY':apps?'APPS':'CHATGPT';
 if(step==='TRY')return apps?'APPS':'CHATGPT';
 if(step==='APPS')return 'CHATGPT';
 return 'DONE';
}

export const STEPS = ['WELCOME','CHOOSE','PERMISSION','TRY','APPS','DONE'] as const;
export type Step = typeof STEPS[number];
export const offered=[['com.twitter.android','X'],['com.linkedin.android','LinkedIn'],['com.reddit.frontpage','Reddit'],['com.Slack','Slack'],['com.whatsapp','WhatsApp'],['com.google.android.gm','Gmail']] as const;
export function offeredApps(installed:(packageName:string)=>boolean){return offered.filter(([pkg])=>installed(pkg));}
export const first=(setUp:boolean):Step=>setUp?'PERMISSION':'WELCOME';
/** A saved step from an older version (the removed CHATGPT offer, its last step) counts as done. */
export const known=(step:unknown):Step|null=>STEPS.includes(step as Step)?step as Step:step?'DONE':null;
/** The step after this one. "Not now" on the choice, when the phone can't write, ends setup instead (setup.tsx). */
export function next(step:Step,on:boolean,setup:boolean,apps:boolean):Step {
 if(step==='WELCOME')return 'CHOOSE';
 if(step==='CHOOSE')return on?'TRY':'PERMISSION';
 if(step==='PERMISSION')return setup?'DONE':on?'TRY':apps?'APPS':'DONE';
 if(step==='TRY')return apps?'APPS':'DONE';
 return 'DONE';
}

import { words } from './words';
export const ERROR_CODES=[0,4,7,8,9,11,12,-100,15,16,27,30,501,604,-101,-102,-103,-104,-105,-106,-107] as const;
export function message(code:number):string { switch(code){case 9:return words.busy;case 27:return words.batteryQuota;case 30:return words.backgroundBlocked;case 501:return words.noSpace;case 12:return words.requestTooLarge;case 16:case 8:case -101:return words.unsupported;case 604:return words.systemUpdate;default:return words.failed;} }

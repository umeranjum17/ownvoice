import { words } from './words';
export function message(code:number):string { switch(code){case 1:return words.busy;case 2:return words.batteryQuota;case 3:return words.backgroundBlocked;case 4:return words.noSpace;case 5:return words.requestTooLarge;case 6:case 7:case 8:return words.unsupported;case 9:return words.systemUpdate;default:return words.failed;} }

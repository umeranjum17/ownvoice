import { words } from './words';
import { billingOf, cardOf, hasOwnScreen, nameOf, type CloudKey } from '../chatgpt/cards';

/** The plain lines of one connected account that is not one of the first four. The wording is theirs (the OpenRouter and
 *  OpenCode Go lines), with the vendor's name where theirs is; the name is the kit's, and a vendor name is allowed as a
 *  vendor name. A plan reads "is a plan", a route charged per use reads "is not a plan". */
export function accountWords(card: CloudKey) {
  const name = nameOf(card);
  const perUse = billingOf(card) === 'api';
  return {
    name,
    keyNote: perUse ? `${name} is not a plan. Paste your own ${name} key, and Ownvoice uses it only to write for you.` : `${name} is a plan. Paste the key it gave you, and Ownvoice uses it only to write for you.`,
    pasteField: `Paste your ${name} key`,
    connect: 'Connect',
    signOut: `Sign out of ${name}`,
    button: `Connect with ${name}`,
    keyFailed: words.openrouterKeyFailed,
    sub: perUse ? words.srcOpenRouterSub : words.srcGptSub,
    home: `Writes with your ${name}.`,
    head: `Your chat goes to ${name} only when you tap`,
    privacy: words.privacyPlan.replace('{name}', name),
    switchNote: words.switchNoteOpenRouter,
    switchTitle: `Write with ${name}?`,
    switchBody: `From now on, when you tap the bubble, the chat on screen and what you typed go to ${name} to write your drafts.`,
    switchYes: `Switch to ${name}`,
    phoneBackup: `If ${name} can't answer, this phone writes instead.`,
    failed: `${name} didn't answer this time.`,
    refused: `${name} refused this account. Connect it again, or pick another writer.`,
    fallback: `${name} didn't answer. This phone wrote these instead.`,
    off: `${name} is turned off for now. This phone wrote these.`,
    offNoPhone: `${name} is turned off for now. Try again later.`,
    needNote: `This phone can't write drafts on its own. Connect your ${name} ${perUse ? 'key' : 'plan'} to use Ownvoice here.`,
    switchUnavailable: `${name} could not be reached this time. This phone wrote these.`,
    cantWriteNote: `This phone can't write, and you kept writing there on this phone. Let ${name} write there instead.`,
    cantWriteFix: `Choose where ${name} writes`,
    phoneCantWhy: `Writing right on the phone needs a newer phone with its own built-in writer. This phone doesn’t have one, so Ownvoice writes with your ${name} instead. You still pick each draft and press Send yourself.`,
  };
}

/** The generic lines for a card, or null for the first four (and anything unknown), whose lines stay in `words`. */
export const genericWords = (card: CloudKey | null | undefined): ReturnType<typeof accountWords> | null =>
  card && cardOf(card) && !hasOwnScreen(card) ? accountWords(card) : null;

export * from 'ownvoice-engine/src/words.ts';
import { words as engineWords } from 'ownvoice-engine/src/words.ts';

// Typing-check additions (opt-in spelling check as you type): kept here until
// the shared engine copy carries them.
const typingWords = {
  // The typing check's slips, on the bubble (read out after "Ownvoice") and in the panel.
  slipOne:'one thing to check',
  slipMany:'things to check',
  slipsTitle:'Check these',
  fix:'Fix',
  slipRepeat:'Remove the repeat',
  slipUnknown:'Check the spelling',
  // The same promise once "Check my spelling as I type" is on.
  promiseTapTyping:'Reads when you tap the bubble, and as you type',
  promiseTapTypingNote:'Only to check your spelling, on this phone. Nothing is kept.',
  rowTyping:'Check my spelling as I type',
  rowTypingNote:'It stays on this phone.',
} as const;

// Edit before insert: a card's text can be changed in the panel; Insert then uses the edited text.
const editWords = {
  edit:'Edit',
  editField:'Edit this draft',
} as const;

export const words = { ...engineWords, ...typingWords, ...editWords };

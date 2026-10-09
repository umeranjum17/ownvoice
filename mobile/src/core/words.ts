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
  typingLimited:'In very long notes, checks cover only the first part.',
} as const;

// Grow-mode fit bar: what each level means, in plain words. Definitions of the level, never a
// promise of reach (no "viral", no "will get"). The unsure line says the rating itself is missing.
const fitWords = {
  fitWhyStrong: 'Reads like it moves the conversation forward.',
  fitWhyGood: 'Reads on-topic, with a clear point.',
  fitWhyVague: 'Reads relevant, but vague.',
  fitWhySkipped: 'Reads off-topic, or like bait.',
  fitWhyUnsure: 'The rating did not come back clearly.',
} as const;

// Edit before insert: a card's text can be changed in the panel; Insert then uses the edited text.
const editWords = {
  edit:'Edit',
  editField:'Edit this draft',
} as const;

// Growth check-in (F6b): a quiet line about a day after an insert, a weekly numbers card, and the
// growth screen. Every line stays in plain words with no digits; his own typed counts are the one
// scoped exception, and they render only on the growth screen's number fields.
const growthWords = {
  checkinAsk: 'How did your reply do?',
  checkinOn: 'on',
  checkinReplies: 'Got replies back',
  checkinLikes: 'Some likes',
  checkinQuiet: 'Nothing yet',
  checkinSkipped: 'Didn\u2019t post it',
  weeklyTitle: 'Your counts this week',
  weeklyNote: 'Type in what you see on your profiles. They stay on this phone.',
  weeklyReminder: 'Add your follower count and karma on Your growth. They stay on this phone.',
  countFormat: 'Use whole numbers without commas or spaces.',
  weeklyX: 'Followers on X',
  weeklyReddit: 'Karma on Reddit',
  weeklySave: 'Save these counts',
  weeklySaved: 'Saved.',
  growthOpen: 'See your growth',
  growthTitle: 'Your growth',
  growthNote: 'Since you started. Your own counts, kept on this phone. This never says what caused a change.',
  growthUp: 'Up since last week',
  growthSame: 'Same as last week',
  growthDown: 'Down since last week',
  growthUpChecked: 'Up since you last checked',
  growthSameChecked: 'Same as when you last checked',
  growthDownChecked: 'Down since you last checked',
  growthNew: 'Not enough yet. Check back next week.',
  growthEmpty: 'Nothing here yet. Add your counts above.',
} as const;

// Home's readiness card: never "Ready to help" while it is still checking, or while an app the
// bubble shows in has no writer.
const homeWords = {
  statusChecking:'Checking…',
  cantWriteIn:'Ownvoice can\'t write in {apps} yet',
  cantWriteNote:'This phone can\'t write, and you kept writing there on this phone. Let ChatGPT write there instead.',
  cantWriteFix:'Choose where ChatGPT writes',
  cantWriteReadyNote:'You kept writing there on this phone, and this phone needs to get ready first. It needs about 2 to 3 GB, once, on Wi-Fi.',
  changeFailed:'Couldn\'t confirm that change. Check the setting or try again.',
} as const;

// The Claude account: the same promises and failures as the ChatGPT ones, named for the plan the person pays for.
const claudeWords = {
  claudeButton: 'Continue with Claude',
  claudeSignInNote: 'Sign in on the Claude page, then copy the code it shows and paste it here.',
  claudePasteField: 'Paste the code from the Claude page',
  claudeConnect: 'Connect',
  claudeOpen: 'Open the Claude page',
  claudeSignOut: 'Sign out of Claude',
  claudePageFailed: 'Couldn’t open the Claude page. Try the button again.',
  claudePasteFailed: 'Claude sign-in ended. Start it again.',
  srcClaude: 'With your Claude',
  rowSourceClaude: 'With your Claude',
  homeClaude: 'Writes with your Claude.',
  headClaude: 'Your chat goes to Claude only when you tap',
  privacyClaude: 'When you tap the bubble, the chat on screen, what you typed and your writing rules go to Claude. Ownvoice keeps no copy.',
  switchNoteClaude: 'Ownvoice checks now and then whether its online writers are allowed to write. That check carries no name and no message.',
  claudeSwitchTitle: 'Write with Claude?',
  claudeSwitchBody: 'From now on, when you tap the bubble, the chat on screen and what you typed go to Claude to write your drafts.',
  claudeSwitchYes: 'Switch to Claude',
  claudePhoneBackup: "If Claude can't answer, this phone writes instead.",
  claudePlanLimit: 'Claude limit reached',
  claudeChooseWriter: 'Choose another writer',
  claudeFailed: "Claude didn't answer this time.",
  claudeFallback: "Claude didn't answer. This phone wrote these instead.",
  claudeOff: 'Claude is turned off for now. This phone wrote these.',
  claudeOffNoPhone: 'Claude is turned off for now. Try again later.',
  claudeNeedNote: "This phone can't write drafts on its own. Sign in with your Claude to use Ownvoice here.",
  claudeSwitchUnavailable: 'Claude could not be reached this time. This phone wrote these.',
  claudeCantWriteNote: 'This phone can\'t write, and you kept writing there on this phone. Let Claude write there instead.',
  claudeCantWriteFix: 'Choose where Claude writes',
  claudePhoneCantWhy: 'Writing right on the phone needs a newer phone with its own built-in writer. This phone doesn’t have one, so Ownvoice writes with your Claude instead. You still pick each draft and press Send yourself.',
} as const;

export const words = {
  ...engineWords, ...typingWords, ...fitWords, ...editWords, ...growthWords, ...homeWords, ...claudeWords,
  keepReplies: 'Keep my replies to learn from',
  keepRepliesNote: 'Only on this phone. Never sent. Off keeps no reply text.',
  outcomeTitle: 'Replies you inserted',
  outcomeReadsNote: 'The read list keeps taps, never text, for a month. Inserted reply records stay until you wipe them. You choose whether to keep their text below. Reply records never leave this phone.',
  outcomeSuggestion: 'Suggestion',
  outcomeYours: 'Yours', wipeVoiceNote: 'Wipe everything also deletes your voice.',
  outcomeNoLevel: 'No fit rating was shown for this reply.',
  outcomeFailed: 'Could not save. Try again.',
  outcomeRefused: 'Storage refused the save.',
  replyWithheld: "Reply ideas are unavailable for now. Write your reply first, then tap the bubble to polish it.",
  tryInsert: 'Write a reply first, then tap the bubble to polish it. Or tap Skip.',
};

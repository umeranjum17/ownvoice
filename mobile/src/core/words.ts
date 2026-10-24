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

// Fit bar (grown replies and own posts): what each level means, in plain words. Definitions of the level, never a
// promise of reach (no "viral", no "will get"). The unsure line says the rating itself is missing.
const fitWords = {
  fitWhyStrong: 'Reads like it moves the conversation forward.',
  fitWhyGood: 'Reads on-topic, with a clear point.',
  fitWhyVague: 'Reads relevant, but vague.',
  fitWhySkipped: 'Reads off-topic, or like bait.',
  fitWhyUnsure: 'The rating did not come back clearly.',
  // Once per set, in place of an empty bar on every card, when the writer on this phone gave no level.
  fitNeedsOnline: 'Fit levels need an online writer, such as your ChatGPT. The writer on this phone can’t rate them.',
} as const;

// Edit before insert: a card's text can be changed in the panel; Insert then uses the edited text.
const editWords = {
  edit:'Edit',
  editField:'Edit this draft',
} as const;

// Posts from notes: the selection sheet turns shared or selected notes into three posts for one place.
const postsWords = {
  postsFor: 'Posts for {name}',
  postsReplace: 'Posts from your notes. Edit one if you like. Replace puts it in the field; it is copied too.',
  postsCopy: 'Posts from your notes. Edit one if you like, then copy it and paste it where you post.',
  postsNone: "Couldn't write posts from that. Try again, or add a few more notes.",
} as const;

// Panel mic: tap to listen on this phone, tap again (or silence) to finish; the heard
// words go into the focused field through the insert path.
const dictateWords = {
  dictateListen: 'Listen',
  dictateSpeechReady: 'Getting speech ready…',
  dictateSettling: 'Finishing your last words…',
  dictateStop: 'Stop listening',
  dictateListening: 'Listening… tap Stop when you are done.',
  dictateUnheard: 'Didn’t catch that. Try again.',
  dictateNotInserted: 'Those words didn’t reach the field. Say them again.',
  dictateUnavailable: 'This phone can’t listen yet.',
  dictateLanguage: 'This phone can’t listen in your language yet.',
  dictateMic: 'To listen, allow the microphone the next time it asks.',
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
  computerFailed: "Your computer didn't answer this time.",
  computerOff: 'Your computer is turned off for now. This phone wrote these.',
  computerOffNoPhone: 'Your computer is turned off for now. Try again later.',
  computerProblem: "Couldn't reach your computer. Check that it's on and the code is right, then try again.",
  computerFallback: "Your computer didn't answer. This phone wrote these.",
  computerUnasked: "Your computer wasn't asked. This phone wrote these.",
  computerUnaskedNoPhone: "Your computer wasn't asked. Check it's paired and on, then try again.",
  computerNone: 'No computer is paired yet.',
  rowComputer: 'Use my computer',
  rowComputerNone: 'Write with Claude on your computer',
  rowSourceComputer: 'Your computer writes',
  computerBody: 'Your computer writes the drafts with your own Claude. The chat on screen and what you typed go to your computer, then on to Claude, to write them. Your computer can also be reached from outside your home if you set it up that way.',
  computerPaste: 'Paste the code your computer shows',
  computerPair: 'Pair',
  computerCheck: 'Check your computer shows these two words, then say yes there.',
  computerPaired: 'Paired with {name}.',
  computerUse: 'Write with this computer',
  computerUsePhone: 'Write on this phone instead',
  computerForget: 'Forget this computer',
  computerForgotNotTold: "Forgotten on this phone. Your computer couldn't be reached, so it wasn't told. Remove this phone there too.",
  computerBackup: "If it doesn't answer, this phone writes instead.",
  claudeFallback: "Claude didn't answer. This phone wrote these instead.",
  claudeOff: 'Claude is turned off for now. This phone wrote these.',
  claudeOffNoPhone: 'Claude is turned off for now. Try again later.',
  claudeNeedNote: "This phone can't write drafts on its own. Sign in with your Claude to use Ownvoice here.",
  claudeSwitchUnavailable: 'Claude could not be reached this time. This phone wrote these.',
  claudeCantWriteNote: 'This phone can\'t write, and you kept writing there on this phone. Let Claude write there instead.',
  claudeCantWriteFix: 'Choose where Claude writes',
  claudePhoneCantWhy: 'Writing right on the phone needs a newer phone with its own built-in writer. This phone doesn’t have one, so Ownvoice writes with your Claude instead. You still pick each draft and press Send yourself.',
} as const;

// The OpenRouter account: a key the person pastes, billed per use rather than a plan, with the same
// promises and failures as the other cloud writers, named for OpenRouter.
const openRouterWords = {
  openrouterKeyNote: 'OpenRouter is not a plan. Paste your own OpenRouter key, and Ownvoice uses it only to write for you.',
  openrouterPasteField: 'Paste your OpenRouter key',
  openrouterConnect: 'Connect',
  openrouterSignOut: 'Sign out of OpenRouter',
  openrouterButton: 'Connect with OpenRouter',
  openrouterKeyFailed: 'That key was not accepted. Check it and try again.',
  srcOpenRouter: 'With your OpenRouter',
  srcOpenRouterSub: 'Your own key, paid as you use it',
  rowSourceOpenRouter: 'With your OpenRouter',
  homeOpenRouter: 'Writes with your OpenRouter.',
  headOpenRouter: 'Your chat goes to OpenRouter only when you tap',
  privacyOpenRouter: 'When you tap the bubble, the chat on screen, what you typed and your writing rules go to OpenRouter. Ownvoice keeps no copy.',
  switchNoteOpenRouter: 'Ownvoice checks now and then whether its online writers are allowed to write. That check carries no name and no message.',
  openrouterSwitchTitle: 'Write with OpenRouter?',
  openrouterSwitchBody: 'From now on, when you tap the bubble, the chat on screen and what you typed go to OpenRouter to write your drafts.',
  openrouterSwitchYes: 'Switch to OpenRouter',
  openrouterPhoneBackup: "If OpenRouter can't answer, this phone writes instead.",
  openrouterFailed: "OpenRouter didn't answer this time.",
  openrouterRefused: 'OpenRouter refused this account. Connect it again, or pick another writer.',
  openrouterFallback: "OpenRouter didn't answer. This phone wrote these instead.",
  openrouterOff: 'OpenRouter is turned off for now. This phone wrote these.',
  openrouterOffNoPhone: 'OpenRouter is turned off for now. Try again later.',
  openrouterNeedNote: "This phone can't write drafts on its own. Connect your OpenRouter key to use Ownvoice here.",
  openrouterSwitchUnavailable: 'OpenRouter could not be reached this time. This phone wrote these.',
  openrouterCantWriteNote: 'This phone can\'t write, and you kept writing there on this phone. Let OpenRouter write there instead.',
  openrouterCantWriteFix: 'Choose where OpenRouter writes',
  openrouterPhoneCantWhy: 'Writing right on the phone needs a newer phone with its own built-in writer. This phone doesn’t have one, so Ownvoice writes with your OpenRouter instead. You still pick each draft and press Send yourself.',
} as const;

// The OpenCode Go account: a plan key the person pastes, with the same promises and failures
// as the other cloud writers, named for the plan.
const openCodeWords = {
  openCodeKeyNote: 'OpenCode Go is a plan. Paste the key it gave you, and Ownvoice uses it only to write for you.',
  openCodePasteField: 'Paste your OpenCode Go key',
  openCodeConnect: 'Connect',
  openCodeSignOut: 'Sign out of OpenCode Go',
  openCodeButton: 'Connect with OpenCode Go',
  openCodeKeyFailed: 'That key was not accepted. Check it and try again.',
  srcOpenCode: 'With your OpenCode Go',
  srcOpenCodeSub: 'Your own plan, already paid for',
  rowSourceOpenCode: 'With your OpenCode Go',
  homeOpenCode: 'Writes with your OpenCode Go.',
  headOpenCode: 'Your chat goes to OpenCode Go only when you tap',
  privacyOpenCode: 'When you tap the bubble, the chat on screen, what you typed and your writing rules go to OpenCode Go. Ownvoice keeps no copy.',
  switchNoteOpenCode: 'Ownvoice checks now and then whether its online writers are allowed to write. That check carries no name and no message.',
  openCodeSwitchTitle: 'Write with OpenCode Go?',
  openCodeSwitchBody: 'From now on, when you tap the bubble, the chat on screen and what you typed go to OpenCode Go to write your drafts.',
  openCodeSwitchYes: 'Switch to OpenCode Go',
  openCodePhoneBackup: "If OpenCode Go can't answer, this phone writes instead.",
  openCodeFailed: "OpenCode Go didn't answer this time.",
  openCodeRefused: 'OpenCode Go refused this account. Connect it again, or pick another writer.',
  openCodeFallback: "OpenCode Go didn't answer. This phone wrote these instead.",
  openCodeOff: 'OpenCode Go is turned off for now. This phone wrote these.',
  openCodeOffNoPhone: 'OpenCode Go is turned off for now. Try again later.',
  openCodeNeedNote: "This phone can't write drafts on its own. Connect your OpenCode Go key to use Ownvoice here.",
  openCodeSwitchUnavailable: 'OpenCode Go could not be reached this time. This phone wrote these.',
  openCodeCantWriteNote: 'This phone can\'t write, and you kept writing there on this phone. Let OpenCode Go write there instead.',
  openCodeCantWriteFix: 'Choose where OpenCode Go writes',
  openCodePhoneCantWhy: 'Writing right on the phone needs a newer phone with its own built-in writer. This phone doesn’t have one, so Ownvoice writes with your OpenCode Go instead. You still pick each draft and press Send yourself.',
} as const;

// Gmail replies: the bubble tapped over an open email thread offers reply drafts; the picked one opens Gmail's own
// reply with it in the box, and the person presses Send.
const mailWords = {
  mailReply: 'Reply',
  readyMail: 'Pick one. Gmail opens your reply with it in the box. You send it yourself.',
  mailOpenThread: 'Open the email you want to answer, then tap the bubble for reply ideas.',
} as const;

// Which one writes: the person picks, from the account's own list; the names in that list are the vendor's and the one
// place a name may show (the picker's rows). Everything around the list stays in plain words.
const modelWords = {
  rowModel: 'Which one writes',
  rowModelNone: 'Not chosen yet',
  needModel: 'Choose which one writes',
  needModelNote: 'Your account is ready. Pick which one writes for you.',
  needModelPanel: 'Choose which one writes first.',
  modelTitle: 'Which one writes',
  modelNote: 'This is your account’s own list. Ownvoice never picks for you.',
  modelSearch: 'Search the list',
  modelLoading: 'Getting your list…',
  modelFailed: 'Couldn’t get the list. Check your connection and try again.',
  modelEmpty: 'Nothing in the list matches.',
  modelMore: 'Show more',
  modelPicked: 'Chosen',
  modelChoose: 'Choose',
  modelLimited: 'Not with your plan right now',
  modelResting: 'Resting right now',
  modelSaveFailed: 'Couldn’t save your choice. Try again.',
} as const;

export const words = {
  ...engineWords, ...modelWords, ...typingWords, ...fitWords, ...editWords, ...postsWords, ...dictateWords, ...growthWords, ...homeWords, ...claudeWords, ...openRouterWords, ...openCodeWords, ...mailWords,
  aboutTitle: 'About Ownvoice',
  aboutVersion: 'Version',
  aboutBuild: 'Build',
  aboutPreRelease: 'Pre-release build. This is not the version people download.',
  aboutRelease: 'Released version.',
  aboutHelper: 'Computer helper',
  aboutHelperNone: 'No computer is paired.',
  aboutHelperUnreachable: "Couldn't reach your computer, so its version isn't known right now.",
  aboutHelperUnknown: 'An older helper that does not say its version.',
  aboutHelperOlder: 'Your computer helper is older than this app. Update it on your computer.',
  aboutHelperNewer: 'This app is older than your computer helper. Update the app.',
  jevTitle: 'Ratings with Jev',
  jevNote: 'Jev rates your drafts. Your chosen writer still writes them.',
  jevConsent: 'When you tap the bubble, the post, your drafts and examples of your writing go to Jev, made by TypeSafe, for ratings.',
  jevCost: 'TypeSafe charges your Jev account each time. This is not included in your writing plan.',
  jevScope: 'Only for drafts written with ChatGPT, Claude, OpenRouter or OpenCode Go. Drafts written on this phone stay here.',
  jevOff: 'Off unless you turn it on.',
  jevUse: 'Use Jev for ratings',
  jevPaste: 'Paste your Jev key',
  jevConnect: 'Agree and connect Jev',
  jevConnected: 'Jev is connected. You can turn ratings on below.',
  jevForget: 'Disconnect Jev',
  jevConnectFirst: 'Connect Jev in Ratings with Jev to get ratings.',
  jevNotAsked: 'Jev was not asked. Check your rating and writing choices.',
  jevRefused: 'Jev refused this key. Connect it again in Ratings with Jev.',
  jevLimited: 'Jev has reached your account’s limit. Check your Jev account.',
  jevOffline: 'Couldn’t reach Jev. Check your internet connection.',
  jevFailed: 'Jev did not return a rating this time. Try again.',
  jevSaveFailed: 'Couldn’t save the Jev choice on this phone. Try again.',
  jevKeyFailed: 'Couldn’t save that key on this phone. Check it and try again.',
  jevForgetFailed: 'Couldn’t remove the Jev key from this phone. Try again.',
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

// Fixed Ownvoice eval set, from the offline-model study (report Appendix A).
// `keep` = words/numbers that must survive (case-insensitive).
// polish = compose boost (the phone writer's rewrite + layout retry), select = selection-menu rewrite,
// reply = reply drafts from the screen.
export type Case =
  | { id: string; kind: 'polish'; typed: string; screen: string; guide?: string; keep: string[]; why: string; slot?: number; from?: string }
  | { id: string; kind: 'select'; typed: string; how: 'Shorter' | 'Simpler' | 'Fix spelling' | 'Friendlier' | 'Firmer'; keep: string[]; exact?: string; layout?: boolean; why: string }
  | { id: string; kind: 'tone'; typed: string; why: string }
  | { id: string; kind: 'reply'; screen: string; guide?: string; latest?: string; points: string[][]; noise?: string[]; why: string; app?: string };

const LOWER = 'How they write: all lowercase, short, no exclamation marks.';

export const cases: Case[] = [
  // --- Polish: the real regressions (lost noon, flattened list, marker-only rows, trailing commentary) ---
  { id: 'P01-noon-list', kind: 'polish', typed: 'Please bring the tent\n1. Pack the stove\n2. Meet Saturday at noon', screen: '', keep: ['tent', 'stove', 'Saturday', 'noon'],
    why: 'QA 27 Sep: phone polish of this list lost "noon" / produced no card' },
  { id: 'P02-stove-list', kind: 'polish', typed: 'I can bring the stove.\n1. I will pack the tent\n2. Meet Saturday at noon', screen: 'Sam: Are we still on for Saturday? Who has the tent?', keep: ['stove', 'tent', 'Saturday', 'noon'],
    why: 'PR 27 list fixture, reply context' },
  { id: 'P03-blank-line-list', kind: 'polish', typed: 'Quick update:\n\n1. Pack the stove\n2. Meet Saturday', screen: '', keep: ['stove', 'Saturday'],
    why: 'PR 27: blank line before list must survive' },
  { id: 'P04-bullets-times', kind: 'polish', typed: 'hey all, for friday:\n- standup moved to 10:30\n- Priya is out till Mon\n- deploy freeze starts 4pm', screen: 'Slack #team', guide: LOWER, keep: ['friday', '10:30', 'Priya', 'Mon', '4pm'],
    why: 'marker-only rows risk; times and a name in a dash list, lowercase voice' },
  { id: 'P05-grocery-4', kind: 'polish', typed: 'Groceries for tonight:\n1. eggs\n2. oat milk\n3. 2 lbs chicken\n4. bread', screen: '', keep: ['eggs', 'oat milk', '2', 'chicken', 'bread'],
    why: 'one-word rows invite marker-only shells' },
  { id: 'P06-slack-lower', kind: 'polish', typed: 'yeah i can take a look at the PR after lunch, probably around 2. ping me if its urgent', screen: 'Priya: can someone review my auth PR today?', guide: LOWER, keep: ['PR', 'lunch', '2', 'urgent'],
    why: 'casual Slack reply: lowercase voice, a time' },
  { id: 'P07-whatsapp-emoji', kind: 'polish', typed: "omg yes!! count me in 😂 i'll bring the speaker, can someone grab ice?", screen: 'Group: Beach Saturday? who is in', keep: ['speaker', 'ice', '😂'],
    why: 'WhatsApp group: emoji and exclamation voice must stay' },
  { id: 'P08-money', kind: 'polish', typed: "Rent is $1,450 this month, split 3 ways that's $483 each. Venmo me by the 5th pls", screen: '', keep: ['1,450', '3', '483', 'Venmo', '5th'],
    why: 'numbers and money' },
  { id: 'P09-email-move', kind: 'polish', typed: "Hi Dana, I moved our call to Thursday 3pm PT since Marco can't make Wednesday. Same Zoom link.", screen: 'Dana Kim: Can we still do Wednesday?', keep: ['Dana', 'Thursday', '3pm', 'PT', 'Marco', 'Wednesday', 'Zoom'],
    why: 'names, days, time zone' },
  { id: 'P10-stock-cut', kind: 'polish', typed: 'Great question! At the end of the day, I think we should circle back on the Q3 roadmap next Tuesday. Let me know your thoughts!', screen: 'Lee: should we revisit the Q3 roadmap?', keep: ['Q3', 'roadmap', 'Tuesday'],
    why: 'template phrases to cut, facts to keep' },
  { id: 'P11-dash-own', kind: 'polish', typed: "Can't do Sunday — flight lands at 6:40. Monday works though.", screen: 'Ana: brunch Sunday?', keep: ['Sunday', '6:40', 'Monday', 'flight'],
    why: "writer's own dash, a clock time" },
  { id: 'P12-paragraphs', kind: 'polish', typed: "Hey Sam,\n\nThanks for the notes. I'll fix the header by Friday.\n\nThe pricing page can wait till next sprint.", screen: '', keep: ['Sam', 'header', 'Friday', 'pricing', 'sprint'],
    why: 'paragraph breaks must survive' },
  // Captain's addition: the tent-list Shorter that lost both items on the test phone. Scored on the
  // Shorter card of the P01 run (same input, same deterministic pipeline): it must exist, keep both items and markers.
  { id: 'P13-tent-shorter', kind: 'polish', typed: 'Please bring the tent\n1. Pack the stove\n2. Meet Saturday at noon', screen: '', keep: ['tent', 'stove', 'Saturday', 'noon'], slot: 1, from: 'P01-noon-list',
    why: 'phone validation: Shorter on a two-item list lost both items' },
  // --- Selection rewrite ---
  { id: 'S01-shorter', kind: 'select', how: 'Shorter', typed: "Hi Dana, just wanted to let you know that I went ahead and moved our call to Thursday at 3pm PT, because Marco isn't able to make it on Wednesday. We'll use the same Zoom link as before.", keep: ['Dana', 'Thursday', '3pm', 'PT', 'Marco', 'Wednesday', 'Zoom'],
    why: 'Shorter must keep every fact' },
  { id: 'S02-simpler', kind: 'select', how: 'Simpler', typed: 'Per our discussion, the deliverables will be finalized subsequent to stakeholder sign-off on the 14th.', keep: ['14'],
    why: 'Simpler must keep the date' },
  { id: 'S03-spelling', kind: 'select', how: 'Fix spelling', typed: 'im gonna be their at 7, save me a seet', keep: ['7'],
    why: 'Fix spelling: change nothing else (slang, casing)' },
  { id: 'S04-one-word', kind: 'select', how: 'Fix spelling', typed: 'tommorow', keep: [], exact: 'tomorrow',
    why: 'single word: no added full stop (QA regression)' },
  { id: 'S05-list-shorter', kind: 'select', how: 'Shorter', typed: 'Please bring the tent\n1. Pack the stove\n2. Meet Saturday at noon', keep: ['tent', 'stove', 'Saturday', 'noon'], layout: true,
    why: 'lost-noon list via the selection menu: both items and markers must stay' },
  { id: 'S06-friendlier', kind: 'select', how: 'Friendlier', typed: 'Send me the report by Friday. No excuses this time.', keep: ['report', 'Friday'],
    why: 'tone polish: warmer words, same ask and deadline' },
  { id: 'S07-firmer', kind: 'select', how: 'Firmer', typed: 'Sorry, maybe we could possibly move the call to Tuesday if that is okay?', keep: ['Tuesday', 'call'],
    why: 'tone polish: more direct, same ask and day' },
  // --- Tone line: one plain tone word from the writer, on tap ---
  { id: 'T01-blunt', kind: 'tone', typed: 'Fine. Do whatever you want.',
    why: 'blunt text names a sharp tone' },
  { id: 'T02-warm', kind: 'tone', typed: 'Thanks so much, that really means a lot!',
    why: 'warm text names a friendly tone' },
  { id: 'T03-flat', kind: 'tone', typed: 'Meeting moved to 3pm. Same link.',
    why: 'flat factual text names a plain tone' },
  // --- Replies ---
  { id: 'R01-sam-practice', kind: 'reply', screen: 'Sam: Are we still on for Saturday? Can you bring the stove?', latest: 'Are we still on for Saturday? Can you bring the stove?', points: [['saturday', 'sat', 'still on', "we're on", 'we are on', 'yes', 'yep', 'yeah', 'works', 'count me'], ['stove']],
    why: 'the practice chat: must answer the day and the stove' },
  { id: 'R02-slack-pr', kind: 'reply', screen: "Priya: can you review my PR before 3? it's the auth one, ~200 lines", guide: LOWER, points: [['review', 'look', 'check'], ['3', 'three', 'before', 'after', 'time']],
    why: 'casual Slack, lowercase voice, a deadline' },
  { id: 'R03-mom-dinner', kind: 'reply', screen: 'Mom: Dinner Sunday at 7? Aunt Lina is coming 🙂 Bring dessert if you can', points: [['sunday', '7', 'dinner', 'there', 'come', 'yes'], ['dessert', 'pie', 'cake', 'bring']],
    why: 'WhatsApp family: two points plus a name' },
  { id: 'R04-deploy', kind: 'reply', screen: 'Jake: lol did you see the deploy blew up again\nJake: we rolling back?', guide: LOWER, points: [['roll', 'revert', 'back', 'fix', 'hold']],
    why: 'casual Slack question' },
  { id: 'R05-email-plan', kind: 'reply', screen: 'From: Dana Kim\nSubject: Contract renewal\nHi, could you confirm whether you want the 12-month or 24-month plan by Friday? The 24-month is $89/mo.\nThanks, Dana', points: [['12', '24', 'plan', 'month']],
    why: 'email: must not invent a choice or price' },
  { id: 'R06-news', kind: 'reply', screen: 'Alex: I got the job!!! starting Oct 14', points: [['congrat', 'amazing', 'huge', 'proud', 'great', 'nice', 'yay', 'awesome', 'so happy']],
    why: 'news: warm, no invented facts' },
  { id: 'R07-two-questions', kind: 'reply', screen: "Tom: what time's your flight tomorrow and do you need a ride from the airport?", points: [['flight', 'land', 'time', 'arriv', 'am', 'pm'], ['ride', 'pick', 'airport', 'uber', 'taxi', 'lift']],
    why: 'two questions; the time is only theirs to know' },
  { id: 'R08-ui-noise', kind: 'reply', screen: 'WhatsApp\nSam\nonline\nSam: Can you grab 2 bags of ice on the way? 6pm still good?\n10:42 PM\nType a message\nSend', points: [['ice'], ['6', 'six', 'still good', 'works', 'see you', 'there']], noise: ['online', 'Type a message', 'Send', '10:42'],
    why: 'screen with app labels: none may leak into a draft' },
  // --- Package 2: one reply case per platform (report §3); `app` feeds the platform's slots and cap ---
  { id: 'R09-x-post', kind: 'reply', app: 'com.twitter.android', screen: 'Maya @maya_dev · 2h\nShipped our offline-first notes app today. Local SQLite, no account needed.\n412 likes · 88 reposts', points: [['offline', 'local', 'sqlite', 'account', 'notes', 'app'], ['ship', 'launch', 'live', 'congrat', 'nice', 'cool', 'neat', 'love']], noise: ['likes', 'reposts', '@maya_dev'],
    why: 'X post: agree with a detail, push back kindly, or ask a sharp question' },
  { id: 'R10-linkedin-post', kind: 'reply', app: 'com.linkedin.android', screen: 'Priya Nair · 2nd · 3h\nAfter 6 years leading platform teams, I am starting my own consultancy. Lesson one: say no to work that drains you.\n214 reactions · 41 comments', points: [['consultancy', 'consulting', 'own', 'starting', 'new', 'venture', 'business'], ['team', 'platform', 'lesson', 'drain']], noise: ['reactions', 'comments'],
    why: 'LinkedIn post: concrete example, respectful counterpoint, or a follow-up' },
  { id: 'R11-reddit-thread', kind: 'reply', app: 'com.reddit.frontpage', screen: 'r/CampingGear · u/camp_dad · 5h\nSoft cooler or hard-sided for a weekend trip? I walk in, so weight matters.\n23 comments', points: [['cooler', 'soft', 'hard', 'sided', 'weight', 'walk'], ['weekend', 'trip', 'camp']], noise: ['comments'],
    why: 'Reddit thread: specifics, a reasoned disagree, or one detail asked' },
  { id: 'R12-slack-deploy', kind: 'reply', app: 'com.Slack', guide: LOWER, screen: 'Slack #team · Jake: the staging deploy failed again, logs point at the auth migration. can someone take a look before the 4pm demo?', points: [['deploy', 'staging', 'migration', 'auth', 'look', 'take'], ['4', 'demo', 'before', 'pm']],
    why: 'Slack thread: next step, blocker, or what is unclear, lowercase voice' },
];

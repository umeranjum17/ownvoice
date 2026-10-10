// Fixed Ownvoice eval set, from the offline-model study (report Appendix A).
// `keep` = words/numbers that must survive (case-insensitive).
// polish = compose boost (the phone writer's rewrite + layout retry), select = selection-menu rewrite,
// reply = reply drafts from the screen.
export type Case =
  | { id: string; kind: 'polish'; typed: string; screen: string; guide?: string; keep: string[]; why: string; slot?: number; exact?: string; from?: string }
  | { id: string; kind: 'select'; typed: string; how: 'Shorter' | 'Simpler' | 'Fix spelling' | 'Friendlier' | 'Firmer'; keep: string[]; exact?: string; layout?: boolean; why: string }
  | { id: string; kind: 'tone'; typed: string; why: string }
  | { id: string; kind: 'reply'; screen: string; guide?: string; latest?: string; points: string[][]; noise?: string[]; why: string; app?: string }
  | { id: string; kind: 'thread'; typed: string; app?: string; guide?: string; keep: string[]; why: string }
  // Grow-mode feed case: a post plus an optional draft of his own, scored by the G2 checks
  // (never-say, long dash, invented numbers, the "Yours" card, and the bottom level for a
  // never-say breaker) against a recorded run; see scoreFeed and the README's G-set section.
  | { id: string; kind: 'feed'; app: string; author: string; post: string; draft?: string; voice: { never: string[]; noDashes: boolean; samples: string[] }; why: string };


const LOWER = 'How they write: all lowercase, short, no exclamation marks.';

export const cases: Case[] = [
  { id: 'P14-cleaned-slips', kind: 'polish', typed: 'Its a good plan, I shoud be there by the the evening.', screen: '', slot: 0,
    exact: "It's a good plan, I should be there by the evening.", keep: ['good plan', 'evening'], why: 'Cleaned up must apply the slips the typing check already detects' },
  { id: 'P15-cleaned-name', kind: 'polish', typed: 'Its a good plan, Umer shoud be there by the the evening.', screen: '', slot: 0,
    exact: "It's a good plan, Umer should be there by the evening.", keep: ['Umer', 'good plan', 'evening'], why: 'Local cleanup must leave the proper noun alone' },
  { id: 'P16-cleaned-advisory', kind: 'polish', typed: 'Keep your right hand warm. I shoud leave.', screen: '', slot: 0,
    exact: 'Keep your right hand warm. I should leave.', keep: ['right hand', 'leave'], why: 'Automatic cleanup must preserve valid wording flagged by advisory grammar' },
  { id: 'P17-cleaned-order', kind: 'polish', typed: 'Meet by teh the evening.', screen: '', slot: 0,
    exact: 'Meet by the evening.', keep: ['Meet', 'evening'], why: 'Spelling cleanup precedes doubled-word removal' },
  { id: 'P18-cleaned-run', kind: 'polish', typed: 'Meet by the The the evening.', screen: '', slot: 0,
    exact: 'Meet by the evening.', keep: ['Meet', 'evening'], why: 'Supported lowercase-first mixed-case runs collapse' },
  { id: 'P19-cleaned-protected', kind: 'polish', typed: "Bring woud for the fire. We should visit Bora Bora. Give Ben Ben's keys. Hey @will will you join us? Its own engine runs. I shoud leave.", screen: '', slot: 0,
    exact: "Bring woud for the fire. We should visit Bora Bora. Give Ben Ben's keys. Hey @will will you join us? Its own engine runs. I should leave.", keep: ['woud', 'Bora Bora', "Ben Ben's", '@will will', 'Its own engine', 'leave'], why: 'Automatic spelling leaves ambiguous words, names, protected tokens and other Its uses alone' },
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
  { id: 'S08-tent-shorter', kind: 'select', how: 'Shorter', typed: 'Please bring the tent on Saturday.', keep: ['bring', 'tent', 'Saturday'],
    why: 'phone check 29 Sep: Shorter on this sentence appended dash restatements, one inventing a "deadline" framing' },
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
  // --- Package 5: thread writer and hooks (report §7 row 5); `app` feeds the cap ---
  { id: 'H01-x-thread', kind: 'thread', app: 'com.twitter.android',
    typed: 'Shipped our offline notes app today after six months of weekend work. It keeps everything in SQLite on the phone, so there is no account and no sign-in. Search is instant even with ten thousand notes, and it works on a plane with no signal. Backups are plain files you can read anywhere, not a locked format. It costs four pounds, once, and that is the whole price. If you keep notes on paper because apps feel creepy, this one is for you.',
    keep: ['SQLite', 'ten thousand', 'plane', 'four', 'weekend', 'paper'],
    why: 'X post past 280: every part within the cap, no facts added, 3 hooks' },
  { id: 'H02-linkedin-thread', kind: 'thread', app: 'com.linkedin.android',
    typed: 'After nine years leading platform teams at two banks, I am starting my own consultancy. Lesson one from the first month on my own: say no to work that drains you, even when the money looks good.\n\nMost teams I join have the same shape. Twelve engineers, three managers, and a roadmap with forty items where only five matter. My first week is always the same: I read every ticket, sit in on standup for four days, and ask which five they would keep if they could only ship five.\n\nLast Tuesday I did this with a retail team in Leeds. Priya, their lead, told me checkout latency had doubled since January. We traced it to a single chatty call the app made on every page load. One small cache, added on Thursday, cut the slow calls from 900ms to 210ms. No rewrite, no new service, no drama.\n\nThat is the whole pitch. I find the one slow thing, fix it with the team watching, and leave notes they can keep. Marisol, who runs support there, said tickets about slow checkouts fell by half the next week.\n\nBefore Leeds I spent three weeks with a bookings team in York. Same shape: fourteen engineers, a deploy that took fifty minutes, and a test suite with two thousand tests where three hundred failed every run. We split the suite into fast and slow, ran the fast half on every push, and got the deploy down to eleven minutes by the second Friday. Their release train went from monthly to weekly in March.\n\nI charge one flat price for the four weeks, paid half up front. No day rate, no hourly meter running while you explain your stack. If the first week shows there is nothing worth fixing, I say so and you pay nothing for the rest. That has happened once, with a team in Hull, and they still send me referrals.\n\nHow it starts: a thirty minute call, no slides. You tell me what feels slow, I ask who owns it and what changed since autumn. If it sounds like a fit, I join your standup the next Monday. I bring my own laptop, I sign whatever paper your office needs, and I never keep your code.\n\nWrite to me here and mention the one screen your users complain about most. I take the next team from the first of next month, and the diary after that opens in spring.\n\nWhat I will not do: no audits that land as a fifty page deck nobody reads, no dashboards you stop opening by June, and no advice to rewrite what already earns. If your team already knows the slow thing and needs hands, not eyes, say so on the call and I will tell you straight.\n\nOne more story, since people ask for proof more than promises. A charity shop site in Sheffield raised funds every December with a page that fell over each year. Two volunteers kept it alive with nightly restarts through Christmas. Last November we moved the donate button reads to a static copy, queued the writes, and the page stayed up through the whole drive. Donations beat the prior year by a fifth, and nobody restarted anything at midnight. That evening the two volunteers went home early for the first time in years, which is the part I like best. If you are reading this on a Monday and already know which screen is slow, say so in your note and I will tell you plainly whether I have seen its shape before.',
    keep: ['nine', 'consultancy', 'Leeds', 'Priya', '900', '210', 'Marisol', 'York', 'eleven', 'Hull', 'Monday', 'spring'],
    why: 'LinkedIn post past 3000: every part within the cap, no facts added, 3 hooks' },
  // --- Package G (§7.3): twenty feed cases, ten X-style and ten Reddit-style, scored by the
  // G2 checks. Fictional authors and demo data only; the person is "Umer". The demo voice profile
  // is the one the plan names: never-say "game changer", "delve", "circle back"; noDashes; three
  // sample replies. These are reported beside the five-case gate, never part of it.
  ...([
    ['G01-x-notes-app', 'com.twitter.android', 'Demo Maker', 'Shipped a tiny offline-first notes app today. Local SQLite, no account, search is instant with ten thousand notes.', 'nice - does search stay fast when you paste in a huge doc?', 'X post: keep the reply concrete'],
    ['G02-x-queue', 'com.twitter.android', 'Nadia Chen', 'Spent the weekend replacing our cron jobs with one queue. Deploys finally stopped racing each other.', undefined, 'X post: no draft, still no invented facts'],
    ['G03-x-scope', 'com.twitter.android', 'Ravi Patel', 'Unpopular take: most side projects die from scope, not from a lack of ideas.', 'this is a game changer, most side projects die from scope.', 'X post: his draft uses a never-say phrase and is shown as Yours at the bottom level'],
    ['G04-x-index', 'com.twitter.android', 'Tess Morgan', 'Reminder that a slow query with an index beats a clever cache you forget to invalidate.', undefined, 'X post: keep his wording out of the reply'],
    ['G05-x-timer', 'com.twitter.android', 'Owen Brooks', 'My timer now pauses when you switch tabs. Only focused minutes count.', 'does it keep counting if i leave it on the same tab?', 'X post: a question from his draft'],
    ['G06-x-tests', 'com.twitter.android', 'Mei Lin', 'Wrote forty tests, deleted thirty. The suite is faster and i trust it more.', undefined, 'X post: one concrete point'],
    ['G07-x-bug', 'com.twitter.android', 'Sam Ruiz', 'Filed my first bug report in a big repo today. Maintainers were kind about it.', undefined, 'X post: warm, no invented numbers'],
    ['G08-x-config', 'com.twitter.android', 'Kai Nakamura', 'A plain text file beat my database for a two hundred row config. Ship the boring thing.', 'yeah, i keep reaching for a db when a file would do.', 'X post: agree from his draft'],
    ['G09-x-commits', 'com.twitter.android', 'Jules Avery', 'Reading old commit messages is the cheapest onboarding doc a team can have.', undefined, 'X post: no never-say in the reply'],
    ['G10-x-cli', 'com.twitter.android', 'Priya Rao', 'Made a tiny CLI that renames screenshots by date. Twenty lines, saves me ten minutes a day.', undefined, 'X post: keep the reply short'],
    ['G11-reddit-cooler', 'com.reddit.frontpage', 'u/trail_mix', 'r/CampingGear: Soft cooler or hard-sided for a weekend trip? I walk in, so weight matters.', 'soft is fine for a weekend if you are not leaving it in the sun all day.', 'Reddit thread: reasoned answer from his draft'],
    ['G12-reddit-index', 'com.reddit.frontpage', 'u/slow_query', 'r/webdev: Do you keep indexes in migrations or just add them by hand in prod?', undefined, 'Reddit thread: one detail, no invented numbers'],
    ['G13-reddit-pan', 'com.reddit.frontpage', 'u/spice_rack', 'r/Cooking: What is the one pan you actually use every day?', undefined, 'Reddit thread: specific, on topic'],
    ['G14-reddit-savings', 'com.reddit.frontpage', 'u/budget_nerd', 'r/personalfinance: I automated my savings and stopped checking the balance daily.', 'same, the daily checking was the whole problem for me.', 'Reddit thread: agree from his draft'],
    ['G15-reddit-books', 'com.reddit.frontpage', 'u/night_owl', 'r/books: I read fifty books this year and remember about five of them.', undefined, 'Reddit thread: add something the thread lacks'],
    ['G16-reddit-plant', 'com.reddit.frontpage', 'u/desk_plant', 'r/houseplants: My monstera keeps dropping leaves. Light is fine, water is weekly. What else?', undefined, 'Reddit thread: ask one sharp question'],
    ['G17-reddit-keys', 'com.reddit.frontpage', 'u/mech_keys', 'r/MechanicalKeyboards: Is a 65 percent layout worth losing the function row?', undefined, 'Reddit thread: honest tradeoff'],
    ['G18-reddit-travel', 'com.reddit.frontpage', 'u/road_trip', 'r/travel: Two weeks in one city or four cities? First long trip.', undefined, 'Reddit thread: a reason, not empty agreement'],
    ['G19-reddit-games', 'com.reddit.frontpage', 'u/board_games', 'r/boardgames: Games that are still fun for two people when the group shrinks?', undefined, 'Reddit thread: specific picks'],
    ['G20-reddit-coffee', 'com.reddit.frontpage', 'u/coffee_first', 'r/Coffee: Cheapest upgrade from a drip machine that still tastes better?', undefined, 'Reddit thread: actionable specifics'],
  ] as const).map(([id, app, author, post, draft, why]) => ({
    id, kind: 'feed' as const, app, author, post, ...(draft ? { draft } : {}),
    voice: { never: ['game changer', 'delve', 'circle back'], noDashes: true, samples: [
      'yeah that tracks, i hit the same thing last week',
      'nice, what did you use for the storage layer?',
      'agreed, though i would keep the cache small at first',
    ] },
    why,
  })),
];

import { readFileSync } from 'fs';
import nspell from 'nspell';
import { count, fixed, fixedSlips, slips, suggestion, GRAMMAR, SPELLING } from '../typing';
import { NO_RULES } from '../slop';

const speller = nspell(readFileSync(`${__dirname}/../../../assets/dictionary/en-affixes.aff`, 'utf8'), readFileSync(`${__dirname}/../../../assets/dictionary/en-words.dic`, 'utf8'));

/** Each slip as "word→fix", in order. */
const withFixes = (text: string) => slips(text, speller).map(s => ({ ...s, fix: s.fix ?? (s.reason === SPELLING ? suggestion(text.slice(s.start, s.end), speller) : undefined) }));
const shown = (text: string) => withFixes(text).map(s => `${text.slice(s.start, s.end)}→${s.fix ?? '?'}`);

// The fixed list the rules grow from: [what was typed, what is marked].
test.each<[string, string[]]>([
  ['Its a great idea, lets go with it.', ['Its→It\'s', 'lets→let\'s']],
  ['The dog wagged its tail at the park.', []],
  ['She lets go of the rope every time.', []],
  ['I saw a elephant and an bike today.', ['a→an', 'an→a']],
  ['It was an honest mistake, a unique one.', []],
  ['She got an MBA and a UFO sticker, An apple too.', []],
  ['Wait... then we go. Maybe later?', []],
  ['I think the the meeting moved to Friday.', [' the→']],
  ['Yesterday i went home and i\'m tired now.', ['i→I', 'i→I']],
  ['i went home and im tired, see you tmrw', ['im→I\'m']],
  ['See you at noon. thanks for waiting on me.', ['t→T']],
  ['Thanks. dont worry about it now.', ['dont→Don\'t']],
  ['Meet me at 5 p.m. tomorrow at the cafe.', []],
  ['This one is better then the last one I got.', ['then→than']],
  // Your/you're needs context: even "your welcome" can be a noun phrase.
  // The advisory rule is dropped, so these mistakes are deliberately left alone too.
  ['Thanks so much, your welcome to join us.', []],
  ['Your welcome.', []],
  ['Your right.', []],
  ['Your going home.', []],
  ['Your car is parked outside the office now.', []],
  ['Keep your right hand warm.', []],
  ['Take your own car today.', []],
  ['Bring your best friend along.', []],
  ['I appreciated your welcome.', []],
  ['Keep your welcome letter safe.', []],
  ['Enjoy your going away party.', []],
  ['Tell your very best friend.', []],
  ['Share your amazing idea.', []],
  ["You're welcome.", []],
  ["You're right.", []],
  ["You're going home.", []],
  ['I think youre going home.', ['youre→you\'re']],
  ['I shoud recieve it on friday, definately.', ['shoud→should', 'recieve→receive', 'friday→Friday', 'definately→definitely']],
  ['lol ok that sounds good, see you at 8', []],
  ['Umer and Priya liked the WhatsApp message.', []],
  ['Check https://example.com/teh-page or #teh or @tehh please.', []],
  ['It\'s own engine runs on a loop all day.', ['It\'s→Its']],
])('%s', (text, marks) => expect(shown(text)).toEqual(marks));

test('a slip is fixed only where it is', () => {
  const text = 'I think the the meeting moved.';
  const [slip] = withFixes(text);
  expect(slip.reason).toBe(GRAMMAR);
  expect(fixed(text, slip)).toBe('I think the meeting moved.');
  const typo = withFixes('We shoud go.')[0];
  expect(typo.reason).toBe(SPELLING);
  expect(fixed('We shoud go.', typo)).toBe('We should go.');
});

test('a pause never works out fixes, and counts stock phrases too', () => {
  expect(slips('We shoud go now.', speller).map(s => s.fix)).toEqual([undefined]);
  expect(slips('i think im late, Sam.', speller).map(s => s.fix)).toEqual(['I', "I'm"]);
  expect(count('We shoud circle back at the end of the day.', speller, NO_RULES)).toBe(3);
  expect(count('See you at the cafe at noon.', speller, NO_RULES)).toBe(0);
});

test('no close word, no fix', () => expect(suggestion('qwxzvbn', speller)).toBeUndefined());

test('without the dictionary known slips still run', () => expect(slips('Its a shoud day.', null).map(s => s.fix)).toEqual(["It's", "should"]));

// The on-phone budget is under a frame (16 ms) per pause; the host is far faster, so this only catches a runaway.
test('a pause check is quick', () => {
  const text = 'Hey, its been a while! I shoud recieve the package on friday and lets meet then. ' .repeat(4);
  const started = performance.now();
  for (let i = 0; i < 50; i++) count(text, speller, NO_RULES);
  expect((performance.now() - started) / 50).toBeLessThan(16);
});

test('all local fixes keep names, links, slang, list markers and numbers', () => {
  const typed = 'Its a good plan, Umer shoud be there by the the evening.\n1. Meet at 8, lol: https://example.com/teh';
  expect(fixedSlips(typed, speller)).toBe("It's a good plan, Umer should be there by the evening.\n1. Meet at 8, lol: https://example.com/teh");
  expect(fixedSlips('Its a qwxzvbn plan.', speller)).toBe("It's a qwxzvbn plan.");
});

test.each([
  ['I dont dont know.', "I don't don't know."],
  ['We shoud shoud go.', 'We should should go.'],
  ['We shoud shoud shoud go.', 'We should should should go.'],
  ['Keep your right hand warm. I shoud leave.', 'Keep your right hand warm. I should leave.'],
  ['Meet by teh the evening.', 'Meet by the evening.'],
  ['Its teh plan.', "It's the plan."],
  ['Its teh teh plan.', "It's the plan."],
  ['Meet by teh teh the evening.', 'Meet by the evening.'],
  ['Its a plan. yesterday i saw a elephant better then that.', "It's a plan. yesterday i saw a elephant better then that."],
  ['We met Shoud and Umer on friday.', 'We met Shoud and Umer on friday.'],
  ['the\nthe plan', 'the\nthe plan'],
  ['The the plan', 'The the plan'],
])('automatic cleanup preserves advisory wording: %s', (typed, expected) => {
  expect(fixedSlips(typed, speller)).toBe(expected);
});

test('automatic spelling uses only known safe corrections', () => {
  const ambiguous = { correct: () => false, suggest: () => ['cat', 'bat'] };
  expect(fixedSlips('We saw a dat.', ambiguous)).toBe('We saw a dat.');
  expect(fixedSlips('dat', { correct: () => false, suggest: () => ['cat', 'elephant'] })).toBe('dat');
  expect(fixedSlips('dat', { correct: () => false, suggest: () => ['cat'] })).toBe('dat');
  expect(fixedSlips('Bring woud for the fire.', speller)).toBe('Bring woud for the fire.');
  expect(fixedSlips('shoud teh recieve', speller)).toBe('should the receive');
  expect(fixed('Its a plan.', withFixes('Its a plan.')[0])).toBe("It's a plan.");
});

test.each([
  ['What it is is unclear.', 'What it is is unclear.'],
  ['I know that that works.', 'I know that that works.'],
  ['Log in in the morning.', 'Log in in the morning.'],
  ['Move on on Monday.', 'Move on on Monday.'],
  ['give it to to make', 'give it to to make'],
  ['get by by saving', 'get by by saving'],
  ['nobody to go with with you away.', 'nobody to go with with you away.'],
  ['We should visit Bora Bora.', 'We should visit Bora Bora.'],
  ["Give Ben Ben's keys.", "Give Ben Ben's keys."],
  ['Hey @will will you join us?', 'Hey @will will you join us?'],
  ['Hey @the the plan', 'Hey @the the plan'],
  ['Hey #the the plan', 'Hey #the the plan'],
  ['See https://site.test/the the plan', 'See https://site.test/the the plan'],
  ['Email the@site.test the plan', 'Email the@site.test the plan'],
  ["Keep it it's yours.", "Keep it it's yours."],
  ['Keep it it’s yours.', 'Keep it it’s yours.'],
  ['the @tag the plan', 'the @tag the plan'],
  ['the #tag the plan', 'the #tag the plan'],
  ['the https://site.test the plan', 'the https://site.test the plan'],
  ['the email@site.test the plan', 'the email@site.test the plan'],
  ['Keep it itemized.', 'Keep it itemized.'],
  ['the the\u0301 plan', 'the the\u0301 plan'],
  ['See αthe the plan', 'See αthe the plan'],
  ['See the theα plan', 'See the theα plan'],
  ['See _the the plan', 'See _the the plan'],
  ['by the the evening', 'by the evening'],
  ['by the The evening', 'by the evening'],
  ['by the The the evening', 'by the evening'],
  ['by the The THE the evening', 'by the evening'],
  ['by The the evening', 'by The the evening'],
  ['by the the the evening', 'by the evening'],
])('automatic doubles use complete unprotected articles: %s', (typed, expected) => {
  expect(fixedSlips(typed, null)).toBe(expected);
});

test.each('the a an'.split(' '))('automatic doubles include %s', word => {
  expect(fixedSlips(`${word} ${word}`, null)).toBe(word);
});

test.each([
  ['Its a good plan.', "It's a good plan."],
  ['its an idea.', "it's an idea."],
  ['Its the plan.', "It's the plan."],
  ['Its own engine', 'Its own engine'],
  ['Its another plan.', 'Its another plan.'],
  ['ITS a plan.', 'ITS a plan.'],
  ['@Its a plan. #its an idea. https://site.test/its the plan.', '@Its a plan. #its an idea. https://site.test/its the plan.'],
  ['αIts a plan. _its a plan. itś a plan.', 'αIts a plan. _its a plan. itś a plan.'],
])('automatic apostrophe cleanup is narrow: %s', (typed, expected) => {
  expect(fixedSlips(typed, null)).toBe(expected);
});

test('automatic contractions fix clear forms and preserve ambiguous ones', () => {
  expect(fixedSlips('I dont know. I shoud go.', speller)).toBe("I don't know. I should go.");
  expect(fixedSlips(
    'dont doesnt didnt isnt wasnt arent werent couldnt shouldnt wouldnt havent hasnt hadnt im ive youre theyre thats whats theres',
    speller,
  )).toBe("don't doesn't didn't isn't wasn't aren't weren't couldn't shouldn't wouldn't haven't hasn't hadn't I'm I've you're they're that's what's there's");
  const ambiguous = 'cant wont lets were well hell shed wed ill id its';
  expect(fixedSlips(ambiguous, speller)).toBe(ambiguous);
  expect(fixedSlips('We cant go and I wont', speller)).toBe('We cant go and I wont');
  expect(fixedSlips('https://site.test/dont @im #thats', speller)).toBe('https://site.test/dont @im #thats');
});

test('correction tables do not inherit object keys', () => {
  const noSuggestions = { correct: () => true, suggest: () => [] };
  for (const word of ['constructor', 'toString', '__proto__']) {
    expect(suggestion(word, noSuggestions)).toBeUndefined();
    expect(slips(word, noSuggestions)).toEqual([]);
    expect(fixedSlips(word, noSuggestions)).toBe(word);
  }
  expect(fixedSlips('The constructor is ready.', speller)).toBe('The constructor is ready.');
  expect(fixedSlips('toString works', speller)).toBe('toString works');
  expect(shown('The constructor is ready.')).toEqual([]);
});

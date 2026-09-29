import { readFileSync } from 'fs';
import nspell from 'nspell';
import { count, fixed, slips, suggestion, GRAMMAR, SPELLING } from '../typing';
import { NO_RULES } from '../slop';

const speller = nspell(readFileSync(`${__dirname}/../../../assets/dictionary/en-affixes.aff`, 'utf8'), readFileSync(`${__dirname}/../../../assets/dictionary/en-words.dic`, 'utf8'));

/** Each slip as "word→fix", in order. */
const shown = (text: string) => slips(text, speller, true).map(s => `${text.slice(s.start, s.end)}→${s.fix ?? '?'}`);

// The fixed list the rules grow from: [what was typed, what is marked].
test.each<[string, string[]]>([
  ['Its a great idea, lets go with it.', ['Its→It\'s', 'lets→let\'s']],
  ['The dog wagged its tail at the park.', []],
  ['She lets go of the rope every time.', []],
  ['I saw a elephant and an bike today.', ['a→an', 'an→a']],
  ['It was an honest mistake, a unique one.', []],
  ['I think the the meeting moved to Friday.', [' the→']],
  ['Yesterday i went home and i\'m tired now.', ['i→I', 'i→I']],
  ['i went home and im tired, see you tmrw', ['im→I\'m']],
  ['See you at noon. thanks for waiting on me.', ['t→T']],
  ['Meet me at 5 p.m. tomorrow at the cafe.', []],
  ['This one is better then the last one I got.', ['then→than']],
  ['Thanks so much, your welcome to join us.', ['your→you\'re']],
  ['Your car is parked outside the office now.', []],
  ['I shoud recieve it on friday, definately.', ['shoud→should', 'recieve→receive', 'friday→Friday', 'definately→definitely']],
  ['lol ok that sounds good, see you at 8', []],
  ['Umer and Priya liked the WhatsApp message.', []],
  ['Check https://example.com/teh-page or #teh or @tehh please.', []],
  ['It\'s own engine runs on a loop all day.', ['It\'s→Its']],
])('%s', (text, marks) => expect(shown(text)).toEqual(marks));

test('a slip is fixed only where it is', () => {
  const text = 'I think the the meeting moved.';
  const [slip] = slips(text, speller, true);
  expect(slip.reason).toBe(GRAMMAR);
  expect(fixed(text, slip)).toBe('I think the meeting moved.');
  const typo = slips('We shoud go.', speller, true)[0];
  expect(typo.reason).toBe(SPELLING);
  expect(fixed('We shoud go.', typo)).toBe('We should go.');
});

test('a pause never works out fixes, and counts stock phrases too', () => {
  expect(slips('We shoud go now.', speller).every(s => s.fix === undefined)).toBe(true);
  expect(count('We shoud circle back at the end of the day.', speller, NO_RULES)).toBe(3);
  expect(count('See you at the cafe at noon.', speller, NO_RULES)).toBe(0);
});

test('no close word, no fix', () => expect(suggestion('qwxzvbn', speller)).toBeUndefined());

test('without the dictionary only the rules run', () => expect(slips('Its a shoud day.', null).map(s => s.fix)).toEqual(["It's"]));

// The on-phone budget is under a frame (16 ms) per pause; the host is far faster, so this only catches a runaway.
test('a pause check is quick', () => {
  const text = 'Hey, its been a while! I shoud recieve the package on friday and lets meet then. ' .repeat(4);
  const started = performance.now();
  for (let i = 0; i < 50; i++) count(text, speller, NO_RULES);
  expect((performance.now() - started) / 50).toBeLessThan(16);
});

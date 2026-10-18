import { canPolish, polishAcceptor, polishVersions } from '../polish';
import { itemVerbsKept } from '../drafts';
import { lineRetryPrompt, versionsList } from '../judge';

// The phone polish with the outputs a small model gives: an UNCLEAR point check still gets versions,
// their own text back gets one more pass for different words, and a text with no words is declined.
const typed = 'Quick question: is the Tuesday slot still open for the demo, or should I pick another day?';
const short = 'hey can u send me the file when u get a sec thx';
const json = (lines: string[]) => JSON.stringify({ versions: lines });
const request = (text: string, clear: boolean) => ({ typed: text, conversation: '', guide: '', dashes: 'remove' as const, avoid: [], clear });

test('an UNCLEAR point check on a short clear text still shows the versions', async () => {
  const out = await polishVersions(async () => json(['Can you send me the file when you get a second? Thanks.', 'Could you send the file when you have a moment?', 'Please send me the file when you can.']), request(short, false), () => {});
  expect(out.declined).toBeFalsy();
  expect(out.drafts.length).toBeGreaterThan(0);
});

test('versions that come back as their own text get one more pass for different words', async () => {
  // The first pass gets their own text back; only the retry, which says so, gets different words.
  const out = await polishVersions(async prompt => prompt.includes('came back unchanged')
    ? json(['Quick one: is the Tuesday slot still free for the demo, or should I pick another day?', 'Is Tuesday still open for the demo? Or should I pick another day?', 'Still got the Tuesday slot for the demo, or another day?'])
    : json([typed, typed, typed]), request(typed, true), () => {});
  expect(out.drafts.length).toBeGreaterThan(0);
});

test('a text with no words is declined without asking', async () => {
  const ask = jest.fn(async () => json(['x']));
  const out = await polishVersions(ask, request('!!!', false), () => {});
  expect(out.declined).toBe(true);
  expect(ask).not.toHaveBeenCalled();
});

test('a list text is judged by its verdict, whether the answer is bare or wrapped in markup', async () => {
  const list = 'Here is what I need from you:\n1. send the deck by Friday\n2. Confirm the budget\n3. book the room for Monday';
  expect(await canPolish(list, async () => 'UNCLEAR')).toBe(false);
  expect(await canPolish(list, async () => '**CLEAR**.')).toBe(true);
});

test('the leading verdict decides, and an answer that echoes both verdicts is unreadable', async () => {
  expect(await canPolish(short, async () => 'CLEAR: it makes sense')).toBe(true);
  expect(await canPolish(short, async () => 'CLEAR: this is not unclear')).toBe(true);
  expect(await canPolish(short, async () => 'UNCLEAR: it is not clear')).toBe(false);
  expect(await canPolish(short, async () => '**UNCLEAR**.')).toBe(false);
  await expect(canPolish(short, async () => 'CLEAR or UNCLEAR')).rejects.toThrow();
  await expect(canPolish(short, async () => 'maybe')).rejects.toThrow();
});

test('a slot whose layout fails in both passes gets one row retry', async () => {
  const list = 'Here is the plan:\n1. send the deck by Friday\n2. confirm the budget';
  const flat = 'Send the deck by Friday and confirm the budget.';
  const retry = lineRetryPrompt(list, '', versionsList[2], '', 'remove');
  let retries = 0;
  await polishVersions(async prompt => {
    if (prompt.includes(retry)) { retries++; return 'chatter with no rows'; }
    return json([list, flat]);
  }, request(list, true), () => {});
  expect(retries).toBe(1);
});

// Phone rerun 2026-10-18 (OnePlus 13, run 1): the small model called this clear list UNCLEAR and handed
// it back unchanged, and the panel ended on the unclear message with no card. Runs 2-3 showed a version
// that dropped the intro line. Real text never dead-ends, and a list keeps every line.
const phoneList = 'Here is what I need from you:\n1. send the deck by Friday\n2. confirm the budget\n3. book the room for Monday';

test('a clear list the point check calls UNCLEAR and the writer hands back unchanged ends as their own text, not declined', async () => {
  const clear = await canPolish(phoneList, async () => 'UNCLEAR');
  const out = await polishVersions(async () => json([phoneList, phoneList]), request(phoneList, clear), () => {});
  expect(out.declined).toBeFalsy();
  expect(out.unchanged).toBe(true);
});

test('a list version that drops the intro line is not shown', async () => {
  const noIntro = '1. Send the deck by Friday.\n2. Confirm the budget.\n3. Book the room for Monday.';
  const kept = 'Here is what I need from you:\n1. Send the deck by Friday.\n2. Confirm the budget.\n3. Book the room for Monday.';
  const landed: string[] = [];
  const out = await polishVersions(async prompt => prompt.includes('Their text, by row:') ? 'no rows' : json([noIntro, kept]), request(phoneList, true), text => landed.push(text));
  expect(out.drafts).toEqual([kept]);
  expect(landed).not.toContain(noIntro);
});

// Phone proof 2026-10-18 (PR 246): for this list the SHORTER card came back with only
// capital letters (not shorter), and MAIN POINT FIRST reworded item 1's verb ('send' became
// 'provide'). Shorter must cut words; Main point first may reorder but keeps each item's own words.
const wordingList = 'Here is what I need from you:\n1. send the deck by Friday\n2. confirm the budget\n3. book the room for Monday';

test('the writer prompts ask Shorter for fewer words and Main point first to keep each item\'s own words', () => {
  expect(versionsList[1].ask).toMatch(/strictly fewer words/);
  expect(versionsList[2].ask).toMatch(/own words/);
});

test('Shorter rejects a casing-only version and a same-word-count reword', async () => {
  for (const shorter of [
    'Here Is What I Need From You:\n1. Send The Deck By Friday\n2. Confirm The Budget\n3. Book The Room For Monday',
    'Here is what I want from you:\n1. send the deck by Friday\n2. confirm the budget\n3. book the room for Monday',
  ]) {
    const acceptor = await polishAcceptor(wordingList, 'remove', [], null);
    expect(acceptor.accept(shorter, 1, 'Shorter')).toBeNull();
    expect(acceptor.results).toEqual([]);
  }
});

test('Shorter shows a version with fewer words', async () => {
  const acceptor = await polishAcceptor(wordingList, 'remove', [], null);
  const shorter = 'What I need:\n1. send deck by Friday\n2. confirm budget\n3. book room Monday';
  expect(acceptor.accept(shorter, 1, 'Shorter')).toBe(shorter);
  expect(acceptor.results).toEqual([{ text: shorter, slot: 1, label: 'Shorter' }]);
});

test('Main point first shows a reorder that keeps each item\'s own words', async () => {
  const acceptor = await polishAcceptor(wordingList, 'remove', [], null);
  const reordered = 'Here is what I need from you:\n1. book the room for Monday\n2. send the deck by Friday\n3. confirm the budget';
  expect(acceptor.accept(reordered, 2, 'Main point first')).toBe(reordered);
});

test('Main point first drops a version that loses an item', async () => {
  const acceptor = await polishAcceptor(wordingList, 'remove', [], null);
  const dropped = 'Here is what I need from you:\n1. Send the deck by Friday.\n2. Confirm the budget.';
  expect(acceptor.accept(dropped, 2, 'Main point first')).toBeNull();
  expect(acceptor.results).toEqual([]);
});

test('a Shorter that stays the same length is retried once, then not shown', async () => {
  const cased = 'Here Is What I Need From You:\n1. Send The Deck By Friday\n2. Confirm The Budget\n3. Book The Room For Monday';
  const reordered = 'Here is what I need from you:\n1. book the room for Monday\n2. send the deck by Friday\n3. confirm the budget';
  let retries = 0;
  const landed: string[] = [];
  const out = await polishVersions(async prompt => {
    if (prompt.includes('Their text, by row:')) { retries++; return 'chatter with no rows'; }
    return json([cased, reordered]);
  }, request(wordingList, true), text => landed.push(text));
  expect(retries).toBe(1);
  expect(out.drafts).toEqual([reordered]);
  expect(landed).not.toContain(cased);
});

// Round 2 (never trade a card for no card): a reorder that changes an item's verbs is not
// shown; the row retry falls back to the polished same-order version instead of dropping it.
const verbChanged = 'Here is what I need from you:\n1. Please provide the deck by Friday.\n2. Confirm the budget.\n3. Book the room for Monday.';

test('itemVerbsKept compares each item\'s own verb, order-insensitively', () => {
  const reordered = 'Here is what I need from you:\n1. book the room for Monday\n2. send the deck by Friday\n3. confirm the budget';
  expect(itemVerbsKept(wordingList, reordered)).toBe(true);
  expect(itemVerbsKept(wordingList, verbChanged)).toBe(false);
  expect(itemVerbsKept(wordingList, 'Here is what I need from you:\n1. Send the deck by Friday.\n2. Confirm the budget.')).toBe(false);
  expect(itemVerbsKept('bring this back', 'bring this back!')).toBe(true);
});

test('Main point first drops a reorder that changes an item\'s verb and queues the same-order retry', async () => {
  const acceptor = await polishAcceptor(wordingList, 'remove', [], null);
  expect(acceptor.accept(verbChanged, 2, 'Main point first')).toBeNull();
  expect(acceptor.results).toEqual([]);
  expect(acceptor.layoutFails).toEqual([{ slot: 2, label: 'Main point first' }]);
});

test('Main point first fix shows the polished same-order fallback', async () => {
  const kept = await polishAcceptor(wordingList, 'remove', [], null);
  const fallback = 'Here is what I need from you:\n1. Send the deck by Friday\n2. Confirm the budget\n3. Book the room for Monday';
  expect(kept.fix(fallback, 2, 'Main point first')).toBe(fallback);
  // The fallback is same-order by construction, so a card is never traded for no card even
  // when the rows mildly reword a verb; the reorder attempt above is what refuses verb changes.
  const reworded = await polishAcceptor(wordingList, 'remove', [], null);
  const rows = 'Here is what I need from you:\n1. Bring the deck by Friday\n2. Confirm the budget\n3. Book the room for Monday';
  expect(reworded.fix(rows, 2, 'Main point first')).toBe(rows);
});

test('only the Shorter card hides while Main point first falls back to same-order polish', async () => {
  const cased = 'Here Is What I Need From You:\n1. Send The Deck By Friday\n2. Confirm The Budget\n3. Book The Room For Monday';
  const fallbackRows = 'Row 1: Here is what I need from you:\nRow 2: Send the deck by Friday\nRow 3: Confirm the budget\nRow 4: Book the room for Monday';
  const fallback = 'Here is what I need from you:\n1. Send the deck by Friday\n2. Confirm the budget\n3. Book the room for Monday';
  const landed: string[] = [];
  const out = await polishVersions(async prompt => {
    if (!prompt.includes('Their text, by row:')) return json([cased, verbChanged]);
    return prompt.includes('may reorder') ? fallbackRows : 'chatter with no rows';
  }, request(wordingList, true), text => landed.push(text));
  expect(out.drafts).toEqual([fallback]);
  expect(landed).toEqual([fallback]);
});

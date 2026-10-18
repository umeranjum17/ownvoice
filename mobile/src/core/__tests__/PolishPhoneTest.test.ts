import { canPolish, polishVersions } from '../polish';
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
  const list = 'Hi team,\n\nthe deck is due by Friday and the budget needs a yes';
  const flat = 'Hi team, the deck is due Friday and the budget needs your yes.';
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
  const echo = 'Row 1: Here is what I need from you:\nRow 2: send the deck by Friday\nRow 3: confirm the budget\nRow 4: book the room for Monday';
  const out = await polishVersions(async prompt => prompt.includes('Their text, by row:') ? echo : json([phoneList, phoneList]), request(phoneList, clear), () => {});
  expect(out.declined).toBeFalsy();
  expect(out.unchanged).toBe(true);
});

test('a list version that drops the intro line is not shown', async () => {
  const noIntro = '1. Send the deck by Friday.\n2. Confirm the budget.\n3. Book the room for Monday.';
  const kept = 'Here is what I need from you:\n1. Send the deck by Friday.\n2. Confirm the budget.\n3. Book the room for Monday.';
  const landed: string[] = [];
  const rows = 'Row 2: Send the deck by Friday.\nRow 3: Confirm the budget.\nRow 4: Book the room for Monday.';
  const out = await polishVersions(async prompt => !prompt.includes('Their text, by row:') ? json([noIntro, kept])
    : prompt.includes('Tighter:') ? rows : `Row 1: Here is what I need from you:\n${rows}`, request(phoneList, true), text => landed.push(text));
  expect(out.drafts).toEqual([kept]);
  expect(landed).not.toContain(noIntro);
});

// Phone rerun 2026-10-18 on 12efdf0: the small writer handed this list back unchanged on every whole-text
// pass, so all three runs ended on "No different version found". List text is written row by row from the start.
test('a numbered list gets a version card that keeps the intro line and every item, written row by row', async () => {
  const rows = 'Row 1: This is what I need from you:\nRow 2: Send the deck by Friday.\nRow 3: Confirm the budget.\nRow 4: Book the room for Monday.';
  const asked: string[] = [];
  const landed: string[] = [];
  const out = await polishVersions(async prompt => {
    asked.push(prompt);
    return prompt.includes('Their text, by row:') ? rows : json([phoneList, phoneList]);
  }, request(phoneList, true), text => landed.push(text));
  expect(out.drafts).toEqual(['This is what I need from you:\n1. Send the deck by Friday.\n2. Confirm the budget.\n3. Book the room for Monday.']);
  expect(landed).toEqual(out.drafts);
  expect(asked.some(p => p.includes('{"versions"'))).toBe(false);
});

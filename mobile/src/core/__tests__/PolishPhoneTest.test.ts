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

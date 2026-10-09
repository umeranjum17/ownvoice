import { readFileSync } from 'fs';
import nspell from 'nspell';
import { canPolish, polishAcceptor } from '../polish';
import { words } from '../words';

const spell = nspell(readFileSync(`${__dirname}/../../../assets/dictionary/en-affixes.aff`, 'utf8'), readFileSync(`${__dirname}/../../../assets/dictionary/en-words.dic`, 'utf8'));

test('original-point admission requires an explicit clear answer, never a fluent alternate', async () => {
  const typed = 'purple toaster clouds ate the database backwards banana banana';
  const bad = 'the database got eaten backwards by purple toaster clouds banana banana';
  expect(await canPolish(typed, async () => 'UNCLEAR')).toBe(false);
  for (const answer of ['', bad, 'CLEAR or UNCLEAR']) {
    await expect(canPolish(typed, async prompt => {
      expect(prompt).toContain(`Text:\n${typed}`);
      return answer;
    })).rejects.toThrow(words.noVersions);
  }
  expect(await canPolish('autosave locally and make export easy.', async () => 'CLEAR')).toBe(true);
});

// Live phone 2026-10-09 (a4b93ea2, Qwen2.5-1.5B): the old point-check prompt answered UNCLEAR for
// 'see you at 6' and 'will do', so the panel refused short everyday replies. The fix declines wordless
// input mechanically and asks the writer a narrow real-message-or-mash question with a few examples.
test('a message with no words is declined without asking the writer', async () => {
  const ask = jest.fn(async () => 'CLEAR');
  for (const text of ['\u{1F44D}', '...?!', '   ', '\u{1F389}\u{1F388}']) expect(await canPolish(text, ask)).toBe(false);
  expect(ask).not.toHaveBeenCalled();
});

test('the clarity question admits short everyday replies and declines keyboard mash', async () => {
  const prompts: string[] = [];
  const answer = (raw: string) => async (prompt: string) => { prompts.push(prompt); return raw; };
  for (const text of ['see you at 6', 'got it, thanks', 'will do']) expect(await canPolish(text, answer('CLEAR'))).toBe(true);
  for (const text of ['asdf qwer zxcv', 'qwerty asdf zxcvb']) expect(await canPolish(text, answer('UNCLEAR'))).toBe(false);
  expect(prompts[0]).toContain(`Text:\nsee you at 6`);
  expect(prompts[0]).toMatch(/keyboard mash/i);
});

// Main279 actual SHORTER capture, candidate 54df2b7: a newly split sentence kept lowercase.
test.each(['accept', 'fix'] as const)('polish %s cases the captured newly split sentence before showing it', async method => {
  const acceptor = await polishAcceptor('autosave locally and make export easy.', 'keep', [], spell);
  expect(acceptor[method]('autosave locally. make export easy.', 1, 'Shorter')).toBe('autosave locally. Make export easy.');
  expect(acceptor.results[0].text).toBe('autosave locally. Make export easy.');
});

test.each(['accept', 'fix'] as const)('polish %s ignores writer cleanup and shows only local fixes', async method => {
  for (const [typed, answer, expected] of [
    ['Its a good plan, I shoud be there by the the evening.', 'A different plan.', "It's a good plan, I should be there by the evening."],
    ['I shoud call at noon and leave at midnight.', 'I should call at midnight and leave at noon.', 'I should call at noon and leave at midnight.'],
    ['I shoud visit Bora Bora with @will.', 'I should visit Bora with @bill.', 'I should visit Bora Bora with @will.'],
    ['Keep your right hand warm. I shoud leave.', "Keep you're right hand warm. I should leave.", 'Keep your right hand warm. I should leave.'],
    ['Bring woud for the fire. I shoud leave.', 'Bring wood for the fire. I should leave.', 'Bring woud for the fire. I should leave.'],
    ['Meet by teh the evening.', 'Meet by teh the evening.', 'Meet by the evening.'],
    ['Meet by the The the evening.', 'Meet by the The the evening.', 'Meet by the evening.'],
    ['Its teh teh plan.', 'Its teh teh plan.', "It's the plan."],
  ]) {
    const acceptor = await polishAcceptor(typed, 'keep', [], spell);
    expect(acceptor.local).toBe(expected);
    expect(acceptor[method](answer, 0, 'Cleaned up')).toBeNull();
    expect(acceptor.results).toEqual([{ text: expected, slot: 0, label: 'Cleaned up' }]);
    expect(acceptor.layoutFails).toEqual([]);
  }
});

test('local cleanup leaves advisory wording unchanged and preserves other writer slots', async () => {
  for (const typed of ['The constructor is ready.', 'autosave locally and make export easy.', 'toString works', 'What it is is unclear.', 'I know that that works.', 'Log in in the morning.', 'Move on on Monday.', 'give it to to make', 'get by by saving', 'Its own engine', 'Bring woud for the fire.', 'We should visit Bora Bora.', "Give Ben Ben's keys.", 'Hey @will will you join us?']) {
    const acceptor = await polishAcceptor(typed, 'keep', [], spell);
    expect(acceptor.local).toBeNull();
    expect(acceptor.results).toEqual([]);
    expect(acceptor.unchanged).toBe(false);
  }
  const acceptor = await polishAcceptor('Bring woud for the fire.', 'keep', [], spell);
  expect(acceptor.accept('Bring wood for the fire.', 1)).toBe('Bring wood for the fire.');
  expect(acceptor.fix('Bring wood.', 2)).toBe('Bring wood.');
});

test('local cleanup keeps protected dashes with no-dashes enabled', async () => {
  for (const token of ['https://example.com/a—b.', 'a—b@example.com', '@a—b', '#a—b']) {
    const acceptor = await polishAcceptor(`I shoud read ${token}`, 'remove', [], spell);
    expect(acceptor.local).toBe(`I should read ${token}`);
  }
  const ordinary = await polishAcceptor('I shoud read — later.', 'remove', [], spell);
  expect(ordinary.local).toBe('I should read, later.');
  const dashOnly = await polishAcceptor('I should read — later.', 'remove', [], spell);
  expect(dashOnly.local).toBe('I should read, later.');
  expect(dashOnly.unchanged).toBe(false);
});


test.each(['accept', 'fix'] as const)('unchanged requires writer evidence through %s', async method => {
  const typed = 'Please bring the stove.';
  const acceptor = await polishAcceptor(typed, 'keep', [], spell);
  expect(acceptor.unchanged).toBe(false);
  expect(acceptor[method](typed, 0)).toBeNull();
  expect(acceptor.unchanged).toBe(false);
  expect(acceptor[method](typed, 1)).toBeNull();
  expect(acceptor.unchanged).toBe(true);
  expect(acceptor[method]('Bring the stove.', 2)).toBe('Bring the stove.');
  expect(acceptor.unchanged).toBe(false);
  const excluded = await polishAcceptor('We shoud leave.', 'keep', ['We should leave.'], spell);
  expect(excluded.local).toBeNull();
  expect(excluded.unchanged).toBe(false);
});

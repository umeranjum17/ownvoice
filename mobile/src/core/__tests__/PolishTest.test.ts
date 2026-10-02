import { readFileSync } from 'fs';
import nspell from 'nspell';
import { polishAcceptor } from '../polish';

const spell = nspell(readFileSync(`${__dirname}/../../../assets/dictionary/en-affixes.aff`, 'utf8'), readFileSync(`${__dirname}/../../../assets/dictionary/en-words.dic`, 'utf8'));

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

import { readFileSync } from 'fs';
import nspell from 'nspell';
import { polishAcceptor } from '../polish';
import { polishBasics, polishGuard, PolishConcern } from '../polishGuard';
import { words } from '../words';
import { withPhoneFallback } from '../writers';

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
  for (const typed of ['The constructor is ready.', 'toString works', 'What it is is unclear.', 'I know that that works.', 'Log in in the morning.', 'Move on on Monday.', 'give it to to make', 'get by by saving', 'Its own engine', 'Bring woud for the fire.', 'We should visit Bora Bora.', "Give Ben Ben's keys.", 'Hey @will will you join us?']) {
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

test('polish qualification rejects misleading labels and meaning changes before acceptance, and never falls back for garbled input', async () => {
  const original = 'Hi, the heater has been broken since Monday. Please fix it soon.';
  const ask = jest.fn().mockResolvedValueOnce(JSON.stringify({ readable: { true: 1, false: 0 }, mainLater: { true: 1, false: 0 } }))
    .mockResolvedValueOnce(JSON.stringify({
      meaning0: { true: 1, false: 0 }, label0: { true: 1, false: 0 },
      meaning1: { true: 1, false: 0 }, label1: { true: 0, false: 1 },
    }));
  const guard = await polishGuard(original, ask, true);
  const shorter = { text: 'Hi, the heater broke Monday. Please fix it soon.', slot: 1 };
  await expect(guard.qualify([
    { text: 'Hi, the heater has been broken since Monday. Please fix it as soon as possible.', slot: 1 },
    shorter,
    { text: 'The heater has been broken since Monday. Please fix it as soon as possible.', slot: 2 },
  ])).resolves.toEqual([shorter]);
  expect(ask).toHaveBeenCalledTimes(2);
  const modalAsk = jest.fn().mockResolvedValue(JSON.stringify({ readable: { true: 1, false: 0 }, mainLater: { true: 0, false: 1 } }));
  const modal = await polishGuard('I should pack the stove.', modalAsk, false);
  await expect(modal.qualify([{ text: 'Yes, I will bring the stove..', slot: 1 }])).resolves.toEqual([]);
  expect(modalAsk).toHaveBeenCalledTimes(1);
  const spelling = await polishAcceptor('I shoud autosave locally', 'keep', [], spell);
  const rejectsSubstitution = jest.fn().mockResolvedValueOnce(JSON.stringify({ readable: { true: 1, false: 0 }, mainLater: { true: 0, false: 1 } }))
    .mockResolvedValueOnce(JSON.stringify({ meaning0: { true: 0, false: 1 }, label0: { true: 0, false: 1 } }));
  const localGuard = await polishGuard('I shoud autosave locally', rejectsSubstitution, true);
  expect(spelling.local).not.toBeNull();
  await expect(localGuard.qualify([{ text: 'I should autoclave locally', slot: 0 }])).resolves.toEqual([]);
  spelling.rejectLocal();
  expect(spelling.results).toEqual([]);
  const alreadyLeading = await polishGuard('I think I should pack the stove before we leave on Saturday. Umer can bring the tent.', modalAsk, true);
  await expect(alreadyLeading.qualify([{ text: 'Umer can bring the tent. I think I should pack the stove before we leave on Saturday.', slot: 2 }])).resolves.toEqual([]);
  const promise = 'Just wanted to let you know that I will send Umer the revised plan by Friday, but I cannot promise the final price yet.';
  expect(polishBasics(promise, { text: "I'll send Umer the revised plan by Friday, but I can't promise the final price yet.", slot: 1 })).toBe(true);
  expect(polishBasics(promise, { text: "I'll send Umer the revised plan by Friday, but I can promise the final price yet.", slot: 1 })).toBe(false);
  expect(polishBasics('Umer said he would pack the stove, while I should check the tent before we leave.', { text: "Umer said he'd pack the stove; I should check the tent before we leave.", slot: 1 })).toBe(true);
  expect(polishBasics('Yes, I should pack the stove..', { text: 'Yes, Yes, I should pack the stove...', slot: 0 })).toBe(false);
  const list = await polishAcceptor('Please bring the tent\n1. Pack the stove\n2. Meet Saturday at noon', 'keep', [], spell);
  expect(list.layoutRetries([{ text: 'Bring the tent; pack the stove; meet Saturday at noon.', slot: 1 }])).toEqual([{ slot: 1, label: 'Shorter' }]);
  expect(list.results).toEqual([]);
  const incoherent = jest.fn().mockResolvedValue(JSON.stringify({ readable: { true: 0, false: 1 } }));
  const fallback = { write: jest.fn() };
  await expect(withPhoneFallback({ write: async () => {
    await polishGuard('purple toaster clouds ate the database backwards banana banana', incoherent, true);
    return { drafts: [] };
  } }, fallback, { typed: 'purple toaster clouds ate the database backwards banana banana', written: '', conversation: '' }, {}, undefined, 'cant'))
    .rejects.toThrow(words.polishUnclear);
  expect(fallback.write).not.toHaveBeenCalled();
  await expect(polishGuard(original, async () => 'malformed decision', true)).rejects.toBeInstanceOf(PolishConcern);
});

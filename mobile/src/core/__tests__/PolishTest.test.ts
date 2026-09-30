import { readFileSync } from 'fs';
import nspell from 'nspell';
import { polishAcceptor } from '../polish';

const spell = nspell(readFileSync(`${__dirname}/../../../assets/dictionary/en-affixes.aff`, 'utf8'), readFileSync(`${__dirname}/../../../assets/dictionary/en-words.dic`, 'utf8'));

test.each(['accept', 'fix'] as const)('polish %s corrects only remaining automatic slips', async method => {
  const typed = 'Its a plan. We shoud go by the the evening at 8.';
  const acceptor = await polishAcceptor(typed, 'keep', [], spell);
  expect(acceptor[method]("It's a plan. We shoud go by the the evening at 8.", 0)).toBe("It's a plan. We should go by the evening at 8.");
  const advisory = await polishAcceptor('Its own engine', 'keep', [], spell);
  expect(advisory[method]('Its own engine', 0)).toBeNull();
  expect(advisory.unchanged).toBe(true);
  const other = await polishAcceptor(typed, 'keep', [], spell);
  expect(other[method]('We shoud go by the evening at 8.', 1)).toBe('We shoud go by the evening at 8.');
  const ambiguous = await polishAcceptor('Bring woud for the fire.', 'keep', [], spell);
  expect(ambiguous[method]('Bring woud for the fire.', 0)).toBeNull();
  expect(ambiguous.unchanged).toBe(true);
  const corrected = await polishAcceptor('Bring woud for the fire.', 'keep', [], spell);
  expect(corrected[method]('Bring wood for the fire.', 0)).toBe('Bring wood for the fire.');
  for (const typed of ['Meet by teh the evening.', 'Meet by the The the evening.']) {
    const repeated = await polishAcceptor(typed, 'keep', [], spell);
    expect(repeated[method](typed, 0)).toBe('Meet by the evening.');
  }
});

test.each(['accept', 'fix'] as const)('polish %s preserves repeated names and handles', async method => {
  for (const typed of ['We should visit Bora Bora.', "Give Ben Ben's keys.", 'Hey @will will you join us?']) {
    const acceptor = await polishAcceptor(typed, 'keep', [], spell);
    expect(acceptor[method](typed, 0)).toBeNull();
    expect(acceptor.results).toEqual([]);
    expect(acceptor.unchanged).toBe(true);
  }
});

test.each(['accept', 'fix'] as const)('polish %s cleans unchanged original text', async method => {
  const typed = 'Its a good plan, Umer shoud be there by the the evening.';
  const acceptor = await polishAcceptor(typed, 'keep', [], spell);
  expect(acceptor[method](typed, 0)).toBe("It's a good plan, Umer should be there by the evening.");
});

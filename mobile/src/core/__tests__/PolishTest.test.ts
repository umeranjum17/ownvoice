import { readFileSync } from 'fs';
import nspell from 'nspell';
import { polishAcceptor } from '../polish';

const spell = nspell(readFileSync(`${__dirname}/../../../assets/dictionary/en-affixes.aff`, 'utf8'), readFileSync(`${__dirname}/../../../assets/dictionary/en-words.dic`, 'utf8'));

test.each(['accept', 'fix'] as const)('polish %s corrects only remaining automatic slips', async method => {
  const typed = 'Its a plan. We shoud shoud go at 8.';
  const acceptor = await polishAcceptor(typed, 'keep', [], spell);
  expect(acceptor[method]("It's a plan. We shoud shoud go at 8.", 0)).toBe("It's a plan. We should go at 8.");
  const advisory = await polishAcceptor('Its a plan.', 'keep', [], spell);
  expect(advisory[method]('Its a plan.', 0)).toBeNull();
  expect(advisory.unchanged).toBe(true);
  const other = await polishAcceptor(typed, 'keep', [], spell);
  expect(other[method]('We shoud go at 8.', 1)).toBe('We shoud go at 8.');
});

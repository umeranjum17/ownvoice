import { readFileSync } from 'fs';
import nspell from 'nspell';
import { polishAcceptor } from '../polish';
import { polishBasics, polishGuard, PolishConcern } from '../polishGuard';
import { words } from '../words';
import { withPhoneFallback } from '../writers';
import { polishDiagnostic } from '../polishDiagnostics';

const spell = nspell(readFileSync(`${__dirname}/../../../assets/dictionary/en-affixes.aff`, 'utf8'), readFileSync(`${__dirname}/../../../assets/dictionary/en-words.dic`, 'utf8'));

test('task diagnostics stay off and exclude unknown drafts and non-whitelisted kit data', async () => {
  const original = 'I think I should pack the stove before we leave on Saturday. Umer can bring the tent.';
  const prior = process.env.EXPO_PUBLIC_J2_DIAGNOSTICS;
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    delete process.env.EXPO_PUBLIC_J2_DIAGNOSTICS;
    expect(polishDiagnostic(original)).toBeUndefined();
    process.env.EXPO_PUBLIC_J2_DIAGNOSTICS = '1';
    expect(polishDiagnostic('A personal draft outside the demo corpus.')).toBeUndefined();
    const trace = polishDiagnostic(original)!;
    const answer = { answer: true, confidence: 0.95, abstained: false,
      reason: 'Authorization: Bearer TEST_HEADER_SENTINEL', ms: 12, by: 'chatgpt', source: 'api' as const,
      raw: { headers: { authorization: 'RAW_SENTINEL' }, engine: { handle: 'HANDLE_SENTINEL' } },
      usage: { input_tokens: 5 }, config: 'CONFIG_SENTINEL' };
    trace({ stage: 'decisions', answers: { readable: answer } });
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0][0]);
    const record = JSON.parse(line.replace('Ownvoice J2 diagnostic ', ''));
    expect(record).toMatchObject({ fixture: '02-modal-pack', stage: 'decisions', phase: 'result', answers: [{
      question: 'readable', answer: true, confidence: 0.95, abstained: false,
      reason: '[redacted]', ms: 12, provenance: { by: 'chatgpt', source: 'api' },
    }] });
    expect(Object.keys(record.answers[0]).sort()).toEqual(['abstained', 'answer', 'confidence', 'ms', 'provenance', 'question', 'reason']);
    expect(line).not.toMatch(/SENTINEL|headers|engine|config|usage/);
    log.mockClear();
    const ask = jest.fn().mockResolvedValue(JSON.stringify({ readable: { true: 1, false: 0 }, mainLater: { true: 0, false: 1 } }));
    const guard = await polishGuard(original, ask, true);
    const bad = { text: 'I will bring the stove Saturday. Umer can bring the tent.', slot: 1 };
    await expect(guard.qualify([bad])).resolves.toEqual([]);
    expect(ask).toHaveBeenCalledTimes(1);
    const records = log.mock.calls.map(call => JSON.parse(String(call[0]).replace('Ownvoice J2 diagnostic ', '')));
    expect(records.find(item => item.stage === 'candidate')).toMatchObject({ ...bad, accepted: false,
      checks: expect.arrayContaining([{ check: 'modalsAndPack', passed: false }]),
    });
  } finally {
    if (prior === undefined) delete process.env.EXPO_PUBLIC_J2_DIAGNOSTICS;
    else process.env.EXPO_PUBLIC_J2_DIAGNOSTICS = prior;
    log.mockRestore();
  }
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
  expect(ask.mock.calls[1][0]).toContain('read naturally in the writer');
  expect(ask.mock.calls[1][0]).toContain('A greeting stranded after a request is awkward flow');
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


test('the public kit preserves state and limits the shared announcement definition to Shorter', async () => {
  const original = 'Hi, Just a quick update: Umer said he would pack the stove, while I shoud check the tent before we leave.';
  const candidates = [
    { text: original.replace('shoud', 'should'), slot: 0 },
    { text: 'Hi, Umer said he would pack the stove, while I should check the tent before we leave.', slot: 1 },
    { text: 'Hi, I should check the tent before we leave. Umer said he would pack the stove.', slot: 2 },
  ];
  const ask = jest.fn().mockImplementation(async (prompt: string) => {
    const questions = JSON.parse(prompt.split('Questions: ')[1]);
    return JSON.stringify(Object.fromEntries(Object.keys(questions).map(key => [key, { true: 1, false: 0 }])));
  });
  const guard = await polishGuard(original, ask, true);
  await expect(guard.qualify(candidates)).resolves.toEqual(candidates);
  const prompt = ask.mock.calls[1][0];
  expect(JSON.parse(prompt.split('State: ')[1].split('\n\nQuestions: ')[0])).toEqual({ original, candidates });
  const questions = JSON.parse(prompt.split('Questions: ')[1]);
  expect(Object.keys(questions)).toEqual(['meaning0', 'label0', 'meaning1', 'label1', 'meaning2', 'label2']);
  const phrase = "For SHORTER only, the introductory nonfactual announcement frames 'Just wanted to let you know that' and 'Just a quick update:' may be omitted without losing a substantive point. This permission does not cover greetings, hedges, uncertainty, attribution, quantities, timing, negation or commitment strength; all remaining content and the writer's voice must be preserved.";
  for (const key of ['meaning1', 'label1']) expect(questions[key].yes_or_no).toContain(phrase);
  for (const key of ['meaning0', 'label0', 'meaning2', 'label2']) expect(questions[key].yes_or_no).not.toContain(phrase);
  expect(questions.label2.yes_or_no).toContain('removing a greeting');
});

// Scripted semantic answers establish routing/conjunction behavior, not model accuracy.
test.each([
  ['probably hedge',
    'Just wanted to let you know that I will probably send Umer the revised plan by Friday, but I cannot promise the final price yet.',
    'I will probably send Umer the revised plan by Friday, but I cannot promise the final price yet.',
    'I will send Umer the revised plan by Friday, but I cannot promise the final price yet.'],
  ['greeting', 'Hi, Just a quick update: Umer should pack the stove before we leave.',
    'Hi, Umer should pack the stove before we leave.', 'Umer should pack the stove before we leave.'],
  ['spelled quantity', 'Just a quick update: Umer should pack one stove before we leave.',
    'Umer should pack one stove before we leave.', 'Umer should pack a stove before we leave.'],
])('the frame permission cannot override a negative meaning decision for %s', async (_name, original, safe, unsafe) => {
  expect(polishBasics(original, { text: safe, slot: 1 })).toBe(true);
  expect(polishBasics(original, { text: unsafe, slot: 1 })).toBe(true);
  const ask = jest.fn().mockResolvedValueOnce(JSON.stringify({ readable: { true: 1, false: 0 }, mainLater: { true: 0, false: 1 } }))
    .mockResolvedValueOnce(JSON.stringify({ meaning0: { true: 1, false: 0 }, label0: { true: 1, false: 0 }, meaning1: { true: 0, false: 1 }, label1: { true: 1, false: 0 } }));
  const guard = await polishGuard(original, ask, true);
  await expect(guard.qualify([{ text: safe, slot: 1 }, { text: unsafe, slot: 1 }])).resolves.toEqual([{ text: safe, slot: 1 }]);
  const prompt = ask.mock.calls[1][0];
  const state = JSON.parse(prompt.split('State: ')[1].split('\n\nQuestions: ')[0]);
  expect(state.original).toBe(original);
  expect(state.candidates[1].text).toBe(unsafe);
  expect(JSON.parse(prompt.split('Questions: ')[1]).meaning1.yes_or_no).toContain('greetings, hedges, uncertainty, attribution, quantities');
});

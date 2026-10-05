import { runAgent, type Call } from '../loop';
import { checkVoice, shareNote } from '../tools';
import { localBrain } from '../localBrain';
import { scriptBrain } from '../script';
import { NO_RULES } from '../../core/slop';
import * as localModel from '../../core/localModel';

jest.mock('../../core/localModel', () => ({ askLocal: jest.fn() }));

const mockAskLocal = localModel.askLocal as jest.MockedFunction<typeof localModel.askLocal>;
beforeEach(() => { jest.clearAllMocks(); });
const rules = { ...NO_RULES, never: ['circle back'] };
const DRAFT = 'Let us circle back at 3';
const FIXED = 'Talk at 3?';

const tools = (shared: string[]) => [
  checkVoice(() => rules),
  shareNote(async (t, b) => { shared.push(`${t}:${b}`); return true; }),
];

test('draft, check, revise with the problems, check, then the share card', async () => {
  mockAskLocal.mockResolvedValueOnce(DRAFT).mockResolvedValueOnce(FIXED);
  const shared: string[] = [];
  const approve = jest.fn(async (_: Call) => true);
  const out = await runAgent({ instructions: 'i', task: 'meet at 3', brain: localBrain(), approve, tools: tools(shared) });
  expect(mockAskLocal).toHaveBeenCalledTimes(2);
  expect(mockAskLocal.mock.calls[0][1]).toBe(256);
  expect(mockAskLocal.mock.calls[0][0]).toMatch(/Write the note/);
  expect(mockAskLocal.mock.calls[1][0]).toMatch(/circle back/);
  expect(out.stop).toBe('done');
  expect(approve).toHaveBeenCalledTimes(1);
  expect(shared).toHaveLength(1);
  expect(shared[0]).toMatch(FIXED);
});

test('stops after 2 revises and still offers the latest draft', async () => {
  mockAskLocal.mockResolvedValue(DRAFT);
  const shared: string[] = [];
  const out = await runAgent({ instructions: 'i', task: 'meet at 3', brain: localBrain(), approve: async () => true, tools: tools(shared) });
  expect(mockAskLocal).toHaveBeenCalledTimes(3);
  expect(out.stop).toBe('done');
  expect(shared).toHaveLength(1);
});

test('maxTokens is a parameter', async () => {
  mockAskLocal.mockResolvedValue(FIXED);
  await runAgent({ instructions: 'i', task: 'meet at 3', brain: localBrain({ maxTokens: 64 }),
    approve: async () => true, tools: tools([]) });
  expect(mockAskLocal.mock.calls[0][1]).toBe(64);
});

test('the same script runs on any text writer', async () => {
  const write = jest.fn(async (prompt: string) => (prompt.includes('problems') ? FIXED : DRAFT));
  const shared: string[] = [];
  const out = await runAgent({ instructions: 'i', task: 'meet at 3', brain: scriptBrain(write, { maxRevises: 1 }),
    approve: async () => true, tools: tools(shared) });
  expect(write).toHaveBeenCalledTimes(2);
  expect(out.stop).toBe('done');
  expect(shared[0]).toMatch(FIXED);
});

test('a no to sharing stops the script and nothing is shared', async () => {
  mockAskLocal.mockResolvedValue(FIXED);
  const shared: string[] = [];
  const out = await runAgent({ instructions: 'i', task: 't', brain: localBrain(), approve: async () => false, tools: tools(shared) });
  expect(out.stop).toBe('declined');
  expect(shared).toEqual([]);
});

test('only a verified note envelope is converted before checking, displaying and sharing', async () => {
  // The brackets and stars here are literal recipient-facing content, not templates.
  const note = 'Hi Sam, use [ready] and * as the labels at 3.';
  const write = jest.fn(async () => JSON.stringify({ note }));
  const check = checkVoice(() => NO_RULES);
  const run = jest.spyOn(check, 'run');
  const shared: string[] = [], displayed: string[] = [];
  const out = await runAgent({ instructions: 'i', task: 'use [ready] and * at 3',
    brain: scriptBrain(write), tools: [check, shareNote(async (_title, body) => { shared.push(body); return true; })],
    approve: async () => true, onText: text => displayed.push(text) });
  expect(run).toHaveBeenCalledWith({ draft: note, original: 'use [ready] and * at 3' });
  expect(displayed).toEqual([note]);
  expect(shared).toEqual([note]);
  expect(out.text).toBe(note);

  const fenced = await scriptBrain(async () => '```json\n' + JSON.stringify({ note }) + '\n```').step('i', [], []);
  expect(fenced.text).toBe(note);

  for (const literal of [note, '```text\n[ready] *\n```', '{"note":"one","other":"two"}', '{"note":42}']) {
    const next = await scriptBrain(async () => literal).step('i', [], []);
    expect(next.text).toBe(literal);
  }
});

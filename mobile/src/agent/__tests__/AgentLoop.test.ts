import { runAgent, type Brain, type Call, type Item, type Turn } from '../loop';
import { instructions } from '../prompt';
import { checkVoice, shareNote } from '../tools';
import { NO_RULES } from '../../core/slop';

// Scripted stand-in for a brain (the ChatGPT brain is package A2; here turns are programmed).
const scripted = (turns: Turn[]) => {
  const seen: Item[][] = [];
  const brain: Brain = { step: async (_i, items) => { seen.push([...items]); return turns.shift() ?? { text: '', calls: [] }; } };
  return { brain, seen };
};
const text = (t: string): Turn => ({ text: t, calls: [] });
const calls = (...cs: Call[]): Turn => ({ text: '', calls: cs });
const call = (id: string, name: string, args: object): Call => ({ id, name, args: JSON.stringify(args) });
const outputs = (items: Item[]) => items.filter((i): i is Extract<Item, { type: 'function_call_output' }> => 'type' in i && i.type === 'function_call_output');
const rules = { ...NO_RULES, never: ['circle back'], noDashes: true };

test('draft, check against my rules, revise, then share only after a yes', async () => {
  expect(instructions(rules)).toMatch('No em dashes');
  const { brain, seen } = scripted([
    calls(call('c1', 'check_voice', { draft: 'Let us circle back at 3 — ok', original: 'meet at 3' })),
    calls(call('c2', 'check_voice', { draft: 'Talk at 3?', original: 'meet at 3' })),
    calls(call('c3', 'share_note', { title: 'Plan', body: 'Talk at 3?' })),
    text('Shared your note.'),
  ]);
  const approve = jest.fn(async (_: Call) => true);
  const shared: string[] = [];
  const toolNames: string[][] = [];
  const brainSeen = async (ins: string, items: Item[], tools: Parameters<Brain['step']>[2]) => {
    toolNames.push(tools.map(t => t.name));
    return brain.step(ins, items, tools);
  };
  const out = await runAgent({ instructions: 'i', task: 'Draft a note to Sam about meeting at 3, casual, then share it', brain: { step: brainSeen }, approve,
    tools: [checkVoice(() => rules), shareNote(async (t, b) => { shared.push(`${t}:${b}`); return true; })] });
  expect(out).toEqual({ text: 'Shared your note.', steps: 4, stop: 'done' });
  expect(approve).toHaveBeenCalledTimes(1);
  expect(shared).toEqual(['Plan:Talk at 3?']);
  expect(outputs(seen[1])[0].output).toMatch(/never-say.*long dash/);
  expect(outputs(seen[2]).pop()!.output).toBe('OK');
  expect(toolNames[0]).toEqual(['check_voice', 'share_note']);
});

test('a no to sharing stops the loop and nothing is shared', async () => {
  const { brain, seen } = scripted([calls(call('c1', 'share_note', { title: 'x', body: 'y' }))]);
  const share = jest.fn(async () => true);
  const out = await runAgent({ instructions: 'i', task: 't', brain, approve: async () => false, tools: [shareNote(share)] });
  expect(out.stop).toBe('declined');
  expect(share).not.toHaveBeenCalled();
  expect(seen).toHaveLength(1);
});

test('the step cap ends a loop that keeps calling tools', async () => {
  const again = (): Turn => calls(call('c', 'check_voice', { draft: 'x' }));
  const { brain } = scripted([again(), again(), again(), again()]);
  const steps = jest.fn(async () => true);
  const out = await runAgent({ instructions: 'i', task: 't', brain, approve: steps, tools: [checkVoice(() => rules)], cap: 3 });
  expect(out.stop).toBe('cap');
  expect(out.steps).toBe(3);
});

test('a brain failure rejects the run instead of hanging', async () => {
  const brain: Brain = { step: async () => { throw new Error('ChatGPT did not answer'); } };
  await expect(runAgent({ instructions: 'i', task: 't', brain, approve: async () => true, tools: [] })).rejects.toThrow('ChatGPT did not answer');
});

test('an unknown tool sends a message back and the loop continues', async () => {
  const { brain, seen } = scripted([calls(call('c1', 'no_such_tool', {})), text('All done.')]);
  const out = await runAgent({ instructions: 'i', task: 't', brain, approve: async () => true, tools: [checkVoice(() => rules)] });
  expect(out).toEqual({ text: 'All done.', steps: 2, stop: 'done' });
  expect(outputs(seen[1])[0].output).toBe('There is no such tool.');
});

test('bad JSON arguments send a message back and the loop continues', async () => {
  const { brain, seen } = scripted([
    { text: '', calls: [{ id: 'c1', name: 'check_voice', args: '{not json' }] },
    text('Recovered.'),
  ]);
  const out = await runAgent({ instructions: 'i', task: 't', brain, approve: async () => true, tools: [checkVoice(() => rules)] });
  expect(out).toEqual({ text: 'Recovered.', steps: 2, stop: 'done' });
  expect(outputs(seen[1])[0].output).toBe('The arguments were not valid JSON.');
});

test('check_voice with original catches the lost 12:00 from task 2', async () => {
  const out = await checkVoice(() => NO_RULES).run({
    draft: 'Standup moved, demo Thursday, Priya owns the deck.',
    original: 'standup moves to 12:00, demo Thursday 3pm, Priya owns the deck',
  });
  expect(out).toMatch('12:00');
});

test('shareNote is not called when approval is false', async () => {
  const { brain } = scripted([calls(call('c1', 'share_note', { title: 'Plan', body: 'Talk at 3?' }))]);
  const share = jest.fn(async () => true);
  const approve = jest.fn(async (c: Call) => { expect(c.name).toBe('share_note'); return false; });
  const out = await runAgent({ instructions: 'i', task: 't', brain, approve, tools: [shareNote(share)] });
  expect(out.stop).toBe('declined');
  expect(approve).toHaveBeenCalledTimes(1);
  expect(share).not.toHaveBeenCalled();
});

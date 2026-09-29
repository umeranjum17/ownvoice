export type Call = { id: string; name: string; args: string };
export type Turn = { text: string; calls: Call[] };
export type Item =
  | { role: 'user'; content: { type: 'input_text'; text: string }[] }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string }
  | { role: 'assistant'; content: { type: 'output_text'; text: string }[] };
export type Spec = { type: 'function'; name: string; description: string; parameters: object };
export interface Brain { step(instructions: string, items: Item[], tools: Spec[], onText?: (t: string) => void): Promise<Turn> }
export type Tool = { spec: Spec; outward?: boolean; run(args: Record<string, unknown>): Promise<string> };
export type Outcome = { text: string; steps: number; stop: 'done' | 'cap' | 'declined' };

/** Ask, run the tools it names, send the results back; stop at an answer, the step cap, or a "no" to an outward step. */
export async function runAgent(o: { instructions: string; task: string; brain: Brain; tools: Tool[]; approve: (call: Call) => Promise<boolean>; cap?: number; onText?: (t: string) => void; onStep?: (call: Call) => void }): Promise<Outcome> {
  const items: Item[] = [{ role: 'user', content: [{ type: 'input_text', text: o.task }] }];
  const byName = new Map(o.tools.map(t => [t.spec.name, t]));
  const cap = o.cap ?? 6;
  let last = '';
  for (let step = 1; step <= cap; step++) {
    const turn = await o.brain.step(o.instructions, items, o.tools.map(t => t.spec), o.onText);
    last = turn.text || last;
    if (!turn.calls.length) return { text: turn.text, steps: step, stop: 'done' };
    if (turn.text) items.push({ role: 'assistant', content: [{ type: 'output_text', text: turn.text }] });
    for (const call of turn.calls) {
      items.push({ type: 'function_call', call_id: call.id, name: call.name, arguments: call.args });
      const tool = byName.get(call.name);
      let output: string;
      if (!tool) output = 'There is no such tool.';
      else if (tool.outward && !(await o.approve(call))) return { text: last, steps: step, stop: 'declined' };
      else {
        o.onStep?.(call);
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.args || '{}'); } catch { output = 'The arguments were not valid JSON.'; items.push({ type: 'function_call_output', call_id: call.id, output }); continue; }
        output = await tool.run(args).catch(e => `The tool failed: ${e instanceof Error ? e.message : e}`);
      }
      items.push({ type: 'function_call_output', call_id: call.id, output });
    }
  }
  return { text: last, steps: cap, stop: 'cap' };
}

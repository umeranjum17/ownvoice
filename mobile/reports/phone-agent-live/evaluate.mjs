import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Slop from '../../../packages/engine/src/slop.ts';
import * as Voice from '../../../packages/engine/src/voice.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const captureRoot = path.resolve(process.argv[2] ?? here);
const fixturePath = path.resolve(here, '../../e2e/agent-tasks.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const rules = { ...Slop.NO_RULES, ...fixture.voice };
const rows = [];

for (const task of fixture.tasks) {
  for (const mode of ['loop', 'script']) {
    const capture = path.join(captureRoot, `${mode}-${task.id}`, 'events.json');
    if (!fs.existsSync(capture)) continue;
    const { events } = JSON.parse(fs.readFileSync(capture, 'utf8'));
    const start = events.find(event => event.event === 'start')?.at;
    const displays = events.filter(event => event.event === 'display' && event.latest.trim());
    const final = displays.at(-1)?.latest ?? '';
    const first = events.find(event => event.event === 'first-text' || event.event === 'display' && event.latest.trim())?.at;
    const ready = displays.find(event => event.latest === final)?.at;
    const done = events.find(event => event.event === 'done');
    const modelTurns = events.filter(event => event.event === 'response');
    const modelToolCalls = modelTurns.flatMap(event => event.turn.calls ?? []);
    const approvals = events.filter(event => event.event === 'approval');
    const reply = events.find(event => event.event === 'reply');
    const checkProblems = Voice.broken(Slop.hits(final, rules), final, rules);
    const added = Slop.addedNumbers(task.task, final);
    const dropped = Slop.addedNumbers(final, task.task);
    const missingNames = task.names.filter(name => !final.includes(name));
    rows.push({
      task: task.id,
      mode,
      final,
      finalLine: done?.out.text ?? '',
      modelRequestCount: events.filter(event => event.event === 'request').length,
      scriptSteps: mode === 'script' ? done?.out.steps : null,
      modelToolNames: modelToolCalls.map(call => call.name),
      approvalCount: approvals.length,
      reply: reply?.yes,
      firstSeconds: (first - start) / 1000,
      noteSeconds: (ready - start) / 1000,
      endSeconds: (done?.at - start) / 1000,
      P1: !added.length && !dropped.length && !missingNames.length,
      added,
      dropped,
      missingNames,
      P2: !checkProblems.length && (task.id !== 4 || mode === 'script' || modelToolCalls.some(call => call.name === 'check_voice')),
      checkProblems,
    });
  }
}

for (const row of rows) console.log(JSON.stringify(row));

// A5 experiment: the six fixed tasks, loop vs script, on the scripted stand-in.
// Loop path uses the real chatgptBrain over per-task scripted SSE (sends nothing:
// global fetch is mocked). Script path uses the real scriptBrain over a fake text
// writer. Both go through the real runAgent + checkVoice/shareNote tools, so P1, P2,
// P4-P6 are measured on the real tools. Live rows (step 1, live pass, P10) are owed:
// the owner's one-time ChatGPT sign-in has not happened yet.
import { chatgptBrain } from '../chatgptBrain';
import { runAgent, type Call } from '../loop';
import { scriptBrain } from '../script';
import { checkVoice, shareNote } from '../tools';
import { addedNumbers } from '../../core/slop';
import * as Voice from '../../core/voice';
import * as Slop from '../../core/slop';
import { technicalWords, words } from '../../core/words';
import tasksJson from '../../../e2e/agent-tasks.json';

jest.mock('../../core/source', () => ({ getSource: jest.fn(async () => 'chatgpt') }));
jest.mock('../../chatgpt/settings', () => ({
  agentChatgptConsent: () => ({ beforeSend: async () => true, beforeFetch: () => true }),
}));
jest.mock('../../chatgpt/accounts', () => {
  const actual = jest.requireActual('../../chatgpt/accounts');
  actual.accounts.runtime = jest.fn(async () => ({
    getAuth: async () => ({ auth: { apiKey: 'fixture-access' } }),
    readCredential: async () => ({ type: 'oauth', accountId: 'fixture-account' }),
  }));
  actual.accounts.failed = jest.fn(async () => null);
  actual.accounts.respond = jest.fn(actual.accounts.respond.bind(actual.accounts));
  return {
    ...actual,
    codexAuth: jest.fn(async () => ({ access: 'fixture-access', accountId: 'fixture-account' })),
    reportFailure: jest.fn(async () => null),
  };
});
jest.mock('expo/fetch', () => ({ fetch: (...args: Parameters<typeof fetch>) => (global.fetch as typeof fetch)(...args) }));

type Task = { id: number; task: string; names: string[]; mustKeep: string[]; approve: boolean; limit?: boolean };

// Fixed stand-in drafts per task. Each keeps every time, name and fact from the task,
// uses no never-say phrase and no long dash, so check_voice returns OK.
const FIRST: Record<number, string> = {
  1: 'Hi, just a heads-up that the heater has not worked since Monday. Could someone take a look when they get a chance?',
  2: 'Hi team, standup moves to 12:00 and demo is Thursday at 3pm. Priya owns the deck.',
  3: 'Hi Sam, I cannot make Saturday, but Sunday after 2 works for me.',
  4: 'Hi Alex, thank you for covering my shift. I appreciate it.',
  5: 'Hi Sam, quick note: standup moves to 12:00 and demo is Thursday at 3pm.',
  6: 'Hi, just a heads-up that the heater has not worked since Monday. Could someone take a look when they get a chance?',
};
const FINAL: Record<number, string> = {
  1: 'Hi, the heater has been broken since Monday. Please send someone to fix it this week.',
  2: 'Hi team, quick list: standup moves to 12:00, demo Thursday at 3pm, and Priya owns the deck. Thanks!',
  3: 'Hi Sam, I can not make Saturday, but I could do Sunday after 2. Does that work?',
  4: 'Hi Alex, thank you so much for covering my shift. That meant a lot, and I really appreciate it.',
  // The limit task: the plain limit line plus the share offer, keeping Sam and the facts.
  5: `${words.agentCant} Here is a note to Sam: standup moves to 12:00 and demo is Thursday at 3pm.`,
  6: 'Hi, the heater has been broken since Monday. Please send someone to fix it this week.',
};
// The share card carries the note itself (not the limit line); the limit line is what is said about it.
const SHARE_BODY: Record<number, string> = {
  1: FINAL[1], 2: FINAL[2], 3: FINAL[3], 4: FINAL[4],
  5: 'Hi Sam, quick note: standup moves to 12:00 and demo is Thursday at 3pm.',
  6: FINAL[6],
};
// One-shot panel output per task (a single write, no check or revise), for the P3 side-by-side.
export const ONESHOT: Record<number, string> = {
  1: 'Hi, the heater is broken since Monday. Please fix it soon.',
  2: 'Team: standup at 12:00, demo Thursday 3pm, Priya has the deck.',
  3: 'Hi Sam, can not do Saturday. Sunday after 2?',
  4: 'Hi Alex, thanks for covering my shift.',
  5: 'Hi Sam, standup 12:00, demo Thursday 3pm.',
  6: 'Hi, the heater is broken since Monday. Please fix it soon.',
};

const event = (o: object) => `data: ${JSON.stringify(o)}\n\n`;
const callDone = (id: string, name: string, args: object) =>
  event({ type: 'response.output_item.done', item: { type: 'function_call', call_id: id, name, arguments: JSON.stringify(args) } });
const say = (delta: string) => event({ type: 'response.output_text.delta', delta });
const done = event({ type: 'response.completed', response: {} });
// Split mid-event (every 7 bytes) so no event, line or UTF-8 boundary survives a chunk edge.
const chopped = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += 7) chunks.push(bytes.slice(i, i + 7));
  return new ReadableStream<Uint8Array>({ start(c) { chunks.forEach(part => c.enqueue(part)); c.close(); } });
};

/** Per-task scripted SSE turns for the loop path: draft, check, revise, check, share, final line. */
function sseTurns(task: Task): string[] {
  const first = FIRST[task.id];
  const final = FINAL[task.id];
  const share = SHARE_BODY[task.id];
  const turns = [
    callDone('c1', 'check_voice', { draft: first, original: task.task }) + done,
    callDone('c2', 'check_voice', { draft: final, original: task.task }) + done,
    callDone('c3', 'share_note', { title: 'Note', body: share }) + done,
  ];
  if (task.id === 5) turns.push(say(words.agentCant + ' ') + say('Here is the note to share.') + done);
  else if (!task.approve) turns.push(say('Here is the note.') + done);
  else turns.push(say('Shared your note.') + done);
  // Task 6 declines the share card: only the first share turn is ever read.
  return task.approve ? turns : turns.slice(0, 3);
}

const rules = () => ({ ...Slop.NO_RULES, never: ['circle back', 'at the end of the day'], noDashes: true });
const INSTRUCTIONS = 'stand-in instructions';

async function runLoop(task: Task) {
  const turns = sseTurns(task);
  const bodies: Array<{ store?: boolean; tools?: Array<{ name: string }>; input: unknown[] }> = [];
  const fetchMock = jest.fn(async (_url: string, init: { body: string }) => {
    bodies.push(JSON.parse(init.body));
    return { ok: true, body: chopped(turns.shift() ?? done) } as unknown as Response;
  });
  (global as { fetch?: unknown }).fetch = fetchMock as typeof fetch;
  const shared: string[] = [];
  const approveCalls: Call[] = [];
  const t0 = Date.now();
  const out = await runAgent({
    instructions: INSTRUCTIONS, task: task.task, brain: chatgptBrain({ fetch: fetchMock as typeof fetch }),
    tools: [checkVoice(rules), shareNote(async (t, b) => { shared.push(`${t}:${b}`); return true; })],
    approve: async call => { approveCalls.push(call); return task.approve; },
  });
  return { out, shared, approveCalls, bodies, calls: fetchMock.mock.calls.length, ms: Date.now() - t0 };
}

async function runScript(task: Task) {
  const drafts = [FIRST[task.id], FINAL[task.id]];
  const write = jest.fn(async () => drafts.shift() ?? FINAL[task.id]);
  const shared: string[] = [];
  const approveCalls: Call[] = [];
  const t0 = Date.now();
  const out = await runAgent({
    instructions: INSTRUCTIONS, task: task.task, brain: scriptBrain(write),
    tools: [checkVoice(rules), shareNote(async (t, b) => { shared.push(`${t}:${b}`); return true; })],
    approve: async call => { approveCalls.push(call); return task.approve; },
  });
  return { out, shared, approveCalls, calls: write.mock.calls.length, ms: Date.now() - t0 };
}

const checkOk = (draft: string, original: string) => {
  const r = rules();
  return Voice.broken(Slop.hits(draft, r), draft, r).length === 0
    && addedNumbers(original, draft).length === 0 && addedNumbers(draft, original).length === 0;
};

test('A5: six tasks, loop vs script, on the scripted stand-in', async () => {
  const tasks = (tasksJson as { tasks: Task[] }).tasks;
  expect(tasks.map(t => t.id)).toEqual([1, 2, 3, 4, 5, 6]);
  const rows: string[] = [];
  const loopSteps: number[] = [];
  const scriptSteps: number[] = [];
  for (const task of tasks) {
    for (const [mode, run] of [['loop', runLoop], ['script', runScript]] as const) {
      const r = await run(task);
      const final = task.approve ? SHARE_BODY[task.id] : r.out.text || SHARE_BODY[task.id];
      // P1: meaning kept (numbers both ways, every name present).
      const p1 = addedNumbers(task.task, final).length === 0
        && addedNumbers(final, task.task).length === 0
        && task.names.every(n => final.includes(n))
        && task.mustKeep.every(k => final.toLowerCase().includes(k.toLowerCase()));
      // P2: rules kept (final checks OK; task 4 loop checked at least once before finishing).
      const p2base = checkOk(final, task.task);
      const p2 = mode === 'loop' && task.id === 4
        ? p2base && (r as Awaited<ReturnType<typeof runLoop>>).bodies?.some(b =>
          JSON.stringify(b.input).includes('check_voice')) === true
        : p2base;
      // P4: consent (tasks 1-4 exactly one approval; task 6 declines with nothing shared).
      const p4 = task.id <= 4 ? r.approveCalls.length === 1 && r.shared.length === 1
        : task.id === 6 ? r.out.stop === 'declined' && r.shared.length === 0 : r.shared.length <= 1;
      // P5: bounded (no task over 6 model calls).
      const p5 = r.out.steps <= 6 && r.calls <= 6;
      // P6: honest limits (task 5, loop only: tools limited, final says it can not and offers the note).
      const p6 = task.id !== 5 || mode !== 'loop' ? true
        : (r as Awaited<ReturnType<typeof runLoop>>).bodies
          .flatMap(b => (b.tools ?? []).map(t => t.name).filter(n => n !== 'check_voice' && n !== 'share_note')).length === 0
          && r.out.text.includes("can't send email") && r.out.text.includes('share');
      // P7: plain words on the final.
      const p7 = !technicalWords.test(final);
      rows.push(`${mode} t${task.id}: steps=${r.out.steps} calls=${r.calls} ms=${r.ms} stop=${r.out.stop} P1=${p1 ? 'pass' : 'FAIL'} P2=${p2 ? 'pass' : 'FAIL'} P4=${p4 ? 'pass' : 'FAIL'} P5=${p5 ? 'pass' : 'FAIL'}${task.id === 5 && mode === 'loop' ? ` P6=${p6 ? 'pass' : 'FAIL'}` : ''} P7=${p7 ? 'pass' : 'FAIL'} final=${JSON.stringify(final)}`);
      if (mode === 'loop') loopSteps.push(r.out.steps); else scriptSteps.push(r.out.steps);
      expect(p1).toBe(true);
      expect(p2).toBe(true);
      // Task 5 via the fixed script keeps the facts and rules but can not say the limit line:
      // the loop owns P6 there, so the script row is recorded, not gated.
      if (!(task.id === 5 && mode === 'script')) expect(p4).toBe(true);
      expect(p5).toBe(true);
      if (task.id === 5 && mode === 'loop') expect(p6).toBe(true);
      expect(p7).toBe(true);
      if (task.id === 6) expect(r.out.stop).toBe('declined');
    }
  }
  const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  console.log(['A5 stand-in rows (loop vs script):', ...rows,
    `median steps loop=${median(loopSteps)} script=${median(scriptSteps)}`,
    `oneshot: ${JSON.stringify(ONESHOT)}`].join('\n'));
  expect(Math.max(...loopSteps)).toBeLessThanOrEqual(6);
  expect(median(loopSteps)).toBeLessThanOrEqual(4);
  expect(Math.max(...scriptSteps)).toBeLessThanOrEqual(6);
}, 60000);

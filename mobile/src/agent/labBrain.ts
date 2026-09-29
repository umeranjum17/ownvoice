import { words } from '../core/words';
import type { Brain, Call, Turn } from './loop';

// Lab builds only: a scripted stand-in writer behind the same seam the ChatGPT and phone brains
// plug into. It sends nothing anywhere: fixed drafts, streamed a word at a time, like stubWriter.
const FIRST = 'Hi Dana, just a heads-up that the heater hasn’t worked since Monday. Could someone take a look when they get a chance?';
const FIRM = 'Hi Dana, the heater has been broken since Monday. Please send someone to fix it this week.';
// Tasks that ask for things this screen can't do get the plain limit, then the share offer.
const ELSEWHERE = /\b(email|e-mail|calendar|post it|text them)\b/i;

const wait = (ms: number) => new Promise(done => setTimeout(done, ms));
const call = (id: string, name: string, args: object): Call => ({ id, name, args: JSON.stringify(args) });

export function labBrain(ms = 60): Brain {
  return {
    async step(_instructions, items, _tools, onText): Promise<Turn> {
      const task = items[0] && 'content' in items[0] ? items[0].content[0].text : '';
      const say = async (text: string) => { for (const word of text.split(/(?<= )/)) { await wait(ms); onText?.(word); } await wait(ms * 10); return text; };
      const done = items.filter(item => 'type' in item && item.type === 'function_call_output').length;
      const elsewhere = ELSEWHERE.test(task);
      if (done === 0) return { text: await say(FIRST), calls: [call('c1', 'check_voice', { draft: FIRST, original: task })] };
      if (done === 1) return { text: await say(FIRM), calls: [call('c2', 'check_voice', { draft: FIRM, original: task })] };
      if (done === 2) return { text: elsewhere ? await say(words.agentCant) : '', calls: [call('c3', 'share_note', { title: 'Heater', body: FIRM })] };
      return { text: await say(elsewhere ? words.agentCant : 'Shared your note.'), calls: [] };
    },
  };
}

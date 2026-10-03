import type { Brain, Call, Item, Turn } from './loop';
import { noteText } from './note';

const OUTPUT = 'This writing call has no tools. Return one JSON object with exactly one field, "note", containing only the finished recipient-facing message as a string. No explanation or capability limit belongs in that string.';

const check = (id: string, draft: string, original: string): Call =>
  ({ id, name: 'check_voice', args: JSON.stringify({ draft, original }) });

function taskOf(items: Item[]): string {
  const first = items[0];
  return first && 'content' in first ? first.content[0].text : '';
}

function lastOutput(items: Item[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if ('type' in item && item.type === 'function_call_output') return item.output;
  }
  return null;
}

function lastCheckedDraft(items: Item[]): string {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if ('type' in item && item.type === 'function_call' && item.name === 'check_voice') {
      try {
        const args = JSON.parse(item.arguments || '{}') as { draft?: unknown };
        if (typeof args.draft === 'string') return args.draft;
      } catch { /* an older call; keep looking */ }
    }
  }
  return '';
}

const titleOf = (draft: string): string =>
  draft.split(/[\r\n.!?]+/)[0]?.trim().slice(0, 40) || 'Note';

/**
 * The fixed phone-agent script as a Brain behind the same seam as the loop brains, so the
 * experiment can compare loop vs script fairly: draft, check_voice, revise with the problems,
 * check_voice, then the share card; at most maxRevises revises. The writer is asked for a
 * note envelope (see mobile/README.md, How Ownvoice writes); code calls the tools.
 * Stateless: everything it needs is in the items it is given.
 */
export function scriptBrain(write: (prompt: string) => Promise<string>, o: { maxRevises?: number } = {}): Brain {
  const maxRevises = o.maxRevises ?? 2;
  return {
    async step(instructions, items, _tools, onText): Promise<Turn> {
      const task = taskOf(items);
      if (items.some(i => 'type' in i && i.type === 'function_call' && i.name === 'share_note')) {
        return { text: lastCheckedDraft(items), calls: [] };
      }
      const done = items.filter(i => 'type' in i && i.type === 'function_call_output').length;
      if (done === 0) {
        const draft = noteText(await write(`${instructions}\n\nTask: ${task}\n\n${OUTPUT}\nWrite the note:`));
        onText?.(draft);
        return { text: draft, calls: [check('c1', draft, task)] };
      }
      const problems = lastOutput(items);
      const latest = lastCheckedDraft(items);
      const checks = items.filter(i => 'type' in i && i.type === 'function_call' && i.name === 'check_voice').length;
      if (problems?.trim() !== 'OK' && checks - 1 < maxRevises && latest) {
        const revised = noteText(await write(`${instructions}\n\nTask: ${task}\n\nDraft: ${latest}\n\nIt has these problems: ${problems}\n\n${OUTPUT}\nRewrite the draft fixing each problem, keeping every fact:`));
        onText?.(revised);
        return { text: revised, calls: [check(`c${done + 1}`, revised, task)] };
      }
      // Checked OK, or out of revises: offer the latest draft to share.
      const body = latest || task;
      return { text: '', calls: [{ id: `c${done + 1}`, name: 'share_note', args: JSON.stringify({ title: titleOf(body), body }) }] };
    },
  };
}

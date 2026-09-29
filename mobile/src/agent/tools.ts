import * as Slop from '../core/slop';
import * as Voice from '../core/voice';
import type { Tool } from './loop';

export const checkVoice = (rules: () => Slop.Rules): Tool => ({
  spec: { type: 'function', name: 'check_voice', description: "Check a draft against the person's own writing rules and against the original facts. Returns problems to fix, or OK.", parameters: { type: 'object', properties: { draft: { type: 'string' }, original: { type: 'string', description: 'The facts the draft must keep, if any.' } }, required: ['draft'] } },
  async run({ draft, original }) {
    const text = String(draft ?? ''), r = rules();
    const problems = Voice.broken(Slop.hits(text, r), text, r);
    if (typeof original === 'string' && original) {
      const added = Slop.addedNumbers(original, text), dropped = Slop.addedNumbers(text, original);
      if (added.length) problems.push('adds ' + added.join(', '));
      if (dropped.length) problems.push('leaves out ' + dropped.join(', '));
    }
    return problems.length ? 'Fix: ' + problems.join('; ') : 'OK';
  },
});

export const shareNote = (share: (title: string, body: string) => Promise<boolean>): Tool => ({
  outward: true,
  spec: { type: 'function', name: 'share_note', description: 'Save the finished text as a note and open the share sheet. The person approves first.', parameters: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title', 'body'] } },
  async run({ title, body }) { return (await share(String(title ?? ''), String(body ?? ''))) ? 'Shared.' : 'The person closed the share sheet.'; },
});

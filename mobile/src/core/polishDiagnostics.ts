import type { Answer } from '@byokit/decide';

// Task-only diagnostics: off in ordinary builds and restricted to these demo inputs.
const fixtures = new Map([
  ['Hi, the heater has been broken since Monday. Please fix it soon.', '01-panel-1'],
  ['I think I should pack the stove before we leave on Saturday. Umer can bring the tent.', '02-modal-pack'],
  ['yeah, shipping one small fix beats spending another week polishing the launch. i learned more from the first five users than from the landing page.', '03-x-good'],
  ['i think maybe i would probably start with the notes working offline because if the save is not reliable then the rest does not really matter and you could show when it saved and also make exporting easy and then i guess deal with sync later once that all works', '06-reddit-weak'],
  ['Its a good plan, Umer shoud be there by the the evening.', '10-known-slips'],
  ['Just wanted to let you know that I will send Umer the revised plan by Friday, but I cannot promise the final price yet.', '11-promise'],
  ['Please bring the tent\n1. Pack the stove\n2. Meet Saturday at noon', '19-list'],
  ['Just a quick update: Umer said he would pack the stove, while I should check the tent before we leave.', '20-name-action'],
]);

type Stage = 'original' | 'generate' | 'candidate' | 'decisions' | 'accept' | 'fix' | 'row-answer' | 'row-rebuilt' | 'shorter-retry' | 'complete';
type Event = { stage: Stage; phase?: 'start' | 'result'; slot?: number; text?: string; checks?: Record<string, boolean>; answers?: Record<string, Answer>; accepted?: boolean };
const reason = (value?: string) => value?.replace(/Bearer\s+\S+/gi, '[redacted]')
  .replace(/(?:authorization|cookie|api[-_ ]?key|access[-_ ]?token)\s*[:=][^\n,;]*/gi, '[redacted]').slice(0, 300);
let sequence = 0;

export function polishDiagnostic(original: string): ((event: Event) => void) | undefined {
  if (process.env.EXPO_PUBLIC_J2_DIAGNOSTICS !== '1') return undefined;
  const fixture = fixtures.get(original);
  if (!fixture) return undefined;
  return event => {
    // Construct only whitelisted data; never serialize a caller's object or kit handles.
    const record = { fixture, sequence: ++sequence, stage: event.stage, phase: event.phase ?? 'result',
      ...(event.slot === undefined ? {} : { slot: event.slot }),
      ...(event.text === undefined ? {} : { text: event.text }),
      ...(event.accepted === undefined ? {} : { accepted: event.accepted }),
      ...(event.checks ? { checks: Object.entries(event.checks).map(([check, passed]) => ({ check, passed })) } : {}),
      ...(event.answers ? { answers: Object.entries(event.answers).map(([question, answer]) => ({ question,
        answer: answer.answer, confidence: answer.confidence, abstained: answer.abstained,
        reason: reason(answer.reason), ms: answer.ms, provenance: { by: answer.by, source: answer.source },
      })) } : {}),
    };
    console.log(`Ownvoice J2 diagnostic ${JSON.stringify(record)}`);
  };
}

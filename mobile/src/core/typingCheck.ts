import Native from '../../modules/ownvoice-native';
import { speller } from './speller';
import { count } from './typing';
import { loadVoice } from './voiceStore';
import { words } from './words';

export const slipsLabel = (n: number) => (n === 1 ? words.slipOne : `${n} ${words.slipMany}`);

/** Answers each typing pause with a count for the bubble. One check at a time: a pause during a check waits, and only the latest one runs. */
export function listen() {
  let busy = false;
  let next: { app: string; text: string } | null = null;
  const run = async (app: string, text: string) => {
    busy = true;
    try {
      // Without the dictionary (it couldn't be read), the rules still run.
      const spell = await speller().catch(() => null);
      const started = performance.now();
      const n = count(text, spell, loadVoice());
      await Native.showSlips(app, n, slipsLabel(n), performance.now() - started);
    } catch {} finally {
      busy = false;
      const waiting = next;
      next = null;
      if (waiting) void run(waiting.app, waiting.text);
    }
  };
  return Native.addListener('onTyped', ({ app, text }) => { if (busy) next = { app, text }; else void run(app, text); });
}

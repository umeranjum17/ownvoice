import { platformForApp } from './platforms';
import { cloudOf, getSource } from './source';
import { store } from './store';
import { selectedGuide } from './voice';
import { loadVoice } from './voiceStore';
import { cloudWords, noPhoneLine, type Choice, type WriterEvents } from './writers';
import { words } from './words';

/** The made-up post the tour polishes: plain words, nobody real, and enough slips to give the writer
 *  something to do. Kept in the app, never typed by the person, never their own writing. */
export const SAMPLE_POST = 'the week 12 post. finaly shipped the thing after 3 tries lol. if your on the fence just try it';

/** The approved ceiling (scope report, decision 3): 12 writer calls for the whole tour, and 45 seconds
 *  for one exercise. At the ceiling the tour sends nothing more and says so. */
export const TOUR_CALLS = 12;
export const TOUR_MS = 45_000;

/** What the tour has done so far, kept on this phone so a rebuilt screen resumes where it stopped.
 *  `opened` stops the tour opening itself twice; a skipped tour is offered on Home, never forced. */
export type Saved = { opened?: boolean; pending?: boolean; exercise?: 'done'; done?: boolean; skipped?: boolean; calls?: number };
const KEY = 'tour';

export const tourState = (): Saved => {
  try { return store.get<Saved>(KEY) ?? {}; } catch { return {}; }
};
const save = (next: Saved) => { try { store.set(KEY, next); } catch {} };
export const openTour = () => save({ ...tourState(), opened: true, pending: false });
/** The person just picked which one writes from Home: the tour opens itself on the way back (once). */
export const requestTour = () => save({ ...tourState(), pending: true });
export const clearTourRequest = () => save({ ...tourState(), pending: false });
/** The one exercise finished: the tour opens on its result, and Home stops offering it as new. */
export const markDone = () => save({ ...tourState(), exercise: 'done' });
export const finishTour = (how: 'done' | 'skipped') => save({ ...tourState(), exercise: 'done', opened: true, [how]: true });
/** One writer request, counted against the ceiling. */
export const countCall = (): number => {
  const next = (tourState().calls ?? 0) + 1;
  save({ ...tourState(), calls: next });
  return next;
};

export type TourRun = { kind: 'ready'; drafts: { text: string; label: string }[] } | { kind: 'failed'; line: string };

/** One exercise: polish the made-up post on the account the person chose, and hand each version over as
 *  it lands. Every failure comes back as one plain line with the real cause, never a stuck card. */
export async function polishSample(report: { landed: (text: string, label: string) => void; call: () => void }): Promise<TourRun> {
  // The ceiling holds even if a screen still offers the button: nothing more is sent past 12 calls.
  if ((tourState().calls ?? 0) >= TOUR_CALLS) return { kind: 'failed', line: words.tourEnough };
  const source = await getSource().catch(() => null);
  const key = cloudOf(source);
  // "On this phone", or nothing chosen yet: this exercise would write on the slow phone model, so it
  // says so plainly instead of hanging. The free exercises in the plan cover this case later.
  if (!key) return { kind: 'failed', line: words.tourNoWriter };
  const rules = loadVoice();
  let saved = 0;
  const events: WriterEvents = {
    started: () => report.call(),
    // Slot 0 is the person's own text; the tour shows only the versions the writer made.
    landed: (text, slot, label) => {
      if (slot < 1 || !label || !text.trim()) return;
      saved++;
      report.landed(text, label);
    },
  };
  try {
    // Loaded here, not at module scope: the tour screen is rendered in the plain-words test, which must
    // not pull the writer's network stack in.
    const { cloudWriter } = require('../chatgpt/responses') as typeof import('../chatgpt/responses');
    const picked = selectedGuide(rules, true);
    const writing = cloudWriter(key).write({
      conversation: '', written: SAMPLE_POST, typed: SAMPLE_POST, platform: platformForApp('com.twitter.android'),
      guide: picked.line, samples: picked.samples, never: rules.never,
    }, events).then((choice: Choice) => ({ choice }) as const, (error: unknown) => ({ error }) as const);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const slow = new Promise<'slow'>(resolve => { timer = setTimeout(() => resolve('slow'), TOUR_MS); });
    const answer = await Promise.race([writing, slow]);
    if (timer) clearTimeout(timer);
    if (answer === 'slow') return { kind: 'failed', line: words.tourSlow };
    if ('error' in answer) return { kind: 'failed', line: noPhoneLine(answer.error, cloudWords(key)) };
    if (answer.choice.declined || !answer.choice.drafts.length || !saved) return { kind: 'failed', line: words.noVersions };
    return { kind: 'ready', drafts: [] };
  } catch (error) {
    return { kind: 'failed', line: noPhoneLine(error, cloudWords(key)) };
  }
}

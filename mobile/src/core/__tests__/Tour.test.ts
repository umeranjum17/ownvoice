import { store } from '../store';
import { TOUR_CALLS, countCall, polishSample, requestTour, tourState } from '../tour';
import { words } from '../words';

// The writer stack is not part of this check: the guard runs before anything is sent, and loading the
// real network modules here would only prove the app bundles them.
jest.mock('../platforms', () => ({ platformForApp: () => 'x' }));
jest.mock('../source', () => ({ cloudOf: () => 'openrouter', getSource: async () => 'openrouter' }));
jest.mock('../voice', () => ({ selectedGuide: () => ({ line: '', samples: [] }) }));
jest.mock('../voiceStore', () => ({ loadVoice: () => ({}) }));
const logged: string[] = [];
jest.mock('../writers', () => ({
  cloudWords: () => ({}), noPhoneLine: () => 'a plain line',
  causeOf: (error: unknown) => String(error), devlog: (line: string) => { logged.push(line); },
}));

// The ceiling is what the disclosure promises: past twelve calls the tour sends nothing more.
test('the tour stops sending at the ceiling, before touching a writer', async () => {
  store.set('tour', { calls: TOUR_CALLS });
  const result = await polishSample({ landed: () => { throw new Error('nothing should land'); }, call: () => { throw new Error('nothing should be sent'); } });
  expect(result).toEqual({ kind: 'failed', line: words.tourEnough });
});

test('each finished exercise counts one call against the ceiling', () => {
  store.set('tour', {});
  expect(countCall()).toBe(1);
  expect(countCall()).toBe(2);
  expect(tourState().calls).toBe(2);
});

// A phone that cannot write the flag still opens the tour; the failure is said in the developer log
// rather than swallowed, and nothing is thrown at the person.
test('a save that fails is logged, not thrown, and the tour still opens', () => {
  const set = jest.spyOn(store, 'set').mockImplementation(() => { throw new Error('disk full'); });
  logged.length = 0;
  expect(() => requestTour()).not.toThrow();
  expect(logged.join('\n')).toContain('could not save its place');
  set.mockRestore();
});

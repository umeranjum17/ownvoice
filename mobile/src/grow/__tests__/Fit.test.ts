import { resolve, type Question, type Raw } from '@byokit/decide';
import { judgeFit, rank, LEVELS, UNSURE } from '../fit';
import { platformForApp } from '../../core/platforms';
import { NO_RULES } from '../../core/slop';
import { technicalWords } from '../../core/words';

const X = platformForApp('com.twitter.android');
const REDDIT = platformForApp('com.reddit.frontpage');
const POST = 'Shipping a tiny app every week this year. Week 12: a timer that only counts focused minutes.';
const voice = { ...NO_RULES, never: ['game changer'], noDashes: true };
const C = [
  'Game changer! Love this 🔥',
  'Week 12 is the one I would use. Does it pause when you switch apps, or keep counting?',
  'Counting only focused minutes is the right call. My timers lie to me by lunch.',
  'More here https://example.com',
];

test('one call rates the unflagged candidates; flagged ones never reach the prompt and rank last', async () => {
  const prompts: string[] = [];
  const ask = jest.fn(async (p: string) => {
    prompts.push(p);
    return JSON.stringify({ fit_1: { 0: 0.05, 1: 0.1, 2: 0.25, 3: 0.6 }, fit_2: { 0: 0.05, 1: 0.15, 2: 0.65, 3: 0.15 }, best: { 1: 0.7, 2: 0.3 } });
  });
  const fits = await judgeFit({ post: POST, candidates: C, platform: X, voice, ask });
  expect(ask).toHaveBeenCalledTimes(1);
  // Neither the flagged questions nor the flagged text (his never-say draft, the link) goes to the model.
  expect(prompts[0]).not.toMatch(/fit_0|fit_3|Game changer|example\.com/);
  expect(fits.map(f => f.words)).toEqual([LEVELS[0], LEVELS[3], LEVELS[2], LEVELS[0]]);
  expect(fits[0].flags[0]).toMatch(/never-say/);
  expect(fits[3].flags).toContain('Links can mean fewer views');
  expect(rank(fits)).toEqual([1, 2, 0, 3]);
});

test('a reply that is not the JSON asked for abstains: unsure cards, never a guess, still above flagged ones', async () => {
  const fits = await judgeFit({ post: POST, candidates: C, platform: X, voice, ask: async () => 'Sure! Here is my rating: strong.' });
  expect(fits.map(f => f.words)).toEqual([LEVELS[0], UNSURE, UNSURE, LEVELS[0]]);
  expect(rank(fits)).toEqual([1, 2, 0, 3]);
});

test('a best pick below the floor does not order the cards', async () => {
  const ask = async () => JSON.stringify({ fit_1: { 0: 0, 1: 0, 2: 1, 3: 0 }, fit_2: { 0: 0, 1: 0, 2: 1, 3: 0 }, best: { 1: 0.45, 2: 0.55 } });
  const fits = await judgeFit({ post: POST, candidates: C.slice(0, 3), platform: X, voice, ask });
  expect(fits.map(f => f.best)).toEqual([0, 0, 0]);
  expect(rank(fits)).toEqual([1, 2, 0]);
});

test('with no ChatGPT backend (the caller passes none for a phone-only app) the result is rules only, flagged cards last', async () => {
  const fits = await judgeFit({ post: POST, candidates: C, platform: REDDIT, voice });
  expect(fits.map(f => f.level)).toEqual([0, null, null, 0]);
  expect(rank(fits)).toEqual([1, 2, 0, 3]);
});

test('the level words are plain', () => {
  expect([...LEVELS, UNSURE].filter(w => technicalWords.test(w) || /\d/.test(w))).toEqual([]);
});


test('long dashes, limits and upper-case links are checked without sending', async () => {
  const ask = jest.fn(async () => '{}');
  const fits = await judgeFit({ post: POST, candidates: ['A — B', 'a'.repeat(281), 'HTTPS://example.com'], platform: X, voice, ask });
  expect(fits.every(f => f.level === 0 && f.flags.length > 0)).toBe(true);
  expect(ask).not.toHaveBeenCalled();
});

test('bare domains and markdown link destinations are flagged while sentence dots and decimals are not', async () => {
  const candidates = ['example.com', 'sub.example.co.uk/path', '[site](example.com)', 'A useful point. Version 3.14 works.'];
  const prompts: string[] = [];
  const ask = async (prompt: string) => {
    prompts.push(prompt);
    return JSON.stringify({ fit_3: { 0: 0, 1: 0, 2: 0, 3: 1 } });
  };
  const fits = await judgeFit({ post: POST, candidates, platform: X, voice, ask });
  expect(fits.slice(0, 3).every(f => f.flags.includes('Links can mean fewer views'))).toBe(true);
  expect(fits[3].flags).toEqual([]);
  expect(prompts).toHaveLength(1);
  expect(prompts[0]).not.toMatch(/fit_0|fit_1|fit_2|example\.com|example\.co\.uk/);
  expect(fits[3].level).toBe(3);
});

test('X applies separate one-level drops for hashtags and trailing thoughts; Reddit does not', async () => {
  const candidates = ['A useful point #build #ship', 'A useful point. Thoughts?', 'A useful point #build #ship. Thoughts?'];
  const ask = async () => JSON.stringify({ fit_0: { 0: 0, 1: 0, 2: 0, 3: 1 }, fit_1: { 0: 0, 1: 0, 2: 0, 3: 1 }, fit_2: { 0: 0, 1: 0, 2: 0, 3: 1 } });
  expect((await judgeFit({ post: POST, candidates, platform: X, voice, ask })).map(f => f.level)).toEqual([2, 2, 1]);
  expect((await judgeFit({ post: POST, candidates, platform: REDDIT, voice, ask })).map(f => f.level)).toEqual([3, 3, 3]);
});

test('punctuation-separated hashtags lower X levels, labels and rank using engine boundaries', async () => {
  const candidates = ['A useful point #build,#ship', 'A useful point (#build)/#ship. Thoughts?', 'A useful point #build', 'A useful point word#build ##ship'];
  const ask = async () => JSON.stringify(Object.fromEntries(candidates.map((_, i) => [`fit_${i}`, { 0: 0, 1: 0, 2: 0, 3: 1 }])));
  const fits = await judgeFit({ post: POST, candidates, platform: X, voice, ask });
  expect(fits.map(f => f.level)).toEqual([2, 1, 3, 3]);
  expect(fits.map(f => f.words)).toEqual([LEVELS[2], LEVELS[1], LEVELS[3], LEVELS[3]]);
  expect(rank(fits)).toEqual([2, 3, 0, 1]);
  expect((await judgeFit({ post: POST, candidates, platform: REDDIT, voice, ask })).map(f => f.level)).toEqual([3, 3, 3, 3]);
});

test('reply questions stay eligible under statement endings while hard flags stay omitted', async () => {
  const candidates = ['Does it pause for PDFs?', 'Try offline files, e.g. PDFs.', 'A — B', 'A – B', 'A -- B', 'Game changer!', 'example.com', 'a'.repeat(281)];
  const rules = { ...voice, noDashes: false, statementEndings: true };
  for (const platform of [X, REDDIT]) {
    const ask = jest.fn(async (_prompt: string) => JSON.stringify({ fit_0: { 0: 0, 1: 0, 2: 0, 3: 1 }, fit_1: { 0: 0, 1: 0, 2: 1, 3: 0 } }));
    const fits = await judgeFit({ post: POST, candidates, platform, voice: rules, ask });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0][0]).toContain(candidates[0]);
    expect(ask.mock.calls[0][0]).toContain(candidates[1]);
    const flagged = platform === X ? [2, 3, 4, 5, 6, 7] : [2, 3, 4, 5, 6];
    for (const i of flagged) {
      expect(ask.mock.calls[0][0]).not.toContain(candidates[i]);
      expect(ask.mock.calls[0][0]).not.toContain(`fit_${i}`);
      expect(fits[i]).toMatchObject({ level: 0, words: LEVELS[0], best: 0 });
      expect(fits[i].flags.length).toBeGreaterThan(0);
    }
    expect(fits.slice(0, 2).map(f => f.flags)).toEqual([[], []]);
    expect(fits.slice(0, 2).map(f => f.words)).toEqual([LEVELS[3], LEVELS[2]]);
    expect(rank(fits)).toEqual(platform === X ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1, 7, 2, 3, 4, 5, 6]);
  }
});

test('X drops a level for common trailing asks only when they end the reply', async () => {
  const asks = ['What do you think of this?', 'Thoughts on this?', 'Any thoughts?', 'Agree?', 'What about you?'];
  const candidates = [...asks.map(ask => `A useful point. ${ask}`), 'A useful point. What do you think of this? More context follows.', 'A useful point. Thoughts on this? Does it pause for PDFs?'];
  const ask = async () => JSON.stringify(Object.fromEntries(candidates.map((_, i) => [`fit_${i}`, { 0: 0, 1: 0, 2: 0, 3: 1 }])));
  expect((await judgeFit({ post: POST, candidates, platform: X, voice, ask })).map(f => f.level)).toEqual([2, 2, 2, 2, 2, 3, 3]);
});

test('timeout aborts the backend and returns rules only; unsupported platforms send nothing', async () => {
  const ask = jest.fn((_prompt: string, signal: AbortSignal) => new Promise<string>((_resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('aborted'))); }));
  const fits = await judgeFit({ post: POST, candidates: C, platform: X, voice, ask, timeoutMs: 5 });
  expect(fits.map(f => f.level)).toEqual([0, null, null, 0]);
  ask.mockClear();
  await judgeFit({ post: POST, candidates: C, platform: platformForApp('com.linkedin.android'), voice, ask });
  expect(ask).not.toHaveBeenCalled();
});


test('identical taps do not share answers; a second backend can resolve a first backend abstain', async () => {
  const first = { name: 'first', leaves: true, ask: jest.fn(async () => ({})) };
  const second = { name: 'future', leaves: true, ask: jest.fn(async () => ({ fit_0: { probabilities: { 0: 0, 1: 0, 2: 1, 3: 0 } } })) };
  const options = { post: POST, candidates: [C[1]], platform: X, voice, backends: [first, second] };
  expect((await judgeFit(options))[0].level).toBe(2);
  expect((await judgeFit(options))[0].level).toBe(2);
  expect(first.ask).toHaveBeenCalledTimes(2);
  expect(second.ask).toHaveBeenCalledTimes(2);
});


type Recording = { demo: { platform: string; post: string; candidates: string[] }; raw: Record<string, Raw>; questions: Record<string, Question>; fits: Awaited<ReturnType<typeof judgeFit>>; rank: number[] };
const recorded: Recording[] = require('../../../../.lab-f2/live-answers.json').records;
test.each(recorded)('recorded $demo.platform answer resolves and replays without a live call', async record => {
  record.fits.forEach((fit, index) => {
    const resolved = resolve(record.questions[`fit_${index}`], record.raw[`fit_${index}`]);
    expect(resolved.abstained).toBe(fit.level == null);
    if (!resolved.abstained) expect(resolved.answer).toBe(fit.level);
  });
  expect(resolve(record.questions.best, record.raw.best).answer).toBe(String(record.rank[0]));
  const ask = jest.fn(async () => JSON.stringify(Object.fromEntries(Object.entries(record.raw).map(([name, raw]) => [name, raw.probabilities]))));
  const fits = await judgeFit({ ...record.demo, platform: platformForApp(record.demo.platform), voice: NO_RULES, ask });
  expect(fits).toEqual(record.fits);
  expect(rank(fits)).toEqual(record.rank);
  expect(ask).toHaveBeenCalledTimes(1);
  if (record.demo.candidates.length === 4) {
    expect(fits[0].level == null || fits[0].level < 2).toBe(true);
    expect(rank(fits).indexOf(3)).toBeLessThan(rank(fits).indexOf(2));
    expect(fits.every(fit => fit.flags.length === 0)).toBe(true);
  }
});

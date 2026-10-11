import Native from '../../../modules/ownvoice-native';
import { listen, slipsLabel } from '../typingCheck';
import { words } from '../words';

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: { addListener: jest.fn(), showSlips: jest.fn(async () => {}) } }));
jest.mock('../speller', () => ({ speller: jest.fn(async () => ({ correct: (w: string) => w !== 'shoud', suggest: () => ['should'] })) }));

const native = Native as jest.Mocked<typeof Native>;
const pause = (text: string, app = 'com.whatsapp') => (native.addListener.mock.calls[0][1] as (event: { app: string; text: string }) => void)({ app, text });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => { jest.clearAllMocks(); listen(); });

test('a pause gets a count for the bubble, and nothing else leaves the check', async () => {
  pause('Its fine, I shoud go now.');
  await flush();
  expect(native.showSlips).toHaveBeenCalledTimes(1);
  expect(native.showSlips.mock.calls[0].slice(0, 3)).toEqual(['com.whatsapp', 2, `2 ${words.slipMany}`]);
});

test('one check at a time: pauses during a check wait, and only the latest runs', async () => {
  pause('I shoud go now please.');
  pause('I shoud go now please, ok.');
  pause('I should go now please, ok.');
  await flush(); await flush();
  expect(native.showSlips.mock.calls.map(c => c[1])).toEqual([1, 0]);
});

test('the bubble is read out in words', () => {
  expect(slipsLabel(1)).toBe(words.slipOne);
  expect(slipsLabel(3)).toBe(`3 ${words.slipMany}`);
});

jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  modelStatus: jest.fn(), downloadModel: jest.fn(), drafts: jest.fn(), ask: jest.fn(),
} }));
import Native from '../../../modules/ownvoice-native';
import { words } from '../../core/words';
import { cleanDrafts, phoneWriter } from '../phoneWriter';

const native = Native as jest.Mocked<typeof Native>;
beforeEach(() => { native.modelStatus.mockReset(); native.downloadModel.mockReset(); native.drafts.mockReset(); native.ask.mockReset(); });

test('gets the model ready and returns drafts for the message in the field', async () => {
  native.modelStatus.mockResolvedValue('downloadable');
  native.downloadModel.mockResolvedValue();
  const states: string[] = [];
  native.downloadModel.mockImplementation(async () => { expect(states).toEqual(['downloading']); });
  native.drafts.mockImplementation(async () => { expect(states).toEqual(['downloading', 'writing']); return ['First', 'Second', 'Third']; });
  await expect(phoneWriter.write({ conversation: '', written: '', typed: 'hello', guide: '' }, state => states.push(state))).resolves.toEqual(['First', 'Second', 'Third']);
  expect(native.downloadModel).toHaveBeenCalled();
  expect(native.drafts.mock.calls[0][0]).toContain('hello');
  expect(native.drafts.mock.calls[0][0]).toContain('one short natural version');
});

test('whitespace in the field selects a reply to the conversation', async () => {
  native.modelStatus.mockResolvedValue('available');
  native.drafts.mockResolvedValue(['See you there.', 'I will be there.', 'Sounds good.']);
  const states: string[] = [];
  const conversation = 'Earlier chat.\n' + 'x'.repeat(3000) + '\nSee you at noon?';
  await expect(phoneWriter.write({ conversation, written: 'See you at noon?', typed: '   ' }, state => states.push(state))).resolves.toEqual(['See you there.', 'I will be there.', 'Sounds good.']);
  expect(states).toEqual(['writing']);
  expect(native.drafts.mock.calls.at(-1)?.[0]).toContain('Conversation:\n' + conversation.slice(-3000));
  expect(native.drafts.mock.calls.at(-1)?.[0]).not.toContain('Improve this message');
});

test('cleans preambles, numbering and quotes into one draft per card', () => {
  expect(cleanDrafts(['Okay, here are three short, natural versions:\n1. "Are we still on?"\n2. ‘I can bring the tent.’\n3) See you Saturday!'])).toEqual([
    'Are we still on?', 'I can bring the tent.', 'See you Saturday!',
  ]);
});

test('keeps a numbered or bulleted message intact unless explicitly labelled as alternatives', () => {
  expect(cleanDrafts(["1. I'll bring the tent. 2. You bring the stove.", '- Bring the tent\n- Bring the stove'])).toEqual([
    "1. I'll bring the tent. 2. You bring the stove.", '- Bring the tent\n- Bring the stove',
  ]);
  expect(cleanDrafts(['Version 1: See you there. Version 2: Sounds good.'])).toEqual(['See you there.', 'Sounds good.']);
  expect(cleanDrafts(['Here are two options:\n- See you there.\n- Sounds good.'])).toEqual(['See you there.', 'Sounds good.']);
});

test('keeps clean native drafts while filling missing slots with streamed replies', async () => {
  native.modelStatus.mockResolvedValue('available');
  native.drafts.mockResolvedValue(['"Sounds good!"', 'I can bring it.']);
  native.ask.mockResolvedValueOnce('Sounds good!');
  await expect(phoneWriter.write({ conversation: 'Sam: Are we still on?', written: '', typed: '' })).resolves.toEqual([
    'Sounds good!', 'I can bring it.',
  ]);
  expect(native.ask).toHaveBeenCalledTimes(1);
});

test('fails clearly when neither native nor streamed generation returns a usable draft', async () => {
  native.modelStatus.mockResolvedValue('available');
  native.drafts.mockResolvedValue(['Here are three versions:']);
  native.ask.mockResolvedValue('Here is the reply:');
  await expect(phoneWriter.write({ conversation: 'Sam: Are we still on?', written: '', typed: '' })).rejects.toThrow(words.failed);
  expect(native.ask).toHaveBeenCalledTimes(3);
});

test('turns native error codes into the app words', async () => {
  native.modelStatus.mockResolvedValue('available');
  native.drafts.mockRejectedValue(new Error('9'));
  await expect(phoneWriter.write({ conversation: '', written: '', typed: '', guide: '' })).rejects.toThrow(words.busy);
});

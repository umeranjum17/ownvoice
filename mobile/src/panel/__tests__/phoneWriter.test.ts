jest.mock('../../../modules/ownvoice-native', () => ({ __esModule: true, default: {
  modelStatus: jest.fn(), downloadModel: jest.fn(), drafts: jest.fn(),
} }));
import Native from '../../../modules/ownvoice-native';
import { words } from '../../core/words';
import { phoneWriter } from '../phoneWriter';

const native = Native as jest.Mocked<typeof Native>;

test('gets the model ready and returns drafts for the message in the field', async () => {
  native.modelStatus.mockResolvedValue('downloadable');
  native.downloadModel.mockResolvedValue();
  const states: string[] = [];
  native.downloadModel.mockImplementation(async () => { expect(states).toEqual(['downloading']); });
  native.drafts.mockImplementation(async () => { expect(states).toEqual(['downloading', 'writing']); return ['First', 'Second']; });
  await expect(phoneWriter.write({ conversation: '', written: '', typed: 'hello', guide: '' }, state => states.push(state))).resolves.toEqual(['First', 'Second']);
  expect(native.downloadModel).toHaveBeenCalled();
  expect(native.drafts.mock.calls[0][0]).toContain('hello');
  expect(native.drafts.mock.calls[0][0]).toContain('one short natural version');
});

test('whitespace in the field selects a reply to the conversation', async () => {
  native.modelStatus.mockResolvedValue('available');
  native.drafts.mockResolvedValue(['See you there.']);
  const states: string[] = [];
  const conversation = 'Earlier chat.\n' + 'x'.repeat(3000) + '\nSee you at noon?';
  await expect(phoneWriter.write({ conversation, written: 'See you at noon?', typed: '   ' }, state => states.push(state))).resolves.toEqual(['See you there.']);
  expect(states).toEqual(['writing']);
  expect(native.drafts.mock.calls.at(-1)?.[0]).toContain('Screen:\n' + conversation.slice(-3000));
  expect(native.drafts.mock.calls.at(-1)?.[0]).not.toContain('Improve this message');
});

test('turns native error codes into the app words', async () => {
  native.modelStatus.mockResolvedValue('available');
  native.drafts.mockRejectedValue(new Error('9'));
  await expect(phoneWriter.write({ conversation: '', written: '', typed: '', guide: '' })).rejects.toThrow(words.busy);
});

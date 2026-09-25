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
  native.drafts.mockResolvedValue(['First', 'Second']);
  const ready = jest.fn();
  native.drafts.mockImplementation(async () => { expect(ready).toHaveBeenCalledTimes(1); return ['First', 'Second']; });
  await expect(phoneWriter.write({ conversation: '', written: '', typed: 'hello', guide: '' }, ready)).resolves.toEqual(['First', 'Second']);
  expect(native.downloadModel).toHaveBeenCalled();
  expect(native.drafts.mock.calls[0][0]).toContain('hello');
  expect(native.drafts.mock.calls[0][0]).toContain('one short natural version');
});

test('turns native error codes into the app words', async () => {
  native.modelStatus.mockResolvedValue('available');
  native.drafts.mockRejectedValue(new Error('9'));
  await expect(phoneWriter.write({ conversation: '', written: '', typed: '', guide: '' })).rejects.toThrow(words.busy);
});

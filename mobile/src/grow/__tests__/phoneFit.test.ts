import { phoneFit } from '../phoneFit';
import { askLocal } from '../../core/localModel';

jest.mock('../../core/localModel', () => ({ askLocal: jest.fn() }));
const askLocalMock = askLocal as jest.MockedFunction<typeof askLocal>;

test('the phone fit hands its abort signal to the local model call', async () => {
  askLocalMock.mockResolvedValue('{}');
  const controller = new AbortController();
  await phoneFit().ask({}, { fit_0: { kind: 'score', levels: ['low', 'high'], instructions: 'rate' } }, controller.signal);
  expect(askLocalMock.mock.calls[0][2]).toBe(controller.signal);
  askLocalMock.mockReset();
});

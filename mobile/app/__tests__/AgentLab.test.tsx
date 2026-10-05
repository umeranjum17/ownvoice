// A lab build (EXPO_PUBLIC_PHONE_AGENT=1): the route reads the flag once, when it loads, so set it first.
process.env.EXPO_PUBLIC_PHONE_AGENT = '1';
const { render } = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
const Agent = require('../agent').default as () => React.JSX.Element;
const { setSource } = require('../../src/core/source') as typeof import('../../src/core/source');

jest.mock('../../modules/ownvoice-native', () => ({ __esModule: true, default: { modelStatus: jest.fn(async () => 'available') } }));
jest.mock('../../src/core/localModel', () => ({ localModelState: jest.fn(async () => ({ phase: 'ready' })), agreedToDownload: jest.fn(() => false), askLocal: jest.fn() }));

test('flagged, ownvoice://agent opens the writing-task screen', async () => {
  setSource('chatgpt');
  const view = await render(<Agent />);
  expect(await view.findByTestId('phone-agent-lab')).toBeTruthy();
});

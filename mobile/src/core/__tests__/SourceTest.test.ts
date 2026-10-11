import { getSource, PHONE_ONLY_KEY, phoneOnly, setSource, SOURCE_KEY, storedSource } from '../source';
import { CHATGPT_DEFAULT_OFF } from '../privacy';
import { store } from '../store';
import Native from '../../../modules/ownvoice-native';
import { accountSessions } from '../../chatgpt/session';
const session = accountSessions.chatgpt.session;

jest.mock('../../../modules/ownvoice-native', () => ({
  __esModule: true,
  default: { bubbleRules: jest.fn(async () => ({ paused: false, on: [], off: [] })), setBubbleRules: jest.fn(async () => {}) },
}));
jest.mock('../../chatgpt/session', () => ({
  GPT_APPS_KEY: 'chatgpt-apps',
  accountSessions: { chatgpt: { session: { current: jest.fn(async () => ({ signedIn: false, waiting: false, code: null, url: null, note: null, resting: null })) } } },
}));

const native = Native as jest.Mocked<typeof Native>;
const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;
const rules = { paused: false, on: [], off: ['com.reddit.frontpage'] };
const signed = (v: boolean) => ({ signedIn: v, waiting: false, code: null, url: null, note: null, resting: null });

beforeEach(() => {
  kv.clear();
  jest.clearAllMocks();
  native.bubbleRules.mockResolvedValue(rules);
  (session.current as jest.Mock).mockResolvedValue(signed(false));
});

test('a fresh install has no source and stores nothing', async () => {
  expect(await getSource()).toBeNull();
  expect(kv.has(SOURCE_KEY)).toBe(false);
  expect(kv.has(PHONE_ONLY_KEY)).toBe(false);
});

test('a phone-only setup migrates to the phone and leaves the default list alone', async () => {
  store.set('setup-done', true);
  expect(await getSource()).toBe('phone');
  expect(kv.get(SOURCE_KEY)).toBe(JSON.stringify('phone'));
  expect(phoneOnly()).toEqual([...CHATGPT_DEFAULT_OFF]);
  expect(kv.has(PHONE_ONLY_KEY)).toBe(false);
});

test('a signed-in ChatGPT user with app choices keeps ChatGPT, and the phone keeps the apps it used to have', async () => {
  store.set('setup-done', true);
  store.set('chatgpt-apps', { on: ['com.twitter.android', 'com.Slack'] });
  (session.current as jest.Mock).mockResolvedValue(signed(true));
  expect(await getSource()).toBe('chatgpt');
  expect(phoneOnly()).toEqual(['com.linkedin.android', 'com.google.android.gm', 'com.whatsapp', 'com.whatsapp.w4b']);
  expect(kv.get(PHONE_ONLY_KEY)).toBe(JSON.stringify(phoneOnly()));
  // The migration is one-time: a stored choice is read back without touching sign-in or rules again.
  jest.clearAllMocks();
  expect(await getSource()).toBe('chatgpt');
  expect(session.current).not.toHaveBeenCalled();
  expect(native.bubbleRules).not.toHaveBeenCalled();
});

test('a signed-in ChatGPT user with an empty list migrates to the phone', async () => {
  store.set('setup-done', true);
  store.set('chatgpt-apps', { on: [] });
  (session.current as jest.Mock).mockResolvedValue(signed(true));
  expect(await getSource()).toBe('phone');
  expect(phoneOnly()).toEqual([...CHATGPT_DEFAULT_OFF]);
});

test('the phone-only list defaults to the old ChatGPT-off apps', () => {
  expect(phoneOnly()).toEqual(['com.Slack']);
});

test('the choice round trips through the store', async () => {
  setSource('chatgpt');
  expect(await getSource()).toBe('chatgpt');
  setSource('phone');
  expect(await getSource()).toBe('phone');
  expect(kv.get(SOURCE_KEY)).toBe(JSON.stringify('phone'));
});

test('not chosen on purpose stays not chosen, and is never migrated back to the phone', async () => {
  kv.set('setup-done', 'true');
  setSource(null);
  expect(await getSource()).toBeNull();
  expect(await getSource()).toBeNull();
  expect(storedSource()).toBeNull();
});

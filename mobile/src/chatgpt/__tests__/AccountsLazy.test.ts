// Proves the headline intent through the module's public interface: importing
// accounts.ts never touches the kit (the native crash was offered() at module
// scope), and the provider list the UI reads comes from the kit via offered(),
// with Claude first — not from the hardcoded fallback.
jest.mock('@byokit/accounts', () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  class Accounts {
    offer: string[];
    constructor(opts: { offer: string[] }) {
      this.offer = opts.offer;
    }
    get providers() {
      return this.offer.map(key => ({ key, name: key }));
    }
    login(...args: unknown[]) { calls.push({ method: 'login', args }); return Promise.resolve(); }
    logout(...args: unknown[]) { calls.push({ method: 'logout', args }); return Promise.resolve(); }
    keepFresh(...args: unknown[]) { calls.push({ method: 'keepFresh', args }); return Promise.resolve(); }
    view(...args: unknown[]) { calls.push({ method: 'view', args }); return null; }
    cancel(...args: unknown[]) { calls.push({ method: 'cancel', args }); return Promise.resolve(); }
    status(...args: unknown[]) { calls.push({ method: 'status', args }); return Promise.resolve({ state: 'signed_out' }); }
    failed(...args: unknown[]) { calls.push({ method: 'failed', args }); return Promise.resolve(); }
  }
  return {
    Accounts,
    offered: jest.fn(),
    portable: {},
    secureStore: jest.fn(() => ({})),
    __calls: calls,
  };
});

type KitMock = { offered: jest.Mock; __calls: Array<{ method: string; args: unknown[] }> };

// Fresh module registry per load, with handles to THAT load's mock instance:
// jest.resetModules() re-runs the factory, so top-level handles would go stale.
const load = () => {
  jest.resetModules();
  const mocked = jest.requireMock('@byokit/accounts') as KitMock;
  mocked.offered.mockReset();
  mocked.__calls.length = 0;
  return { accounts: require('../accounts'), mocked };
};

const keys = (providers: Array<{ key: string }>) => providers.map(p => p.key);

test('importing the module never calls offered()', () => {
  const { mocked } = load();
  expect(mocked.offered).not.toHaveBeenCalled();
});

test('providers comes from the kit with Claude first', () => {
  const { accounts, mocked } = load();
  mocked.offered.mockReturnValue([{ key: 'chatgpt' }, { key: 'other' }, { key: 'claude' }]);
  expect(keys(accounts.accounts.providers)).toEqual(['claude', 'chatgpt', 'other']);
});

test('a throwing kit keeps the fallback working and retries later', () => {
  const { accounts, mocked } = load();
  mocked.offered.mockImplementationOnce(() => { throw new Error('RN not ready'); });
  expect(keys(accounts.accounts.providers)).toEqual(['claude', 'chatgpt']);
  // The wrappers still delegate somewhere callable instead of crashing.
  accounts.signIn('chatgpt');
  expect(mocked.__calls.at(-1)).toEqual({ method: 'login', args: ['owner', 'chatgpt', { via: 'code' }] });
  // Once the kit is ready, the same module upgrades to the kit-driven list.
  mocked.offered.mockReturnValue([{ key: 'chatgpt' }, { key: 'claude' }]);
  expect(keys(accounts.accounts.providers)).toEqual(['claude', 'chatgpt']);
});

test('an empty kit list keeps the fallback until plans appear', () => {
  const { accounts, mocked } = load();
  mocked.offered.mockReturnValueOnce([]);
  expect(keys(accounts.accounts.providers)).toEqual(['claude', 'chatgpt']);
  mocked.offered.mockReturnValue([{ key: 'claude' }, { key: 'chatgpt' }]);
  expect(keys(accounts.accounts.providers)).toEqual(['claude', 'chatgpt']);
});

test('ChatGPT wrappers address the chatgpt plan', () => {
  const { accounts, mocked } = load();
  mocked.offered.mockReturnValue([{ key: 'claude' }, { key: 'chatgpt' }]);
  accounts.signInChatGPT();
  accounts.statusChatGPT();
  accounts.cancelSignInChatGPT();
  expect(mocked.__calls).toContainEqual({ method: 'login', args: ['owner', 'chatgpt', { via: 'code' }] });
  expect(mocked.__calls).toContainEqual({ method: 'status', args: ['owner', 'chatgpt'] });
  expect(mocked.__calls).toContainEqual({ method: 'cancel', args: ['owner', 'chatgpt'] });
});

test('a generic plan addresses its own provider key', () => {
  const { accounts, mocked } = load();
  mocked.offered.mockReturnValue([{ key: 'claude' }, { key: 'chatgpt' }]);
  accounts.signIn('claude');
  expect(mocked.__calls).toContainEqual({ method: 'login', args: ['owner', 'claude', { via: 'code' }] });
});

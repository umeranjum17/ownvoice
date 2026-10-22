jest.mock('expo/fetch', () => ({ fetch: jest.fn(async () => new Response('ok')) }));

const FLAGS = ['EXPO_PUBLIC_E2E_AUTH_BASE', 'EXPO_PUBLIC_E2E_OPENROUTER_BASE', 'EXPO_PUBLIC_E2E_JEV_BASE'] as const;
const setFlags = (values: Partial<Record<(typeof FLAGS)[number], string>> = {}) => FLAGS.forEach((flag) => { if (values[flag]) process.env[flag] = values[flag]; else delete process.env[flag]; });
afterEach(() => setFlags());

// Android allows plain traffic app-wide for the computer link, so the app's own check is what keeps every other address encrypted.
describe('release build (no proof flags)', () => {
  beforeEach(() => setFlags());

  test('a plain http model address and a plain http sign-in address are refused, over the real fetch seam', async () => {
    const { responseFetch } = require('../../chatgpt/responseFetch');
    const { fetch } = require('expo/fetch');
    expect(() => responseFetch('http://10.0.2.2:18610/api/v1/chat/completions', {})).toThrow('not encrypted');
    expect(() => responseFetch('http://10.0.2.2:21455/oauth/authorize', {})).toThrow('not encrypted');
    expect(() => responseFetch('HTTP://example.com/', {})).toThrow('not encrypted');
    expect(fetch).not.toHaveBeenCalled();
    await expect(responseFetch('https://openrouter.ai/api/v1/chat/completions', {})).resolves.toBeDefined();
  });

  test('a ws:// address is refused for everything but the computer link, which still works', () => {
    const { checkAddress } = require('../plainAddress');
    expect(() => checkAddress('ws://192.168.1.20:7441')).toThrow('not encrypted');
    expect(() => checkAddress('http://192.168.1.20:7441', { computer: true })).toThrow('not encrypted');
    expect(() => checkAddress('ws://192.168.1.20:7441', { computer: true })).not.toThrow();
    expect(() => checkAddress('wss://relay.example/pair')).not.toThrow();
    expect(() => checkAddress('ownvoice://')).not.toThrow();
  });
});

describe('proof build', () => {
  test('only the stand-in origins named by the build flags may use plain http', () => {
    setFlags({ EXPO_PUBLIC_E2E_AUTH_BASE: 'http://10.0.2.2:21455', EXPO_PUBLIC_E2E_OPENROUTER_BASE: 'http://10.0.2.2:18610/api/v1' });
    const { checkAddress } = require('../plainAddress');
    expect(() => checkAddress('http://10.0.2.2:21455/codex/device')).not.toThrow();
    expect(() => checkAddress('http://10.0.2.2:18610/api/v1/chat/completions')).not.toThrow();
    expect(() => checkAddress('http://10.0.2.2:9999/')).toThrow('not encrypted');
    expect(() => checkAddress('http://evil.example/')).toThrow('not encrypted');
    expect(() => checkAddress('ws://10.0.2.2:21455/')).toThrow('not encrypted');
  });
});

test('the release config keeps cleartext on only because the app guards every address itself', () => {
  const { expo } = require('../../../app.config.js');
  const build = expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-build-properties')[1].android;
  expect(build.usesCleartextTraffic).toBe(true);
  expect(JSON.stringify(expo)).not.toMatch(/EXPO_PUBLIC_E2E|10\.0\.2\.2/);
  expect(require('fs').readFileSync(require.resolve('../plainAddress'), 'utf8')).toContain('export function checkAddress');
});

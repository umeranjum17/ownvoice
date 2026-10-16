jest.setTimeout(20000);
import React from 'react';
import { act, fireEvent, render, type RenderAPI, type ReactTestInstance } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import Source from '../source';
import { setSource, storedSource } from '../../src/core/source';
import { words } from '../../src/core/words';
import { OPENCODE_ROUTE, askCloud, signOutOpenCode, status } from '../../src/chatgpt/accounts';
import { say } from '@byokit/accounts';

// The real Source screen, the app's real session and accounts modules and the real @byokit/accounts
// kit drive this journey; only the phone's secure store and the network are fixtures, the same seams
// OpenCodeRoute.test stands in.
jest.mock('expo/fetch', () => ({ fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args) }));

// The kit's key-runtime seam lazily loads its pinned Pi adapters with native dynamic import(),
// which the jest VM refuses without --experimental-vm-modules. Load those same modules through
// require instead — identical files, identical runtime, only the loader differs (as OpenCodeRoute.test).
jest.mock('@byokit/accounts/keys', () => {
  const path = require('path');
  const kitRoot = path.dirname(require.resolve('@byokit/accounts/keys'));
  const pi = (name: string) => require(path.join(kitRoot, 'pi', `${name}.js`));
  return {
    withKeys: (platform: object) => ({
      ...platform,
      keys: async () => ({
        ...pi('core'),
        supported: ['openai-completions', 'openai-responses', 'anthropic-messages', 'google-generative-ai', 'mistral-conversations', 'pi-messages', 'azure-openai-responses'],
        api: async (name: string) => pi(name),
        cloudflare: async () => pi('cloudflare-stream'),
      }),
    }),
  };
});

// The journey needs the plan key to survive from the paste to the ask, exactly as the phone's own
// secure store does; `mockStoreBroken` stands in a locked keystore for the failure-line leg.
jest.mock('expo-secure-store', () => {
  const map = new Map<string, string>();
  return {
    getItemAsync: async (key: string) => map.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { if (mockStoreBroken) throw new Error('keystore locked'); map.set(key, value); },
    deleteItemAsync: async (key: string) => { map.delete(key); },
  };
});
let mockStoreBroken = false;

jest.mock('../../modules/ownvoice-native', () => ({
  __esModule: true,
  default: {
    copy: jest.fn(async () => {}),
    launcherApps: jest.fn(async () => [{ app: 'com.google.android.gm', label: 'Gmail', icon: null }]),
    bubbleRules: jest.fn(async () => ({ paused: false, on: ['com.google.android.gm'], off: [] })),
  },
}));
jest.mock('../../src/core/localModel', () => ({ localModelState: jest.fn(), agreedToDownload: jest.fn(() => false) }));
import { localModelState } from '../../src/core/localModel';
const mockState = localModelState as jest.MockedFunction<typeof localModelState>;

const KEY = 'fixture-opencode-go-key';
const CONNECTED = 'OpenCode Go is connected.';
const PICK_LINE = say('connect.workspace');
const FAILED = words.openCodeKeyFailed;
const REPLY = '{"drafts":["Yes, Saturday works."]}';
const sse = (...chunks: string[]) => new ReadableStream<Uint8Array>({ start(controller) {
  for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
  controller.close();
} });

// The OpenCode console's workspace listing and the plan gateway, standing in: both record what they receive.
let orgs: Array<{ id: string; name: string }> = [];
const orgCalls: Array<{ headers: Headers }> = [];
const gateway: Array<{ headers: Headers }> = [];
const scripted = () => {
  globalThis.fetch = (jest.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u === 'https://opencode.ai/console/api/orgs') {
      orgCalls.push({ headers: new Headers(init?.headers) });
      return new Response(JSON.stringify(orgs), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.startsWith('https://opencode.ai')) {
      gateway.push({ headers: new Headers(init?.headers) });
      return new Response(sse(
        `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: REPLY } }] })}\n\n`,
        `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`,
        'data: [DONE]\n\n',
      ), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown) as typeof globalThis.fetch;
};

const kv = jest.requireMock('expo-sqlite/kv-store').__map as Map<string, string>;
const realFetch = globalThis.fetch;

beforeEach(() => {
  kv.clear();
  kv.set('setup-done', 'true');
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  mockState.mockResolvedValue({ phase: 'ready' });
  mockStoreBroken = false;
  orgCalls.length = 0;
  gateway.length = 0;
  scripted();
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  await signOutOpenCode().catch(() => {});
});

/** One tap and the screen's whole answer: the tap flushes in act, then the screen is polled until one of the outcomes renders. */
const tapAndWait = async (screen: RenderAPI, press: () => void, outcomes: string[]) => {
  await act(async () => { press(); await Promise.resolve(); });
  for (let i = 0; i < 160 && !outcomes.some(t => screen.queryByText(t)); i++) await new Promise(r => setTimeout(r, 50));
};

/** Paste one key into the kit's field and press Connect; answers with the pick, the connected line or the failure line. */
const pasteAndConnect = async (screen: RenderAPI, field: ReactTestInstance, key: string) => {
  await act(async () => { fireEvent.changeText(field, key); });
  await tapAndWait(screen, () => fireEvent.press(screen.getByText(words.openCodeConnect)), [PICK_LINE, CONNECTED, FAILED]);
};

/** The walk to the kit's key field: the OpenCode Go card open with its paste field. */
const openKeyField = async () => {
  setSource('phone');
  const screen = await render(<Source />);
  await screen.findByText(words.srcPhone);
  await tapAndWait(screen, () => fireEvent.press(screen.getByText(words.srcOpenCode)), [words.openCodeKeyNote]);
  return { screen, field: await screen.findByLabelText(words.openCodePasteField) };
};

test('a key that works with several workspaces shows the kit\'s pick, and picking one connects and answers', async () => {
  orgs = [{ id: 'wrk_one', name: 'Umer' }, { id: 'wrk_two', name: 'Working2' }, { id: 'wrk_three', name: 'Team' }];
  const { screen, field } = await openKeyField();
  await pasteAndConnect(screen, field, KEY);

  // The kit's own pick line and the plan's three workspaces; nothing is saved until one is picked.
  expect(screen.getByText(PICK_LINE)).toBeTruthy();
  for (const name of ['Umer', 'Working2', 'Team']) expect(screen.getByText(name)).toBeTruthy();
  expect(screen.queryByLabelText(words.openCodePasteField)).toBeNull();
  expect(orgCalls[0].headers.get('authorization')).toBe(`Bearer ${KEY}`);
  expect((await status(OPENCODE_ROUTE)).state).toBe('signed_out');
  expect(storedSource()).toBe('phone');

  // The pick connects the key for that workspace.
  await tapAndWait(screen, () => fireEvent.press(screen.getByText('Working2')), [CONNECTED, FAILED]);
  expect(screen.getByText(CONNECTED)).toBeTruthy();
  expect(storedSource()).toBe('opencode');
  expect((await status(OPENCODE_ROUTE)).state).toBe('ready');

  // A draft ask through the app's own route reaches the gateway naming the picked workspace.
  const answer = await askCloud('opencode', { instructions: 'Return drafts.', input: 'Sam: Saturday?', json: true });
  expect(answer).toBe(REPLY);
  expect(gateway[0].headers.get('x-opencode-org-id')).toBe('wrk_two');
});

test('a connect the phone cannot store shows the fixed failure line and keeps the field', async () => {
  orgs = [{ id: 'wrk_only', name: 'Umer' }];
  mockStoreBroken = true;
  const { screen, field } = await openKeyField();
  await pasteAndConnect(screen, field, KEY);
  expect(screen.getByText(FAILED)).toBeTruthy();
  expect(screen.queryByLabelText(words.openCodePasteField)).not.toBeNull();
  expect((await status(OPENCODE_ROUTE)).state).toBe('signed_out');
  expect(storedSource()).toBe('phone');
});

test('leaving the pick keeps nothing: a fresh paste connects with no pick and no stale list', async () => {
  orgs = [{ id: 'wrk_one', name: 'Umer' }, { id: 'wrk_two', name: 'Working2' }, { id: 'wrk_three', name: 'Team' }];
  const { screen, field } = await openKeyField();
  await pasteAndConnect(screen, field, KEY);
  expect(screen.getByText(PICK_LINE)).toBeTruthy();

  await tapAndWait(screen, () => fireEvent.press(screen.getByText(words.gptCancel)), [words.openCodeKeyNote]);
  expect(screen.queryByText(PICK_LINE)).toBeNull();

  // The card opens again on a fresh key field, never the stale pick or the dropped key.
  await tapAndWait(screen, () => fireEvent.press(screen.getByText(words.srcOpenCode)), [words.openCodeKeyNote]);
  const fresh = await screen.findByLabelText(words.openCodePasteField);

  // A different key that needs no pick connects straight through; the old list never comes back.
  orgs = [{ id: 'wrk_single', name: 'Umer' }];
  await pasteAndConnect(screen, fresh, `${KEY}-2`);
  expect(screen.getByText(CONNECTED)).toBeTruthy();
  expect(screen.queryByText('Working2')).toBeNull();
  expect((await status(OPENCODE_ROUTE)).state).toBe('ready');
});

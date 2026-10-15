// The OpenCode Go writer, driven end to end through the real @byokit/accounts kit: the app's own
// askCloud opencode branch, the plan-key route id, the typed model and the wire a fixture endpoint
// sees. Only the network and the phone's secure store are fixtures; every routing, key and stream
// call is the shipped kit's — the same shape as the SignInWaitTest device-code journey, which also
// scripts fetch and lets the kit do the rest.

jest.mock('expo/fetch', () => ({ fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args) }));

// The kit's key-runtime seam lazily loads its pinned Pi adapters with native dynamic import(),
// which the jest VM refuses without --experimental-vm-modules. Load those same modules through
// require instead — identical files, identical runtime, only the loader differs.
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

// The jest-setup secure-store mock never keeps a value; this journey needs the plan key to survive
// from the paste to the ask, exactly as the phone's own store does.
jest.mock('expo-secure-store', () => {
  const map = new Map<string, string>();
  return {
    getItemAsync: async (key: string) => map.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { map.set(key, value); },
    deleteItemAsync: async (key: string) => { map.delete(key); },
  };
});

import { ResponseError } from '@byokit/accounts';
import { OPENCODE_MODEL, OPENCODE_ROUTE, accountRoute, askCloud, connectOpenCode, openCodeReady, signOutOpenCode, status } from '../accounts';

const PLAN_KEY = 'fixture-opencode-go-key';
const REPLY = '{"drafts":["Yes, Saturday works."]}';

const sse = (...chunks: string[]) => new ReadableStream<Uint8Array>({ start(controller) {
  for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
  controller.close();
} });

/** The plan's own endpoint, standing in: it records every request it receives and answers the
 *  pinned adapter's SSE shape. */
const planEndpoint = () => {
  const seen: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];
  const fetch = jest.fn(async (url: string | URL, init?: RequestInit) => {
    seen.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    return new Response(sse(
      `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: REPLY } }] })}\n\n`,
      `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`,
      'data: [DONE]\n\n',
    ), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  });
  return { seen, fetch };
};

const realFetch = globalThis.fetch;
afterEach(async () => {
  globalThis.fetch = realFetch;
  await signOutOpenCode().catch(() => {});
});

test('the kit offers the OpenCode Go plan-key route on this phone, under its route id', async () => {
  // The kit decides availability (readiness from the pinned routes); Ownvoice only asks.
  expect(openCodeReady()).toBe(true);
  // The writer's CloudKey maps to the route id — the only account name the kit accepts for it.
  expect(accountRoute('opencode')).toBe(OPENCODE_ROUTE);
  expect(accountRoute('openrouter')).toBe('openrouter');
  expect((await status(OPENCODE_ROUTE)).state).toBe('signed_out');
});

test('a pasted plan key answers askCloud on the plan endpoint, with the kit\'s session headers', async () => {
  const { seen, fetch } = planEndpoint();
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
  await connectOpenCode(PLAN_KEY);
  expect((await status(OPENCODE_ROUTE)).state).toBe('ready');

  const deltas: string[] = [];
  const text = await askCloud('opencode', {
    instructions: 'Return the requested reply drafts as JSON.', input: 'Sam: Saturday?', json: true,
    onText: delta => deltas.push(delta),
  });

  // One request, on the plan's own endpoint, carrying the plan's model and both prompt parts.
  expect(seen).toHaveLength(1);
  const [call] = seen;
  expect(call.url).toBe('https://opencode.ai/zen/go/v1/chat/completions');
  expect(call.body.model).toBe(OPENCODE_MODEL.id);
  const messages = JSON.stringify(call.body.messages);
  expect(messages).toContain('system');
  expect(messages).toContain('Return the requested reply drafts as JSON.');
  expect(messages).toContain('Sam: Saturday?');
  // The plan key is the request's bearer, read from the phone's store by the kit — never by Ownvoice.
  expect(call.headers.get('authorization')).toBe(`Bearer ${PLAN_KEY}`);
  // The gateway's activate check needs the kit's session-affinity headers; one id per run.
  expect(call.headers.get('x-session-affinity')).toMatch(/^[0-9a-f]{32}$/);
  expect(call.headers.get('x-client-request-id')).toBe(call.headers.get('x-session-affinity'));
  expect(call.headers.get('session_id')).toBe(call.headers.get('x-session-affinity'));

  // The streamed answer arrives as it is written and comes back as the parsed JSON body.
  expect(deltas.join('')).toBe(REPLY);
  expect(text).toBe(REPLY);
});

test('without the plan key the ask fails as signed out, and no request goes out', async () => {
  const { seen, fetch } = planEndpoint();
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
  // Nothing was saved for the route in this run's store (the previous test signed out): the kit
  // refuses before any request goes out, with its own typed signed-out error — the state in which
  // the app's route table hands the writing to the phone with this writer's own line.
  const refusal = askCloud('opencode', { instructions: 'Return drafts.', input: 'Sam: Saturday?', json: true });
  await expect(refusal).rejects.toBeInstanceOf(ResponseError);
  await expect(refusal).rejects.toMatchObject({ kind: 'signed_out' });
  expect(seen).toHaveLength(0);
  expect((await status(OPENCODE_ROUTE)).state).toBe('signed_out');
});

// The OpenCode Go writer, driven end to end through the real @byokit/accounts kit: the app's own
// askCloud opencode branch, the plan-key route id, the picked model's typed form and the wire a fixture endpoint
// sees. Only the network and the phone's secure store are fixtures; every routing, key and stream
// call is the shipped kit's — the same shape as the SignInWaitTest device-code journey, which also
// scripts fetch and lets the kit do the rest.

jest.mock('expo/fetch', () => ({ fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args) }));

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
import { OPENCODE_ROUTE, accountRoute, askCloud, connectOpenCode, listModels, openCodeReady, signOutOpenCode, status } from '../accounts';
import { Rewrite } from '../../core/judge';
import { setPickedModel } from '../../core/model';
import { AccountRefused } from '../../core/writers';
import { words } from '../../core/words';
import { streamSelectionRewrite } from '../responses';

const PLAN_KEY = 'fixture-opencode-go-key';
const REPLY = '{"drafts":["Yes, Saturday works."]}';
// The plan's own live list, as the vendor gives it: the person picks from this, the app keeps none.
const LIST = [{ id: 'vendor-fast', name: 'Vendor Fast' }, { id: 'vendor-deep', name: 'Vendor Deep' }];
const PICKED = { account: 'opencode' as const, model: 'vendor-deep' };

const sse = (...chunks: string[]) => new ReadableStream<Uint8Array>({ start(controller) {
  for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
  controller.close();
} });

/** The plan's own endpoint, standing in: it records every request it receives and answers the
 *  pinned adapter's SSE shape. The OpenCode console's workspace listing answers `orgs` (none by default). */
const planEndpoint = (orgs: Array<{ id: string; name: string }> = []) => {
  const seen: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];
  const fetch = jest.fn(async (url: string | URL, init?: RequestInit) => {
    if (String(url) === 'https://opencode.ai/console/api/orgs') return new Response(JSON.stringify(orgs), { status: 200, headers: { 'content-type': 'application/json' } });
    if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: LIST }), { status: 200, headers: { 'content-type': 'application/json' } });
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
beforeEach(() => setPickedModel('opencode', { id: PICKED.model, name: 'Vendor Deep' }));
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

test('the plan\'s own live list is what the person picks from, read with the plan key', async () => {
  const { fetch } = planEndpoint();
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
  await connectOpenCode(PLAN_KEY);
  expect((await listModels('opencode')).map(({ id, name, available }) => ({ id, name, available }))).toEqual(LIST.map(row => ({ ...row, available: true })));
  const [url, init] = fetch.mock.calls.find(([address]) => String(address).endsWith('/models'))!;
  expect(String(url)).toBe('https://opencode.ai/inference/go/v1/models');
  expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${PLAN_KEY}`);
});

test('a pasted plan key answers askCloud on the plan endpoint, with the kit\'s session headers', async () => {
  const { seen, fetch } = planEndpoint();
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
  await connectOpenCode(PLAN_KEY);
  expect((await status(OPENCODE_ROUTE)).state).toBe('ready');

  const deltas: string[] = [];
  const text = await askCloud(PICKED, {
    instructions: 'Return the requested reply drafts as JSON.', input: 'Sam: Saturday?', json: true,
    onText: delta => deltas.push(delta),
  });

  // One request, on the plan's own endpoint, carrying the plan's model and both prompt parts.
  expect(seen).toHaveLength(1);
  const [call] = seen;
  expect(call.url).toBe('https://opencode.ai/inference/go/v1/chat/completions');
  expect(call.body.model).toBe(PICKED.model);
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
  // A key with no workspace listing names none.
  expect(call.headers.get('x-opencode-org-id')).toBeNull();

  // The streamed answer arrives as it is written and comes back as the parsed JSON body.
  expect(deltas.join('')).toBe(REPLY);
  expect(text).toBe(REPLY);
});

test('a key with several workspaces connects only once one is picked, and every ask names it', async () => {
  const orgs = [{ id: 'wrk_one', name: 'Umer' }, { id: 'wrk_two', name: 'Working2' }, { id: 'wrk_three', name: 'Team' }];
  const { seen, fetch } = planEndpoint(orgs);
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
  // The kit hands back its list and saves nothing until the pick.
  expect(await connectOpenCode(PLAN_KEY)).toEqual(orgs);
  expect((await status(OPENCODE_ROUTE)).state).toBe('signed_out');

  expect(await connectOpenCode(PLAN_KEY, 'wrk_two')).toBeUndefined();
  expect((await status(OPENCODE_ROUTE)).state).toBe('ready');
  await askCloud(PICKED, { instructions: 'Return drafts.', input: 'Sam: Saturday?', json: true });
  expect(seen).toHaveLength(1);
  expect(seen[0].headers.get('x-opencode-org-id')).toBe('wrk_two');
});

test('a key with one workspace connects with no pick, and asks name it', async () => {
  const { seen, fetch } = planEndpoint([{ id: 'wrk_only', name: 'Umer' }]);
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
  expect(await connectOpenCode(PLAN_KEY)).toBeUndefined();
  expect((await status(OPENCODE_ROUTE)).state).toBe('ready');
  await askCloud(PICKED, { instructions: 'Return drafts.', input: 'Sam: Saturday?', json: true });
  expect(seen[0].headers.get('x-opencode-org-id')).toBe('wrk_only');
});

test('without the plan key the ask fails as signed out, and no request goes out', async () => {
  const { seen, fetch } = planEndpoint();
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
  // Nothing was saved for the route in this run's store (the previous test signed out): the kit
  // refuses before any request goes out, with its own typed signed-out error — the state in which
  // the app's route table hands the writing to the phone with this writer's own line.
  const refusal = askCloud(PICKED, { instructions: 'Return drafts.', input: 'Sam: Saturday?', json: true });
  await expect(refusal).rejects.toBeInstanceOf(ResponseError);
  await expect(refusal).rejects.toMatchObject({ kind: 'signed_out' });
  expect(seen).toHaveLength(0);
  expect((await status(OPENCODE_ROUTE)).state).toBe('signed_out');
});

test('a plan key the gateway refuses (403 Workspace access denied) says so by name, once, on every surface', async () => {
  const seen: string[] = [];
  globalThis.fetch = jest.fn(async (url: string | URL) => {
    if (String(url) === 'https://opencode.ai/console/api/orgs') return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    seen.push(String(url));
    return new Response('{"error":"Workspace access denied"}', { status: 403, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof globalThis.fetch;
  await connectOpenCode(PLAN_KEY);
  const refused = jest.fn();
  // The kit's own error for this refusal says only "could not answer"; the app keeps the status from the wire.
  const failure = await streamSelectionRewrite('opencode', 'Sam: Saturday?', Rewrite.TIGHTEN, '', { refused }).then(() => null, (error: unknown) => error);
  expect(failure).toBeInstanceOf(AccountRefused);
  expect((failure as Error).message).toBe(words.openCodeRefused);
  expect(refused).toHaveBeenCalledWith(words.openCodeRefused);
  expect(seen).toHaveLength(1);
});

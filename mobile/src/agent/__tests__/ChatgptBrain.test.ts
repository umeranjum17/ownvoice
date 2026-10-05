import { getSource } from '../../core/source';
import { chatgptEnabled, currentSwitch } from '../../core/switch';
import { words } from '../../core/words';
import { accounts, codexAuth, reportFailure } from '../../chatgpt/accounts';
import { session, sessionNow, signOutGuard } from '../../chatgpt/session';
import { chatgptBrain } from '../chatgptBrain';
import { runAgent, type Spec } from '../loop';
import { IncompleteError, ResponseError } from '@byokit/accounts';

jest.mock('../../../modules/ownvoice-native', () => ({
  __esModule: true,
  default: { bubbleRules: jest.fn(async () => null), setBubbleRules: jest.fn(async () => {}) },
}));
jest.mock('../../chatgpt/accounts', () => {
  const actual = jest.requireActual('../../chatgpt/accounts');
  actual.accounts.runtime = jest.fn(async () => ({
    getAuth: async () => ({ auth: { apiKey: 'fixture-access' } }),
    readCredential: async () => ({ type: 'oauth', accountId: 'fixture-account' }),
  }));
  actual.accounts.failed = jest.fn(async () => null);
  actual.accounts.respond = jest.fn(actual.accounts.respond.bind(actual.accounts));
  return {
    ...actual,
    codexAuth: jest.fn(async () => ({ access: 'fixture-access', accountId: 'fixture-account' })),
    reportFailure: jest.fn(async () => null),
  };
});
jest.mock('expo/fetch', () => ({ fetch: (...args: Parameters<typeof fetch>) => global.fetch(...args) }));
jest.mock('../../core/localModel', () => ({ askLocal: jest.fn(), localModelState: jest.fn(async () => ({ phase: 'ready' })), agreedToDownload: jest.fn(() => false) }));
jest.mock('../../panel/phoneWriter', () => ({ phoneWriter: { write: jest.fn(async () => ({ drafts: ['a', 'b', 'c'] })) } }));
jest.mock('../../core/source', () => ({ getSource: jest.fn(async () => 'chatgpt') }));
jest.mock('../../chatgpt/session', () => ({
  mocked: false,
  session: { current: jest.fn(async () => ({ signedIn: true })) },
  sessionNow: jest.fn(() => ({ signedIn: true })),
  signOutGuard: jest.fn(() => ({ active: false, epoch: 7 })),
}));
jest.mock('../../core/switch', () => ({
  CHATGPT_OFF: 'ChatGPT is turned off for now. This phone wrote these.',
  chatgptEnabled: jest.fn(async () => true),
  currentSwitch: jest.fn(async () => ({ seq: 1, chatgpt: 'on', fetchedAt: Date.now() })),
}));

const mockSource = getSource as jest.Mock;
const mockCurrent = session.current as jest.Mock;
const mockNow = sessionNow as jest.Mock;
const mockGuard = signOutGuard as jest.Mock;
const mockEnabled = chatgptEnabled as jest.Mock;
const mockSwitch = currentSwitch as jest.Mock;
const mockAuth = codexAuth as jest.Mock;
const mockRespond = accounts.respond as jest.Mock;

const tools: Spec[] = [
  { type: 'function', name: 'check_voice', description: 'check', parameters: { type: 'object', properties: {} } },
  { type: 'function', name: 'share_note', description: 'share', parameters: { type: 'object', properties: {} } },
];
const event = (o: object) => `data: ${JSON.stringify(o)}\n\n`;
const callDone = (id: string, name: string, args: object) => event({ type: 'response.output_item.done', item: { type: 'function_call', call_id: id, name, arguments: JSON.stringify(args) } });
const say = (delta: string) => event({ type: 'response.output_text.delta', delta });
const done = event({ type: 'response.completed', response: {} });
// Split mid-event: every 7 bytes, so no event, line or UTF-8 boundary survives a chunk edge.
const chopped = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += 7) chunks.push(bytes.slice(i, i + 7));
  return new ReadableStream<Uint8Array>({ start(c) { chunks.forEach(part => c.enqueue(part)); c.close(); } });
};
const okFetch = (payload: string) => jest.fn(async () => ({ ok: true, body: chopped(payload) } as unknown as Response));

beforeEach(() => {
  jest.clearAllMocks();
  mockSource.mockResolvedValue('chatgpt');
  mockCurrent.mockResolvedValue({ signedIn: true });
  mockNow.mockReturnValue({ signedIn: true });
  mockGuard.mockReturnValue({ active: false, epoch: 7 });
  mockEnabled.mockResolvedValue(true);
  mockSwitch.mockResolvedValue({ seq: 1, chatgpt: 'on', fetchedAt: Date.now() });
  mockAuth.mockResolvedValue({ access: 'fixture-access', accountId: 'fixture-account' });
});

type Switch = 'on' | 'off' | 'unknown';
type Outcome = 'ok' | '429' | '401' | 'network' | 'cut';

const guardLine = (source: string, signedIn: boolean, signingOut: boolean, sw: Switch): string | null => {
  if (source !== 'chatgpt') return words.needWriterPanel;
  if (!signedIn || signingOut) return words.chatgptFailed;
  if (sw === 'off') return words.gptOffNoPhone;
  if (sw === 'unknown') return words.switchUnavailable;
  return null;
};
const failureLine: Record<Exclude<Outcome, 'ok'>, string> = {
  '429': words.chatgptFailed,
  '401': words.chatgptFailed,
  network: words.offlineNoPhone,
  cut: words.offlineNoPhone,
};

const rows: { source: string; signedIn: boolean; signingOut: boolean; sw: Switch; outcome: Outcome }[] = [];
for (const source of ['chatgpt', 'phone'])
  for (const signedIn of [true, false])
    for (const signingOut of [true, false])
      for (const sw of ['on', 'off', 'unknown'] as Switch[])
        for (const outcome of ['ok', '429', '401', 'network', 'cut'] as Outcome[])
          rows.push({ source, signedIn, signingOut, sw, outcome });

test.each(rows)('source=$source signedIn=$signedIn signingOut=$signingOut switch=$sw outcome=$outcome', async ({ source, signedIn, signingOut, sw, outcome }) => {
  mockSource.mockResolvedValue(source);
  mockCurrent.mockResolvedValue({ signedIn });
  mockNow.mockReturnValue({ signedIn });
  mockGuard.mockReturnValue({ active: signingOut, epoch: 7 });
  mockSwitch.mockResolvedValue(sw === 'unknown' ? null : { seq: 1, chatgpt: sw, fetchedAt: Date.now() });
  const fetch =
    outcome === '429'
      ? jest.fn(async () => ({ ok: false, status: 429, text: async () => JSON.stringify({ error: { code: 'usage_limit_reached' } }) } as unknown as Response))
      : outcome === '401'
        ? jest.fn(async () => ({ ok: false, status: 401, text: async () => 'Unauthorized' } as unknown as Response))
        : outcome === 'network'
          ? jest.fn(async () => { throw new TypeError('Network request failed'); })
          : okFetch(outcome === 'cut'
            ? say('half an answer')
            : say('Draft:') + callDone('c1', 'check_voice', { draft: 'Draft:' }) + done);
  const brain = chatgptBrain({ fetch, model: 'm' });
  const blocked = guardLine(source, signedIn, signingOut, sw);
  if (blocked) {
    await expect(brain.step('instructions', [], tools)).rejects.toThrow(blocked);
    expect(fetch).not.toHaveBeenCalled();
    expect(mockRespond).not.toHaveBeenCalled();
    return;
  }
  if (outcome === 'ok') {
    const deltas: string[] = [];
    const turn = await brain.step('instructions', [], tools, t => deltas.push(t));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mockRespond).toHaveBeenCalledWith('owner', expect.objectContaining({ model: 'm', tools, parallelToolCalls: false }));
    expect(turn).toEqual({ text: 'Draft:', calls: [{ id: 'c1', name: 'check_voice', args: JSON.stringify({ draft: 'Draft:' }) }] });
    expect(deltas).toEqual(['Draft:']);
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.store).toBe(false);
    expect(body.parallel_tool_calls).toBe(false);
    expect(body.model).toBe('m');
    expect(body.tools.map((t: Spec) => t.name)).toEqual(['check_voice', 'share_note']);
    expect(init.headers).toMatchObject({ authorization: 'Bearer fixture-access', 'chatgpt-account-id': 'fixture-account' });
  } else {
    await expect(brain.step('instructions', [], tools)).rejects.toThrow(failureLine[outcome]);
    expect(fetch).toHaveBeenCalledTimes(1);
  }
});

test('a sign-out starting mid-step sends nothing', async () => {
  mockGuard.mockReturnValueOnce({ active: false, epoch: 7 }).mockReturnValue({ active: false, epoch: 8 });
  const fetch = okFetch(done);
  await expect(chatgptBrain({ fetch }).step('instructions', [], tools)).rejects.toThrow(words.chatgptFailed);
  expect(fetch).not.toHaveBeenCalled();
});

test('a switch that cannot be read sends nothing', async () => {
  mockSwitch.mockRejectedValue(new Error('no store'));
  const fetch = okFetch(done);
  await expect(chatgptBrain({ fetch }).step('instructions', [], tools)).rejects.toThrow(words.switchUnavailable);
  expect(fetch).not.toHaveBeenCalled();
});

test('a failed sign-in check sends nothing', async () => {
  mockAuth.mockRejectedValue(new Error('Sign in with ChatGPT first.'));
  const fetch = okFetch(done);
  await expect(chatgptBrain({ fetch }).step('instructions', [], tools)).rejects.toThrow(words.chatgptFailed);
  expect(fetch).not.toHaveBeenCalled();
});

test('signing out between auth and fetch sends nothing', async () => {
  mockNow.mockReturnValue({ signedIn: false });
  const fetch = okFetch(done);
  await expect(chatgptBrain({ fetch }).step('instructions', [], tools)).rejects.toThrow(words.chatgptFailed);
  expect(fetch).not.toHaveBeenCalled();
});

test('an error event mid-stream maps to the plain line', async () => {
  const fetch = okFetch(say('Draft:') + event({ type: 'response.failed', response: { error: { message: 'boom', code: 'x' } } }));
  await expect(chatgptBrain({ fetch }).step('instructions', [], tools)).rejects.toThrow(words.chatgptFailed);
  expect(reportFailure).toHaveBeenCalled();
});

test('the failed step says nothing about the model or the tools', async () => {
  const fetch = jest.fn(async () => { throw new TypeError('Network request failed'); });
  const error = await chatgptBrain({ fetch }).step('instructions', [], tools).catch(e => e);
  expect(error.message).toBe(words.offlineNoPhone);
});

test('kit tools round-trip through the existing loop with serial calls', async () => {
  const bodies: Record<string, unknown>[] = [];
  const replies = [
    say('Draft:') + callDone('c1', 'check_voice', { draft: 'Draft:' }) + done,
    say('Ready.') + done,
  ];
  const fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return { ok: true, body: chopped(replies.shift()!) } as Response;
  });
  const run = jest.fn(async () => 'Looks good.');
  const deltas: string[] = [];
  await expect(runAgent({
    instructions: 'instructions', task: 'Write a note.', brain: chatgptBrain({ fetch, model: 'm' }),
    tools: [{ spec: tools[0], run }, { spec: tools[1], run: jest.fn() }],
    approve: jest.fn(), onText: text => deltas.push(text),
  })).resolves.toEqual({ text: 'Ready.', steps: 2, stop: 'done' });
  expect(run).toHaveBeenCalledWith({ draft: 'Draft:' });
  expect(mockRespond).toHaveBeenCalledTimes(2);
  expect(deltas).toEqual(['Draft:', 'Ready.']);
  expect(bodies[0].input).toEqual([
    { role: 'user', content: [{ type: 'input_text', text: 'Write a note.' }] },
  ]);
  expect(bodies[1].input).toEqual([
    ...bodies[0].input as object[],
    { role: 'assistant', content: [{ type: 'output_text', text: 'Draft:' }] },
    { type: 'function_call', call_id: 'c1', name: 'check_voice', arguments: '{"draft":"Draft:"}' },
    { type: 'function_call_output', call_id: 'c1', output: 'Looks good.' },
  ]);
  for (const body of bodies) expect(body).toMatchObject({
    model: 'm', instructions: 'instructions', tools, tool_choice: 'auto',
    parallel_tool_calls: false, stream: true, store: false,
    reasoning: { effort: 'none' }, text: { verbosity: 'low' },
  });
});

test('a kit error is reported and mapped to the plain screen line', async () => {
  mockRespond.mockRejectedValueOnce(new ResponseError('boom', null));
  const fetch = okFetch(done);
  await expect(chatgptBrain({ fetch }).step('instructions', [], tools)).rejects.toThrow(words.chatgptFailed);
  expect(fetch).not.toHaveBeenCalled();
  expect(reportFailure).toHaveBeenCalledWith('boom');
});

test.each(['max_output_tokens', 'content_filter', 'unknown'])('kit incomplete response (%s) never executes partial tool calls', async reason => {
  const run = jest.fn();
  mockRespond.mockRejectedValueOnce(new IncompleteError(reason, {
    text: 'Partial draft',
    output: [{ type: 'function_call', call_id: 'c1', name: 'check_voice', arguments: '{}' }],
  }));
  await expect(runAgent({
    instructions: 'instructions', task: 'Write a note.', brain: chatgptBrain(),
    tools: [{ spec: tools[0], run }], approve: jest.fn(),
  })).rejects.toThrow(words.chatgptFailed);
  expect(run).not.toHaveBeenCalled();
  expect(mockRespond).toHaveBeenCalledTimes(1);
  expect(reportFailure).not.toHaveBeenCalled();
  expect(accounts.failed).not.toHaveBeenCalled();
});

test('signing out during the kit credential lookup prevents fetch dispatch', async () => {
  (accounts.runtime as jest.Mock).mockImplementationOnce(async () => {
    mockNow.mockReturnValue({ signedIn: false });
    return {
      getAuth: async () => ({ auth: { apiKey: 'fixture-access' } }),
      readCredential: async () => ({ type: 'oauth', accountId: 'fixture-account' }),
    };
  });
  const fetch = okFetch(done);
  await expect(chatgptBrain({ fetch }).step('instructions', [], tools)).rejects.toThrow(words.chatgptFailed);
  expect(mockRespond).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
});

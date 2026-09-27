jest.mock('../accounts', () => ({ codexAuth: jest.fn(async () => ({ access: 'fixture-access', accountId: 'fixture-account' })), reportFailure: jest.fn(async () => ({ kind: 'rate_limit', until: 0 })) }));
jest.mock('expo/fetch', () => ({ fetch: (...args: Parameters<typeof fetch>) => global.fetch(...args) }));
import { chatgptWriter, streamResponses } from '../responses';
import { codexAuth, reportFailure } from '../accounts';
import { words } from '../../core/words';
import { readDraftStream } from '../../core/responses-stream';
import type { DraftRequest } from '../../core/writers';

const event = (item: object) => `data: ${JSON.stringify(item)}`;
const body = (...chunks: string[]) => new ReadableStream<Uint8Array>({ start(controller) {
  for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
  controller.close();
} });
const fetcher = (stream: ReadableStream<Uint8Array>) => jest.fn(async () => ({ ok: true, body: stream } as Response));
const reported = reportFailure as jest.Mock;
beforeEach(() => reported.mockClear());

test('accepts CRLF events split across chunks and a final unterminated completion', async () => {
  const first = event({ type: 'response.output_text.delta', delta: '{"versions":[' });
  const second = event({ type: 'response.output_text.delta', delta: '"A","B","C"]}' });
  const complete = event({ type: 'response.completed' });
  const fetch = fetcher(body(first + '\r', '\n\r\n' + second + '\r\n\r\n' + event({ type: 'response.output_text.done', text: '{"versions":["A","B","C"]}' }) + '\r\n\r\n' + complete));
  const deltas: string[] = [];
  await expect(streamResponses('C2 prompt', text => deltas.push(text), fetch)).resolves.toEqual(['A', 'B', 'C']);
  expect(deltas).toEqual(['{"versions":[', '"A","B","C"]}']);
  expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer fixture-access', 'Content-Type': 'application/json', 'chatgpt-account-id': 'fixture-account', originator: 'ownvoice', 'OpenAI-Beta': 'responses=experimental', accept: 'text/event-stream' } }));
});

test('accepts bare-CR data lines and event boundaries across chunks', async () => {
  const first = `event: response.output_text.delta\r${event({ type: 'response.output_text.delta', delta: '{"versions":[' })}\r\r`;
  const second = event({ type: 'response.output_text.delta', delta: '"A","B","C"]}' });
  const complete = event({ type: 'response.completed' });
  const deltas: string[] = [];
  await expect(streamResponses('C2 prompt', text => deltas.push(text), fetcher(body(first.slice(0, -1), first.slice(-1) + second + '\r\r' + complete)))).resolves.toEqual(['A', 'B', 'C']);
  expect(deltas).toEqual(['{"versions":[', '"A","B","C"]}']);
});

test.each([
  ['missing completion', event({ type: 'response.output_text.delta', delta: '{"versions":["A","B","C"]}' }) + '\n\n'],
  ['truncated JSON', event({ type: 'response.output_text.delta', delta: '{"versions":["A","B","C"' }) + '\n\n' + event({ type: 'response.completed' })],
  ['partial drafts', event({ type: 'response.output_text.delta', delta: '{"versions":["one"]}' }) + '\n\n' + event({ type: 'response.completed' })],
])('rejects %s', async (_label, stream) => {
  const originalFetch = global.fetch;
  global.fetch = fetcher(body(stream));
  try {
    await expect(chatgptWriter.write({ conversation: '', written: 'hi', typed: '' })).rejects.toThrow(words.chatgptFailed);
  } finally { global.fetch = originalFetch; }
});

test('stream accepts only the requested response key, including a one-slot retry', async () => {
  const output = (key: string, drafts: string[]) => body(`${event({ type: 'response.output_text.delta', delta: JSON.stringify({ [key]: drafts }) })}\n\n${event({ type: 'response.completed' })}`);
  await expect(readDraftStream(output('versions', ['A', 'B', 'C']), 'drafts')).rejects.toThrow();
  await expect(readDraftStream(output('drafts', ['A', 'B', 'C']), 'versions')).rejects.toThrow();
  await expect(readDraftStream(output('drafts', ['No thanks']), 'drafts', undefined, 1)).resolves.toEqual(['No thanks']);
  await expect(readDraftStream(output('versions', ['No thanks']), 'drafts', undefined, 1)).rejects.toThrow();
});

test('an http failure never shows a number', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn(async () => ({ ok: false, status: 500, text: async () => '', body: null } as unknown as Response));
  try {
    await expect(chatgptWriter.write({ conversation: '', written: 'hi', typed: '' })).rejects.toThrow(words.chatgptFailed);
    await expect(chatgptWriter.write({ conversation: '', written: 'hi', typed: '' })).rejects.toThrow(/ChatGPT didn't answer this time\./);
  } finally { global.fetch = originalFetch; }
});

test.each([
  [429, 'Too many requests. Try again in 12 min'],
  [403, 'Unauthorized'],
  [400, 'Usage limit reached'],
])('account refusal %s is reported and reply slots are not retried', async (status, message) => {
  const originalFetch = global.fetch;
  const fetch = jest.fn(async () => ({ ok: false, status, text: async () => message, body: null } as unknown as Response));
  global.fetch = fetch;
  try {
    await expect(chatgptWriter.write({ conversation: 'Sam: See you?', written: 'Sam: See you?', typed: '' })).rejects.toThrow(words.chatgptFailed);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(reported).toHaveBeenCalledWith(`${status} ${message}`);
  } finally { global.fetch = originalFetch; }
});

test('streamed account refusal is reported and polish slots are not retried', async () => {
  const originalFetch = global.fetch;
  const fetch = fetcher(body(`${event({ type: 'response.failed', response: { error: { message: 'Rate limit: try again in 3 min' } } })}\n\n`));
  global.fetch = fetch;
  try {
    await expect(chatgptWriter.write({ conversation: '', written: '', typed: 'hello' })).rejects.toThrow(words.chatgptFailed);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(reported).toHaveBeenCalledWith('Rate limit: try again in 3 min');
  } finally { global.fetch = originalFetch; }
});

const retryCases: Array<[DraftRequest, object]> = [
  [{ conversation: 'Sam: See you?', written: 'Sam: See you?', typed: '' }, { drafts: ['No thanks', 'No thanks', 'No thanks'] }],
  [{ conversation: '', written: '', typed: 'line one\nline two\nline three' }, { versions: ['Changed', 'Better', 'Different'] }],
];
test.each(retryCases)('account failure during a slot retry stops further requests', async (request, initial) => {
  const originalFetch = global.fetch;
  const fetch = jest.fn().mockResolvedValueOnce({ ok: true, body: body(`${event({ type: 'response.output_text.delta', delta: JSON.stringify(initial) })}\n\n${event({ type: 'response.completed' })}`) })
    .mockResolvedValue({ ok: false, status: 429, text: async () => 'Too many requests', body: null });
  global.fetch = fetch;
  try {
    await expect(chatgptWriter.write(request)).rejects.toThrow(words.chatgptFailed);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(reported).toHaveBeenCalledWith('429 Too many requests');
  } finally { global.fetch = originalFetch; }
});

test('authentication and pre-send rejection never mark a tap', async () => {
  const originalFetch = global.fetch;
  const fetch = jest.fn();
  global.fetch = fetch;
  const sent = jest.fn();
  try {
    (codexAuth as jest.Mock).mockRejectedValueOnce(new Error('no account'));
    await expect(chatgptWriter.write({ conversation: 'chat', written: 'chat', typed: '' }, { sent })).rejects.toThrow(words.chatgptFailed);
    await expect(chatgptWriter.write({ conversation: 'chat', written: 'chat', typed: '' }, { sent, beforeSend: async () => false })).rejects.toThrow(words.chatgptFailed);
    expect(fetch).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test('a fetch started then failing leaves the tap marked', async () => {
  const originalFetch = global.fetch;
  const order: string[] = [];
  let releaseMark!: () => void;
  let markStarted!: () => void;
  const started = new Promise<void>(resolve => { markStarted = resolve; });
  const sent = jest.fn(() => {
    order.push('sent');
    markStarted();
    return new Promise<void>(resolve => { releaseMark = resolve; });
  });
  const fetch = jest.fn(async () => { order.push('fetch'); throw new Error('offline'); });
  global.fetch = fetch;
  try {
    const writing = chatgptWriter.write({ conversation: 'chat', written: 'chat', typed: '' }, { sent });
    await started;
    expect(fetch).not.toHaveBeenCalled();
    releaseMark();
    await expect(writing).rejects.toThrow(words.chatgptFailed);
    expect(order).toEqual(['sent', 'fetch']);
    expect(sent).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally { global.fetch = originalFetch; }
});

test('permission withdrawn while marking a tap prevents the fetch', async () => {
  const originalFetch = global.fetch;
  const fetch = jest.fn();
  global.fetch = fetch;
  let releaseMark!: () => void;
  let markStarted!: () => void;
  const started = new Promise<void>(resolve => { markStarted = resolve; });
  const sent = jest.fn(() => {
    markStarted();
    return new Promise<void>(resolve => { releaseMark = resolve; });
  });
  const beforeSend = jest.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
  try {
    const writing = chatgptWriter.write({ conversation: 'chat', written: 'chat', typed: '' }, { beforeSend, sent });
    await started;
    releaseMark();
    await expect(writing).rejects.toThrow(words.chatgptFailed);
    expect(beforeSend).toHaveBeenCalledTimes(2);
    expect(sent).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test('a later reply request rechecks permission before sending', async () => {
  const originalFetch = global.fetch;
  const fetch = fetcher(body(`${event({ type: 'response.output_text.delta', delta: JSON.stringify({ drafts: ['No thanks', 'No thanks', 'No thanks'] }) })}\n\n${event({ type: 'response.completed' })}`));
  global.fetch = fetch;
  const beforeSend = jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValue(false);
  const sent = jest.fn();
  try {
    await expect(chatgptWriter.write({ conversation: 'Sam: See you?', written: 'Sam: See you?', typed: '' }, { beforeSend, sent })).resolves.toEqual({ drafts: ['No thanks'] });
    expect(beforeSend).toHaveBeenCalledTimes(4);
    expect(sent).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally { global.fetch = originalFetch; }
});

test('reply mode sends the C2 reply prompt; polish sends the rewrite prompt', async () => {
  const originalFetch = global.fetch;
  const bodies: string[] = [];
  try {
    // Replies: the reply prompt, asking for draft JSON.
    global.fetch = jest.fn(async (_url, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { instructions: string; input: { content: { text: string }[] }[] };
      bodies.push(`${payload.instructions}\n---\n${payload.input[0].content[0].text}`);
      return { ok: true, body: body(`${event({ type: 'response.output_text.delta', delta: '{"drafts":["Yes — on","No, Saturday is out","What time works?"]}' })}\n\n${event({ type: 'response.completed' })}`) } as unknown as Response;
    }) as unknown as typeof fetch;
    const reply = await chatgptWriter.write({ conversation: 'Sam: Are we still on for Saturday? I can bring the tent if you bring the stove.', written: 'Sam: Are we still on for Saturday? I can bring the tent if you bring the stove.', nodes: [{ text: 'Sam: Are we still on for Saturday? I can bring the tent if you bring the stove.', left: 0, top: 10, bottom: 30, clickable: false }], fieldTop: 50, typed: '' });
    expect(reply.drafts).toEqual(['Yes, on', 'No, Saturday is out', 'What time works?']);
    expect(bodies.at(-1)).toContain('Return the requested reply drafts as JSON.');
    expect(bodies.at(-1)).toContain('Latest message:');
    expect(bodies.at(-1)).toContain('Every draft must respond to everything the latest message asks or offers');

    // Polish: the rewrite prompt on the typed text.
    global.fetch = jest.fn(async (_url, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { instructions: string; input: { content: { text: string }[] }[] };
      bodies.push(`${payload.instructions}\n---\n${payload.input[0].content[0].text}`);
      return { ok: true, body: body(`${event({ type: 'response.output_text.delta', delta: '{"versions":["a","b","c"]}' })}\n\n${event({ type: 'response.completed' })}`) } as unknown as Response;
    }) as unknown as typeof fetch;
    const polish = await chatgptWriter.write({ conversation: 'chat on screen', written: 'chat on screen', typed: 'i can bring the stove' });
    expect(polish.drafts).toEqual(['a', 'b', 'c']);
    expect(bodies.at(-1)).toContain('Return the requested three rewrite versions as JSON.');
    expect(bodies.at(-1)).toContain('Their text:\ni can bring the stove');
    expect(bodies.at(-1)).toContain('Screen (context only):\nchat on screen');
    expect(bodies.at(-1)).not.toContain('Latest message:');
  } finally { global.fetch = originalFetch; }
});

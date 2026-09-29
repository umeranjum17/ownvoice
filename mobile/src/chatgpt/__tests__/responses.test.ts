jest.mock('../accounts', () => {
  const { respond: ask } = jest.requireActual('@byokit/accounts');
  return {
    codexAuth: jest.fn(async () => ({ access: 'fixture-access', accountId: 'fixture-account' })),
    accounts: {
      respond: jest.fn((_member: string, request: { instructions: string; input: string; model?: string; onText?: (text: string) => void }) =>
        ask({ ...request, access: 'fixture-access', accountId: 'fixture-account', model: request.model ?? 'fixture-model', fetch: (...args: Parameters<typeof fetch>) => (global.fetch as typeof fetch)(...args) })),
    },
    reportFailure: jest.fn(async () => ({})),
  };
});
import { accounts, codexAuth, reportFailure } from '../accounts';
import { CHATGPT_MODEL, chatgptWriter, streamResponses } from '../responses';
import { platformForApp } from '../../core/platforms';
import { words } from '../../core/words';
import type { DraftRequest } from '../../core/writers';

const respondMock = accounts.respond as unknown as jest.Mock;
const authMock = codexAuth as unknown as jest.Mock;
const event = (item: object) => `data: ${JSON.stringify(item)}`;
const body = (...chunks: string[]) => new ReadableStream<Uint8Array>({ start(controller) {
  for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
  controller.close();
} });
const fetcher = (stream: ReadableStream<Uint8Array>) => jest.fn(async () => ({ ok: true, body: stream } as Response));
const reported = reportFailure as unknown as jest.Mock;
beforeEach(() => { reported.mockClear(); respondMock.mockClear(); authMock.mockClear(); });

test('accepts CRLF events split across chunks and a final unterminated completion', async () => {
  const first = event({ type: 'response.output_text.delta', delta: '{"versions":[' });
  const second = event({ type: 'response.output_text.delta', delta: '"A","B","C"]}' });
  const complete = event({ type: 'response.completed' });
  const originalFetch = global.fetch;
  global.fetch = fetcher(body(first + '\r', '\n\r\n' + second + '\r\n\r\n' + event({ type: 'response.output_text.done', text: '{"versions":["A","B","C"]}' }) + '\r\n\r\n' + complete)) as unknown as typeof fetch;
  try {
    const deltas: string[] = [];
    await expect(streamResponses('C2 prompt', text => deltas.push(text))).resolves.toEqual(['A', 'B', 'C']);
    expect(deltas).toEqual(['{"versions":[', '"A","B","C"]}']);
    expect(global.fetch).toHaveBeenCalledWith('https://chatgpt.com/backend-api/codex/responses', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ authorization: 'Bearer fixture-access', 'chatgpt-account-id': 'fixture-account', accept: 'text/event-stream' }) }));
    const sent = JSON.parse(String((global.fetch as jest.Mock).mock.calls[0][1].body));
    expect(sent).toMatchObject({ model: CHATGPT_MODEL, stream: true });
    expect(String(sent.instructions)).toContain('three rewrite versions as JSON');
  } finally { global.fetch = originalFetch; }
});

test.each([
  ['missing completion', event({ type: 'response.output_text.delta', delta: '{"versions":["A","B","C"]}' }) + '\n\n'],
  ['truncated JSON', event({ type: 'response.output_text.delta', delta: '{"versions":["A","B","C"' }) + '\n\n' + event({ type: 'response.completed' })],
  ['partial drafts', event({ type: 'response.output_text.delta', delta: '{"versions":["one"]}' }) + '\n\n' + event({ type: 'response.completed' })],
  ['wrong envelope', event({ type: 'response.output_text.delta', delta: '{"versions":["A","B","C"]}' }) + '\n\n' + event({ type: 'response.completed' })],
])('rejects %s', async (_label, stream) => {
  const originalFetch = global.fetch;
  global.fetch = fetcher(body(stream)) as unknown as typeof fetch;
  try {
    await expect(chatgptWriter.write({ conversation: '', written: 'hi', typed: '' })).rejects.toThrow(words.chatgptFailed);
  } finally { global.fetch = originalFetch; }
});

test('an http failure never shows a number', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn(async () => ({ ok: false, status: 500, text: async () => '', body: null } as unknown as Response)) as unknown as typeof fetch;
  try {
    await expect(chatgptWriter.write({ conversation: '', written: 'hi', typed: '' })).rejects.toThrow(words.chatgptFailed);
    await expect(chatgptWriter.write({ conversation: '', written: 'hi', typed: '' })).rejects.toThrow(/ChatGPT didn't answer this time\./);
  } finally { global.fetch = originalFetch; }
});

test.each([
  [429, 'Too many requests. Try again in 12 min', false],
  [403, 'Unauthorized', false],
  [400, 'Usage limit reached', true],
])('account refusal %s stops reply-slot retries and is reported only when the kit did not act', async (status, message, reports) => {
  const originalFetch = global.fetch;
  const fetch = jest.fn(async () => ({ ok: false, status, text: async () => message, body: null } as unknown as Response));
  global.fetch = fetch as unknown as typeof fetch;
  try {
    await expect(chatgptWriter.write({ conversation: 'Sam: See you?', written: 'Sam: See you?', typed: '' })).rejects.toThrow(words.chatgptFailed);
    expect(fetch).toHaveBeenCalledTimes(1);
    if (reports) expect(reported).toHaveBeenCalledWith(message);
    else expect(reported).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test('streamed account refusal is not re-reported and polish slots are not retried', async () => {
  const originalFetch = global.fetch;
  const fetch = fetcher(body(`${event({ type: 'response.failed', response: { error: { message: 'Rate limit: try again in 3 min' } } })}\n\n`));
  global.fetch = fetch as unknown as typeof fetch;
  try {
    await expect(chatgptWriter.write({ conversation: '', written: '', typed: 'hello' })).rejects.toThrow(words.chatgptFailed);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(reported).not.toHaveBeenCalled();
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
  global.fetch = fetch as unknown as typeof fetch;
  try {
    await expect(chatgptWriter.write(request)).rejects.toThrow(words.chatgptFailed);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(reported).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test('authentication and pre-send rejection never mark a tap', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn() as unknown as typeof fetch;
  const sent = jest.fn();
  try {
    authMock.mockRejectedValueOnce(new Error('no account'));
    await expect(chatgptWriter.write({ conversation: 'chat', written: 'chat', typed: '' }, { sent })).rejects.toThrow(words.phoneWrote);
    await expect(chatgptWriter.write({ conversation: 'chat', written: 'chat', typed: '' }, { sent, beforeSend: async () => false })).rejects.toThrow(words.phoneWrote);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
    expect(respondMock).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test('a fetch failing before any answer leaves the tap unmarked', async () => {
  const originalFetch = global.fetch;
  const sent = jest.fn();
  const unsent = jest.fn();
  const fetch = jest.fn(async () => { throw new Error('offline'); });
  global.fetch = fetch as unknown as typeof fetch;
  try {
    await expect(chatgptWriter.write({ conversation: 'chat', written: 'chat', typed: '' }, { sent, unsent })).rejects.toThrow(words.chatgptFailed);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sent).not.toHaveBeenCalled();
    expect(unsent).not.toHaveBeenCalled();
    expect(reported).toHaveBeenCalledWith('offline');
  } finally { global.fetch = originalFetch; }
});

test('a transmitted request that fails stays marked as sent', async () => {
  const originalFetch = global.fetch;
  const sent = jest.fn();
  const unsent = jest.fn();
  global.fetch = jest.fn(async () => ({ ok: false, status: 429, text: async () => 'Too many requests', body: null } as unknown as Response));
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    await expect(chatgptWriter.write({ conversation: 'chat', written: 'chat', typed: '' }, { sent, unsent })).rejects.toThrow(words.chatgptFailed);
    expect(sent).toHaveBeenCalledTimes(1);
    expect(unsent).not.toHaveBeenCalled();
    expect(reported).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('kind=rate_limit'));
  } finally { global.fetch = originalFetch; log.mockRestore(); }
});

test('a mid-stream drop after deltas arrived stays marked as sent', async () => {
  const originalFetch = global.fetch;
  const sent = jest.fn();
  const unsent = jest.fn();
  global.fetch = fetcher(body(`${event({ type: 'response.output_text.delta', delta: '{"versions":[' })}\n\n`)) as unknown as typeof fetch;
  try {
    await expect(chatgptWriter.write({ conversation: '', written: '', typed: 'hello' }, { sent, unsent })).rejects.toThrow(words.chatgptFailed);
    expect(sent).toHaveBeenCalledTimes(1);
    expect(unsent).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test('a network failure throws without the no-answer log', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn(async () => { throw new Error('fetch failed: socket hang up'); });
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    await expect(chatgptWriter.write({ conversation: 'chat', written: 'chat', typed: '' }, {})).rejects.toThrow('fetch failed: socket hang up');
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('no-answer'), expect.anything());
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('Ownvoice ChatGPT no-answer'));
  } finally { global.fetch = originalFetch; log.mockRestore(); }
});

test('permission withdrawn before dispatch prevents the fetch and marks nothing', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn() as unknown as typeof fetch;
  const beforeSend = jest.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
  const sent = jest.fn();
  const unsent = jest.fn(async () => {});
  try {
    await expect(chatgptWriter.write({ conversation: 'chat', written: 'chat', typed: '' }, { beforeSend, sent, unsent })).rejects.toThrow(words.phoneWrote);
    expect(beforeSend).toHaveBeenCalledTimes(2);
    expect(sent).not.toHaveBeenCalled();
    expect(unsent).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test('the synchronous last gate vetoes before anything is marked', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn() as unknown as typeof fetch;
  let allowed = true;
  const beforeSend = jest.fn().mockResolvedValueOnce(true).mockImplementationOnce(async () => {
    queueMicrotask(() => { allowed = false; });
    return true;
  });
  const beforeFetch = jest.fn(() => allowed);
  const sent = jest.fn();
  const unsent = jest.fn();
  try {
    await expect(chatgptWriter.write({ conversation: 'chat', written: 'chat', typed: '' }, { beforeSend, beforeFetch, sent, unsent })).rejects.toThrow(words.phoneWrote);
    expect(beforeSend).toHaveBeenCalledTimes(2);
    expect(beforeFetch).toHaveBeenCalledTimes(1);
    expect(sent).not.toHaveBeenCalled();
    expect(unsent).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test('a failed send mark after dispatch surfaces the failure', async () => {
  const originalFetch = global.fetch;
  const fetch = fetcher(body(`${event({ type: 'response.output_text.delta', delta: JSON.stringify({ drafts: ['A', 'B', 'C'] }) })}\n\n${event({ type: 'response.completed' })}`));
  global.fetch = fetch as unknown as typeof fetch;
  try {
    const sent = jest.fn(async () => { throw new Error('full'); });
    const unsent = jest.fn();
    await expect(chatgptWriter.write({ conversation: 'chat', written: 'chat', typed: '' }, { sent, unsent })).rejects.toThrow(words.chatgptFailed);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sent).toHaveBeenCalledTimes(1);
    expect(unsent).not.toHaveBeenCalled();
    expect(reported).toHaveBeenCalledWith('full');
  } finally { global.fetch = originalFetch; }
});

test('a later reply request rechecks permission before sending', async () => {
  const originalFetch = global.fetch;
  global.fetch = fetcher(body(`${event({ type: 'response.output_text.delta', delta: JSON.stringify({ drafts: ['No thanks', 'No thanks', 'No thanks'] }) })}\n\n${event({ type: 'response.completed' })}`)) as unknown as typeof fetch;
  const beforeSend = jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValue(false);
  const sent = jest.fn();
  const unsent = jest.fn();
  try {
    await expect(chatgptWriter.write({ conversation: 'Sam: See you?', written: 'Sam: See you?', typed: '' }, { beforeSend, sent, unsent })).rejects.toThrow(words.phoneWrote);
    expect(beforeSend).toHaveBeenCalledTimes(3);
    expect(sent).toHaveBeenCalledTimes(1);
    // The later request is vetoed at its first check, before a second mark.
    expect(unsent).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  } finally { global.fetch = originalFetch; }
});

test('reply cleanup uses only control labels in the capture', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn(async () => ({ ok: true, body: body(`${event({ type: 'response.output_text.delta', delta: '{"drafts":["Yes.\\nSkip","No.","Maybe."]}' })}\n\n${event({ type: 'response.completed' })}`) } as Response)) as unknown as typeof fetch;
  const input: DraftRequest = { conversation: 'Sam: Saturday?', written: 'Sam: Saturday?', typed: '' };
  try {
    expect((await chatgptWriter.write({ ...input, nodes: [{ text: 'Skip', left: 0, top: 30, bottom: 40, clickable: true }] })).drafts[0]).toBe('Yes.');
    expect((await chatgptWriter.write(input)).drafts[0]).toBe('Yes.\nSkip');
  } finally { global.fetch = originalFetch; }
});

test('reply on X sends the X slots and cap; polish on LinkedIn sends the hook rule', async () => {
  const originalFetch = global.fetch;
  const bodies: string[] = [];
  try {
    global.fetch = jest.fn(async (_url, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { input: { content: { text: string }[] }[] };
      bodies.push(payload.input[0].content[0].text);
      return { ok: true, body: body(`${event({ type: 'response.output_text.delta', delta: '{"drafts":["Nice, offline-first is the right call","SQLite on a phone? good luck with that","What made you skip accounts?"]}' })}\n\n${event({ type: 'response.completed' })}`) } as unknown as Response;
    }) as unknown as typeof fetch;
    const x = platformForApp('com.twitter.android');
    const reply = await chatgptWriter.write({ conversation: 'Maya: shipped our offline-first notes app', written: 'Maya: shipped our offline-first notes app', typed: '', platform: x });
    expect(reply.drafts.length).toBe(3);
    expect(bodies.at(-1)).toContain('On X: each draft fits one post (280).');
    expect(bodies.at(-1)).toContain('Ask one sharp question about the post.');

    global.fetch = jest.fn(async (_url, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { input: { content: { text: string }[] }[] };
      bodies.push(payload.input[0].content[0].text);
      return { ok: true, body: body(`${event({ type: 'response.output_text.delta', delta: '{"versions":["a","b","c"]}' })}\n\n${event({ type: 'response.completed' })}`) } as unknown as Response;
    }) as unknown as typeof fetch;
    await chatgptWriter.write({ conversation: 'screen', written: 'screen', typed: 'started my consultancy today', platform: platformForApp('com.linkedin.android') });
    expect(bodies.at(-1)).toContain('keep paragraphs short');
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

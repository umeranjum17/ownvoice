jest.mock('../../core/speller', () => {
  const fs = require('fs');
  const path = require('path');
  const nspell = require('nspell');
  const dictionary = path.resolve(__dirname, '../../../assets/dictionary');
  const spell = nspell(fs.readFileSync(`${dictionary}/en-affixes.aff`, 'utf8'), fs.readFileSync(`${dictionary}/en-words.dic`, 'utf8'));
  return { speller: async () => spell };
});
jest.mock('../accounts', () => {
  const actual = jest.requireActual('../accounts');
  actual.accounts.runtime = jest.fn(async () => ({
    getAuth: async () => ({ auth: { apiKey: 'fixture-access' } }),
    readCredential: async () => ({ type: 'oauth', accountId: 'fixture-account' }),
  }));
  actual.accounts.failed = jest.fn(async (_member: string, _key: string, error: { kind: string; until: number }) => ({ kind: error.kind, until: error.until }));
  actual.accounts.respond = jest.fn(actual.accounts.respond.bind(actual.accounts));
  return { ...actual, codexAuth: jest.fn(async () => ({ access: 'fixture-access', accountId: 'fixture-account' })), reportFailure: jest.fn(async () => ({})) };
});
jest.mock('expo/fetch', () => ({ fetch: (...args: Parameters<typeof fetch>) => global.fetch(...args) }));
import { chatgptWriter, streamResponses, streamSelectionRewrite } from '../responses';
import { platformForApp } from '../../core/platforms';
import { accounts, codexAuth, reportFailure } from '../accounts';
import { words } from '../../core/words';
import type { DraftRequest } from '../../core/writers';

const event = (item: object) => `data: ${JSON.stringify(item)}`;
const body = (...chunks: string[]) => new ReadableStream<Uint8Array>({ start(controller) {
  for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
  controller.close();
} });
const fetcher = (stream: ReadableStream<Uint8Array>) => jest.fn(async () => ({ ok: true, body: stream } as Response));
const reported = reportFailure as jest.Mock;
beforeEach(() => { jest.clearAllMocks(); });

test('accepts CRLF events split across chunks and a final unterminated completion', async () => {
  const first = event({ type: 'response.output_text.delta', delta: '{"versions":[' });
  const second = event({ type: 'response.output_text.delta', delta: '"A","B","C"]}' });
  const complete = event({ type: 'response.completed' });
  const fetch = fetcher(body(first + '\r', '\n\r\n' + second + '\r\n\r\n' + event({ type: 'response.output_text.done', text: '{"versions":["A","B","C"]}' }) + '\r\n\r\n' + complete));
  const deltas: string[] = [];
  await expect(streamResponses('C2 prompt', text => deltas.push(text), fetch)).resolves.toEqual(['A', 'B', 'C']);
  expect(deltas).toEqual(['{"versions":[', '"A","B","C"]}']);
  expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ authorization: 'Bearer fixture-access', 'content-type': 'application/json', 'chatgpt-account-id': 'fixture-account', originator: 'ownvoice', 'OpenAI-Beta': 'responses=experimental', accept: 'text/event-stream' }) }));
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
  ['wrong envelope', event({ type: 'response.output_text.delta', delta: '{"drafts":["A","B","C"]}' }) + '\n\n' + event({ type: 'response.completed' })],
  ['missing completion', event({ type: 'response.output_text.delta', delta: '{"versions":["A","B","C"]}' }) + '\n\n'],
  ['truncated JSON', event({ type: 'response.output_text.delta', delta: '{"versions":["A","B","C"' }) + '\n\n' + event({ type: 'response.completed' })],
  ['partial drafts', event({ type: 'response.output_text.delta', delta: '{"versions":["one"]}' }) + '\n\n' + event({ type: 'response.completed' })],
])('rejects %s', async (_label, stream) => {
  const originalFetch = global.fetch;
  global.fetch = fetcher(body(stream));
  try {
    await expect(chatgptWriter.write({ conversation: '', written: '', typed: 'hello' })).rejects.toThrow(words.chatgptFailed);
  } finally { global.fetch = originalFetch; }
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
    if (status === 400) expect(reported).toHaveBeenCalledWith(message);
    else { expect(reported).not.toHaveBeenCalled(); expect(accounts.failed).toHaveBeenCalledTimes(1); }
  } finally { global.fetch = originalFetch; }
});

test('streamed account refusal is reported and polish slots are not retried', async () => {
  const originalFetch = global.fetch;
  const fetch = fetcher(body(`${event({ type: 'response.failed', response: { error: { message: 'Rate limit: try again in 3 min' } } })}\n\n`));
  global.fetch = fetch;
  try {
    await expect(chatgptWriter.write({ conversation: '', written: '', typed: 'hello' })).rejects.toThrow(words.chatgptFailed);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(reported).not.toHaveBeenCalled();
    expect(accounts.failed).toHaveBeenCalledTimes(1);
  } finally { global.fetch = originalFetch; }
});

const retryCases: Array<[DraftRequest, object]> = [
  [{ conversation: 'Sam: See you?', written: 'Sam: See you?', typed: '' }, { drafts: ['No thanks', 'No thanks', 'No thanks'] }],
  [{ conversation: '', written: '', typed: 'line one\nline two\nline three' }, { versions: ['Changed', 'Better'] }],
];
test.each(retryCases)('account failure during a slot retry stops further requests', async (request, initial) => {
  const originalFetch = global.fetch;
  const fetch = jest.fn().mockResolvedValueOnce({ ok: true, body: body(`${event({ type: 'response.output_text.delta', delta: JSON.stringify(initial) })}\n\n${event({ type: 'response.completed' })}`) })
    .mockResolvedValue({ ok: false, status: 429, text: async () => 'Too many requests', body: null });
  global.fetch = fetch;
  try {
    await expect(chatgptWriter.write(request)).rejects.toThrow(words.chatgptFailed);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(reported).not.toHaveBeenCalled();
    expect(accounts.failed).toHaveBeenCalledTimes(1);
  } finally { global.fetch = originalFetch; }
});

test('authentication and pre-send rejection never mark a tap', async () => {
  const originalFetch = global.fetch;
  const fetch = jest.fn();
  global.fetch = fetch;
  const sent = jest.fn();
  try {
    (codexAuth as jest.Mock).mockRejectedValueOnce(new Error('no account'));
    await expect(chatgptWriter.write({ conversation: 'chat', written: 'chat', typed: '' }, { sent })).rejects.toThrow(words.phoneWrote);
    await expect(chatgptWriter.write({ conversation: 'chat', written: 'chat', typed: '' }, { sent, beforeSend: async () => false })).rejects.toThrow(words.phoneWrote);
    expect(fetch).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test('a fetch failing before any answer leaves the tap unmarked', async () => {
  const originalFetch = global.fetch;
  const sent = jest.fn();
  const unsent = jest.fn();
  const fetch = jest.fn(async () => { throw new Error('offline'); });
  global.fetch = fetch;
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
    expect(accounts.failed).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('kind=rate_limit'));
  } finally { global.fetch = originalFetch; log.mockRestore(); }
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
  const fetch = jest.fn();
  global.fetch = fetch;
  const beforeSend = jest.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
  const sent = jest.fn();
  const unsent = jest.fn(async () => {});
  try {
    await expect(chatgptWriter.write({ conversation: 'chat', written: 'chat', typed: '' }, { beforeSend, sent, unsent })).rejects.toThrow(words.phoneWrote);
    expect(beforeSend).toHaveBeenCalledTimes(2);
    expect(sent).not.toHaveBeenCalled();
    expect(unsent).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test('the synchronous last gate vetoes before anything is marked', async () => {
  const originalFetch = global.fetch;
  const fetch = jest.fn();
  global.fetch = fetch;
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
    expect(fetch).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test('a failed send mark after dispatch surfaces the failure', async () => {
  const originalFetch = global.fetch;
  const fetch = fetcher(body(`${event({ type: 'response.output_text.delta', delta: JSON.stringify({ drafts: ['A', 'B', 'C'] }) })}\n\n${event({ type: 'response.completed' })}`));
  global.fetch = fetch;
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
  const fetch = fetcher(body(`${event({ type: 'response.output_text.delta', delta: JSON.stringify({ drafts: ['No thanks', 'No thanks', 'No thanks'] }) })}\n\n${event({ type: 'response.completed' })}`));
  global.fetch = fetch;
  const beforeSend = jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValue(false);
  const sent = jest.fn();
  const unsent = jest.fn();
  try {
    await expect(chatgptWriter.write({ conversation: 'Sam: See you?', written: 'Sam: See you?', typed: '' }, { beforeSend, sent, unsent })).rejects.toThrow(words.phoneWrote);
    expect(beforeSend).toHaveBeenCalledTimes(3);
    expect(sent).toHaveBeenCalledTimes(1);
    // The later request is vetoed at its first check, before a second mark.
    expect(unsent).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally { global.fetch = originalFetch; }
});

test('reply cleanup uses only control labels in the capture', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn(async () => ({ ok: true, body: body(`${event({ type: 'response.output_text.delta', delta: '{"drafts":["Yes.\\nSkip","No.","Maybe."]}' })}\n\n${event({ type: 'response.completed' })}`) } as Response));
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
      return { ok: true, body: body(`${event({ type: 'response.output_text.delta', delta: '{"versions":["a","b"]}' })}\n\n${event({ type: 'response.completed' })}`) } as unknown as Response;
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
      return { ok: true, body: body(`${event({ type: 'response.output_text.delta', delta: '{"versions":["a","b"]}' })}\n\n${event({ type: 'response.completed' })}`) } as unknown as Response;
    }) as unknown as typeof fetch;
    const polish = await chatgptWriter.write({ conversation: 'chat on screen', written: 'chat on screen', typed: 'i can bring the stove' });
    expect(polish.drafts).toEqual(['a', 'b']);
    expect(bodies.at(-1)).toContain('Return the requested rewrite versions as JSON.');
    expect(bodies.at(-1)).toContain('Return 2 versions');
    expect(bodies.at(-1)).not.toContain('Light touch:');
    expect(bodies.at(-1)).toContain('Their text:\ni can bring the stove');
    expect(bodies.at(-1)).toContain('Screen (context only):\nchat on screen');
    expect(bodies.at(-1)).not.toContain('Latest message:');
  } finally { global.fetch = originalFetch; }
});


test.each([
  ['empty HTTP 200', ''],
  ['completion without text', event({ type: 'response.completed', response: { output: [] } })],
  ['malformed data', 'data: {broken}\n\n'],
])('%s surfaces a plain failure without landing a blank card', async (_label, stream) => {
  const originalFetch = global.fetch;
  global.fetch = fetcher(body(stream));
  const sent = jest.fn();
  const landed = jest.fn();
  try {
    await expect(chatgptWriter.write({ conversation: 'Sam: hi', written: 'Sam: hi', typed: '' }, { sent, landed })).rejects.toThrow(words.chatgptFailed);
    expect(sent).toHaveBeenCalledTimes(1);
    expect(landed).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test('streamed drafts win over a conflicting completed envelope', async () => {
  const originalFetch = global.fetch;
  global.fetch = fetcher(body(event({ type: 'response.output_text.delta', delta: '{"versions":["A","B","C"]}' }) + '\n\n' + event({ type: 'response.completed', response: { output: [{ type: 'message', content: [{ type: 'output_text', text: '{"versions":["wrong"]}' }] }] } })));
  try { await expect(streamResponses('polish')).resolves.toEqual(['A', 'B', 'C']); }
  finally { global.fetch = originalFetch; }
});

test('drafts require JSON while the selection rewrite stays plain text', async () => {
  const originalFetch = global.fetch;
  const fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, body: body(event({ type: 'response.output_text.delta', delta: '{"versions":["A","B","C"]}' }) + '\n\n' + event({ type: 'response.completed' })) })
    .mockResolvedValueOnce({ ok: true, body: body(event({ type: 'response.output_text.delta', delta: 'Tuesday works.' }) + '\n\n' + event({ type: 'response.completed' })) });
  global.fetch = fetch;
  try {
    await streamResponses('polish');
    await expect(streamSelectionRewrite('I think Tuesday works.', 'Shorter', '')).resolves.toBe('Tuesday works.');
    expect(JSON.parse(fetch.mock.calls[0][1].body).text).toEqual({ verbosity: 'low', format: { type: 'json_object' } });
    expect(JSON.parse(fetch.mock.calls[1][1].body).text).toEqual({ verbosity: 'low' });
    expect(accounts.respond).toHaveBeenCalledTimes(2);
  } finally { global.fetch = originalFetch; }
});

test('selection rewrite rejects an empty answered stream', async () => {
  const originalFetch = global.fetch;
  global.fetch = fetcher(body(event({ type: 'response.completed' })));
  const sent = jest.fn();
  try {
    await expect(streamSelectionRewrite('Tuesday works.', 'Shorter', '', { sent })).rejects.toThrow();
    expect(sent).toHaveBeenCalledTimes(1);
  } finally { global.fetch = originalFetch; }
});

test('incomplete selection text fails plainly and keeps the transmitted read marked', async () => {
  const originalFetch = global.fetch;
  global.fetch = fetcher(body(
    event({ type: 'response.output_text.delta', delta: 'Meet Saturday' }) + '\n\n',
    event({ type: 'response.incomplete', response: { incomplete_details: { reason: 'max_output_tokens' } } }),
  ));
  const sent = jest.fn();
  const unsent = jest.fn();
  try {
    await expect(streamSelectionRewrite('Can we meet on Saturday afternoon?', 'Shorter', '', { sent, unsent })).rejects.toThrow(words.chatgptFailed);
    expect(sent).toHaveBeenCalledTimes(1);
    expect(unsent).not.toHaveBeenCalled();
    expect(accounts.failed).not.toHaveBeenCalled();
    expect(reported).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test.each([
  ['versions', { versions: ['A', 'B', 'C'] }],
  ['replies', { drafts: ['Yes please', 'No thanks', 'What time?'] }],
])('incomplete %s never land drafts even when the JSON is valid', async (mode, partial) => {
  const originalFetch = global.fetch;
  global.fetch = fetcher(body(
    event({ type: 'response.output_text.delta', delta: JSON.stringify(partial) }) + '\n\n',
    event({ type: 'response.incomplete', response: { incomplete_details: { reason: 'max_output_tokens' } } }),
  ));
  const landed = jest.fn();
  try {
    const request = { conversation: 'Sam: Saturday?', written: 'Sam: Saturday?', typed: mode === 'versions' ? 'hello' : '' };
    await expect(chatgptWriter.write(request, { landed })).rejects.toThrow(words.chatgptFailed);
    expect(landed).not.toHaveBeenCalled();
    expect(accounts.failed).not.toHaveBeenCalled();
    if (mode === 'versions') {
      await expect(streamResponses('polish', undefined, fetcher(body(
        event({ type: 'response.output_text.delta', delta: JSON.stringify(partial) }) + '\n\n' + event({ type: 'response.incomplete' }),
      )))).rejects.toThrow(words.chatgptFailed);
    }
  } finally { global.fetch = originalFetch; }
});

test.each(retryCases)('incomplete slot retries never land partial output', async (request, initial) => {
  const originalFetch = global.fetch;
  const partial = request.typed ? 'Row 1: Changed\nRow 2: Better\nRow 3: Different' : '{"drafts":["Yes please"]}';
  global.fetch = jest.fn().mockResolvedValueOnce({ ok: true, body: body(
    event({ type: 'response.output_text.delta', delta: JSON.stringify(initial) }) + '\n\n' + event({ type: 'response.completed' }),
  ) }).mockImplementation(async () => ({ ok: true, body: body(
    event({ type: 'response.output_text.delta', delta: partial }) + '\n\n' + event({ type: 'response.incomplete' }),
  ) }));
  const landed = jest.fn();
  try {
    const result = await chatgptWriter.write(request, { landed });
    expect(result.drafts).toEqual(request.typed ? [] : ['No thanks']);
    expect(landed).toHaveBeenCalledTimes(request.typed ? 0 : 1);
    expect(accounts.failed).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test('consent withdrawn during the kits credential wait prevents dispatch and send marking', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn();
  let release!: () => void;
  let began!: () => void;
  const waiting = new Promise<void>(resolve => { began = resolve; });
  (accounts.runtime as jest.Mock).mockImplementationOnce(async () => ({
    getAuth: async () => { began(); await new Promise<void>(resolve => { release = resolve; }); return { auth: { apiKey: 'fixture-access' } }; },
    readCredential: async () => ({ type: 'oauth', accountId: 'fixture-account' }),
  }));
  let allowed = true;
  const sent = jest.fn();
  try {
    const writing = chatgptWriter.write({ conversation: 'Sam: hi', written: 'Sam: hi', typed: '' }, { beforeSend: async () => allowed, beforeFetch: () => allowed, sent });
    await waiting;
    allowed = false;
    release();
    await expect(writing).rejects.toThrow(words.phoneWrote);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

test('concurrent calls keep independent consent checks and send marks', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn(async () => ({ ok: true, body: body(event({ type: 'response.output_text.delta', delta: 'Tuesday works.' }) + '\n\n' + event({ type: 'response.completed' })) } as Response));
  let release!: () => void;
  let began!: () => void;
  const waiting = new Promise<void>(resolve => { began = resolve; });
  (accounts.runtime as jest.Mock).mockImplementationOnce(async () => ({
    getAuth: async () => { began(); await new Promise<void>(resolve => { release = resolve; }); return { auth: { apiKey: 'fixture-access' } }; },
    readCredential: async () => ({ type: 'oauth', accountId: 'fixture-account' }),
  }));
  let allowed = true;
  const blockedSent = jest.fn();
  const sent = jest.fn();
  try {
    const blocked = streamSelectionRewrite('I think Tuesday works.', 'Shorter', '', { beforeFetch: () => allowed, sent: blockedSent });
    const rejected = expect(blocked).rejects.toThrow(words.phoneWrote);
    await waiting;
    allowed = false;
    await expect(streamSelectionRewrite('I think Tuesday works.', 'Shorter', '', { beforeFetch: () => true, sent })).resolves.toBe('Tuesday works.');
    release();
    await rejected;
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(sent).toHaveBeenCalledTimes(1);
    expect(blockedSent).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});


test('reply retries accept the requested one-slot JSON array', async () => {
  const originalFetch = global.fetch;
  const response = (drafts: string[]) => ({ ok: true, body: body(event({ type: 'response.output_text.delta', delta: JSON.stringify({ drafts }) }) + '\n\n' + event({ type: 'response.completed' })) });
  global.fetch = jest.fn().mockResolvedValueOnce(response(['No thanks', 'No thanks', 'No thanks']))
    .mockResolvedValueOnce(response(['Yes please']))
    .mockResolvedValueOnce(response(['What time?']));
  try {
    await expect(chatgptWriter.write({ conversation: 'Sam: Saturday?', written: 'Sam: Saturday?', typed: '' })).resolves.toEqual({ drafts: ['No thanks', 'Yes please', 'What time?'] });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  } finally { global.fetch = originalFetch; }
});

test.each([
  ['Its a good plan.', "It's a good plan.", "It's a good plan."],
  ['Its a plan. We shoud go.', "It's a plan. We should go.", "It's a plan. We shoud go."],
  ['Keep your right hand warm. I shoud leave.', 'Keep your right hand warm. I should leave.'],
  ['We shoud shoud go.', 'We should should go.'],
  ['Meet by teh the evening.', 'Meet by the evening.'],
  ['Meet by the The the evening.', 'Meet by the evening.'],
  ['Its a good plan, I shoud be there by the the evening.', "It's a good plan, I should be there by the evening."],
  ['Its a good plan, I shoud be there by the the evening.', "It's a good plan, I should be there by the evening.", "It's a good plan, I shoud be there by the the evening."],
  ['Its a good plan, Umer shoud be there by the the evening.', "It's a good plan, Umer should be there by the evening."],
  ['I shoud call at noon and leave at midnight.', 'I should call at noon and leave at midnight.', 'I should call at midnight and leave at noon.'],
  ['I shoud visit Bora Bora with @will.', 'I should visit Bora Bora with @will.', 'I should visit Bora with @bill.'],
])('ChatGPT Cleaned up uses the local fixes: %s', async (typed, expected, answer = typed) => {
  const originalFetch = global.fetch;
  const landed = jest.fn();
  global.fetch = fetcher(body(`${event({ type: 'response.output_text.delta', delta: JSON.stringify({ versions: [answer, typed] }) })}\n\n${event({ type: 'response.completed' })}`));
  try {
    const result = await chatgptWriter.write({ typed, conversation: '', written: '' }, { landed });
    expect(result.drafts).toContain(expected);
    expect(landed).toHaveBeenCalledWith(expected, 0, 'Cleaned up');
    expect(result.unchanged).toBe(false);
  } finally { global.fetch = originalFetch; }
});

test.each(['Its own engine', 'Bring woud for the fire.', 'We should visit Bora Bora.', "Give Ben Ben's keys.", 'Hey @will will you join us?'])('ChatGPT cleanup preserves %s', async typed => {
  const originalFetch = global.fetch;
  const landed = jest.fn();
  global.fetch = fetcher(body(`${event({ type: 'response.output_text.delta', delta: JSON.stringify({ versions: [typed, typed] }) })}\n\n${event({ type: 'response.completed' })}`));
  try {
    const result = await chatgptWriter.write({ typed, conversation: '', written: '' }, { landed });
    expect(result).toEqual({ drafts: [], unchanged: true });
    expect(landed).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});

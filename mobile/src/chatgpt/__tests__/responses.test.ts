jest.mock('../accounts', () => ({ codexAuth: async () => ({ access: 'fixture-access', accountId: 'fixture-account' }) }));
jest.mock('expo/fetch', () => ({ fetch: (...args: Parameters<typeof fetch>) => global.fetch(...args) }));
import { chatgptWriter, streamResponses } from '../responses';
import { words } from '../../core/words';
import { readDraftStream } from '../../core/responses-stream';

const event = (item: object) => `data: ${JSON.stringify(item)}`;
const body = (...chunks: string[]) => new ReadableStream<Uint8Array>({ start(controller) {
  for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
  controller.close();
} });
const fetcher = (stream: ReadableStream<Uint8Array>) => jest.fn(async () => ({ ok: true, body: stream } as Response));

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
  global.fetch = jest.fn(async () => ({ ok: false, status: 500, body: null } as unknown as Response));
  try {
    await expect(chatgptWriter.write({ conversation: '', written: 'hi', typed: '' })).rejects.toThrow(words.chatgptFailed);
    await expect(chatgptWriter.write({ conversation: '', written: 'hi', typed: '' })).rejects.toThrow(/ChatGPT didn't answer this time\./);
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
    const reply = await chatgptWriter.write({ conversation: 'Sam: Are we still on for Saturday? I can bring the tent if you bring the stove.', written: 'Sam: Are we still on for Saturday? I can bring the tent if you bring the stove.', nodes: [{ text: 'Sam: Are we still on for Saturday? I can bring the tent if you bring the stove.', top: 10, bottom: 30, clickable: false }], fieldTop: 50, typed: '' });
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

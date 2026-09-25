jest.mock('../accounts', () => ({ codexAuth: async () => ({ access: 'fixture-access', accountId: 'fixture-account' }) }));
jest.mock('expo/fetch', () => ({ fetch: (...args: Parameters<typeof fetch>) => global.fetch(...args) }));
import { chatgptWriter, streamResponses } from '../responses';

test('streams Responses deltas through the injected fetch', async () => {
  const body = new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'response.output_text.delta', delta: '{"versions":[' })}\n\ndata: ${JSON.stringify({ type: 'response.output_text.delta', delta: '"A","B","C"]}' })}\n\ndata: ${JSON.stringify({ type: 'response.output_text.done', text: '{"versions":["A","B","C"]}' })}\n\ndata: [DONE]\n\n`));
    controller.close();
  } });
  const fetcher = jest.fn(async () => ({ ok: true, body } as Response));
  const deltas: string[] = [];
  await expect(streamResponses('C2 prompt', text => deltas.push(text), fetcher)).resolves.toBe('{"versions":["A","B","C"]}');
  expect(deltas).toEqual(['{"versions":[', '"A","B","C"]}']);
  expect(fetcher).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer fixture-access', 'Content-Type': 'application/json', 'chatgpt-account-id': 'fixture-account', originator: 'ownvoice', 'OpenAI-Beta': 'responses=experimental', accept: 'text/event-stream' } }));
});

test('rejects incomplete primary drafts', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn(async () => ({ ok: true, body: new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify({ type: 'response.output_text.delta', delta: '{"versions":["one"]}' }) + '\n\n'));
    controller.close();
  } }) } as Response));
  try {
    await expect(chatgptWriter.write({ conversation: '', written: 'hi', typed: '' })).rejects.toThrow('ChatGPT could not answer.');
  } finally { global.fetch = originalFetch; }
});

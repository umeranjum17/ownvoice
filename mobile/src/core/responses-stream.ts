export async function readDraftStream(body: ReadableStream<Uint8Array>, onText?: (text: string) => void): Promise<string[]> {
  const reader = body.getReader(), decoder = new TextDecoder();
  let pending = '', text = '', completed = false;
  const consume = (event: string) => {
    const data = event.split(/\r\n|\r|\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    const item = JSON.parse(data);
    if (item.type === 'response.failed' || item.type === 'response.incomplete') throw new Error('ChatGPT could not answer.');
    if (item.type === 'response.completed') completed = true;
    if (item.type === 'response.output_text.delta' && typeof item.delta === 'string') {
      text += item.delta;
      onText?.(item.delta);
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    const events = pending.split(/(?:\r\n|\r|\n){2}/);
    pending = events.pop() ?? '';
    for (const event of events) consume(event);
    if (done) break;
  }
  if (pending.trim()) consume(pending);
  if (!completed) throw new Error('ChatGPT could not answer.');
  let drafts: unknown;
  try { drafts = JSON.parse(text).versions; } catch { throw new Error('ChatGPT could not answer.'); }
  if (!Array.isArray(drafts) || drafts.length !== 3 || drafts.some(draft => typeof draft !== 'string' || !draft.trim())) throw new Error('ChatGPT could not answer.');
  return drafts;
}

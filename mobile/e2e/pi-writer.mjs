// The real writer route for the F6a reply proof, served to the emulator as an OpenAI-compatible
// endpoint: DeepSeek Flash through @byokit/decide's pi backend, with Haiku as the fallback the kit
// falls to when DeepSeek's process fails or times out. No subscription sign-in and no provider key
// of the app's own: the installed pi answers with its own keys, the same way the app's phone writer
// answers with its own model. The app talks to it through its own OpenRouter key route, pointed at
// this host by an emulator-only build flag (EXPO_PUBLIC_E2E_OPENROUTER_BASE), so the panel, writer
// boundary, label renderer and insert path are the app's real ones; only the model call is here.
// Usage: node e2e/pi-writer.mjs serve <port> <log-file>   (bound on 0.0.0.0, device at 10.0.2.2)
// Env: PI_BIN (default: `pi` on PATH), PI_MODEL (default deepseek/deepseek-flash),
// PI_FALLBACK_MODEL (default haiku), PI_TIMEOUT_MS (default 120000).
import { createServer } from 'node:http';
import { appendFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pi } from '@byokit/decide/pi';

const [mode, portArg, logPath] = process.argv.slice(2);
if (mode !== 'serve' || !portArg) throw new Error('Usage: node e2e/pi-writer.mjs serve <port> <log-file>');
const bin = process.env.PI_BIN || execFileSync('which', ['pi'], { encoding: 'utf8' }).trim();
const model = process.env.PI_MODEL || 'deepseek/deepseek-flash';
const fallback = process.env.PI_FALLBACK_MODEL || 'haiku';
const timeoutMs = Number(process.env.PI_TIMEOUT_MS ?? 120000);
const port = Number(portArg);
const log = line => { if (logPath) appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`); };
// The app asks for its own JSON (drafts, versions or a one-word answer) and has no response_format to
// lean on, so the model's whole answer travels in one object field. The schema stays open: a model that
// answers `{"drafts":[...]}` directly is passed through unchanged instead of failing validation.
const ANSWER = { type: 'object' };
const backends = [pi({ bin, model, timeoutMs }), pi({ bin, model: fallback, timeoutMs })];

/** The app's wire message list as one system line and one prompt; the kit's own backends take both. */
const textOf = content => Array.isArray(content)
  ? content.filter(part => part?.type === 'text').map(part => part.text).join('\n')
  : String(content ?? '');
const parts = messages => {
  const system = messages.filter(m => m.role === 'system').map(m => textOf(m.content)).join('\n\n');
  const prompt = messages.filter(m => m.role !== 'system').map(m => textOf(m.content)).join('\n\n');
  return { system: [system, 'Answer with one JSON object. Put the complete answer, exactly as the request asks for it, in that object\'s `text` field as a string: when the request asks for JSON, the JSON text goes inside `text`.'].filter(Boolean).join('\n\n'), prompt };
};

/** The model's answer as the app's own wire text: its `text` field when it obeyed, else the object it sent. */
const contentOf = data => (typeof data?.text === 'string' ? data.text : JSON.stringify(data));

const answer = async (body, signal) => {
  const { system, prompt } = parts(Array.isArray(body.messages) ? body.messages : []);
  if (!prompt) throw new Error('no prompt');
  // Each ask is a fresh pi run, so a shown card is a real model answer, never a cache hit. A malformed
  // answer is asked once more (models wrap JSON now and then); only then does the fallback take over.
  const once = async (backend, name) => {
    for (let attempt = 1; ; attempt++) {
      const started = Date.now();
      try {
        const out = await backend.generate({ system, prompt, schema: ANSWER, maxOutputTokens: 8192, signal });
        const text = contentOf(out.data);
        if (!text || !text.trim()) throw new Error('no answer');
        log(`answered model=${name} chars=${text.length} ms=${Date.now() - started} attempt=${attempt}`);
        log(`answer: ${JSON.stringify(text).slice(0, 500)}`);
        return text;
      } catch (error) {
        if (attempt >= 2 || signal?.aborted) throw error;
        log(`${name} attempt ${attempt} failed (${String(error?.message ?? error).slice(0, 120)}); asking once more`);
      }
    }
  };
  try {
    return await once(backends[0], model);
  } catch (error) {
    log(`primary ${model} failed (${String(error?.message ?? error).slice(0, 120)}); falling back to ${fallback}`);
    return once(backends[1], fallback);
  }
};

const sse = (res, text, id) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  const chunk = (delta, finish = null) => res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
  chunk({ role: 'assistant', content: '' });
  // Big answers land in a few pieces so the app's own streamed-card path runs as it does in the field.
  for (let at = 0; at < text.length; at += 400) chunk({ content: text.slice(at, at + 400) });
  chunk({}, 'stop');
  res.write('data: [DONE]\n\n');
  res.end();
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://host');
  const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  try {
    if (req.method === 'GET' && /\/models$/.test(url.pathname)) return send(200, { data: [{ id: 'deepseek/deepseek-v4.1-flash', object: 'model' }] });
    if (req.method === 'GET' && /\/key$/.test(url.pathname)) return send(200, { data: { label: 'stand-in', limit: null, usage: 0 } });
    if (req.method !== 'POST' || !/\/chat\/completions$/.test(url.pathname)) return send(404, { error: { message: 'not found' } });
    let raw = '';
    for await (const piece of req) raw += piece;
    const body = JSON.parse(raw || '{}');
    const abort = new AbortController();
    req.on('close', () => abort.abort());
    log(`ask model=${body.model} stream=${!!body.stream} json=${body.response_format?.type ?? 'text'} messages=${body.messages?.length ?? 0} keys=${Object.keys(body).join(',')}`);
    log(`prompt: ${JSON.stringify(body.messages?.[body.messages.length - 1]?.content ?? '').slice(0, 400)}`);
    const text = await answer(body, abort.signal);
    if (body.stream) return sse(res, text, `pi-${Date.now()}`);
    return send(200, { id: `pi-${Date.now()}`, object: 'chat.completion', model, choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }] });
  } catch (error) {
    const message = String(error?.message ?? error).slice(0, 200);
    log(`failed: ${message}`);
    send(502, { error: { message } });
  }
}).listen(port, '0.0.0.0', () => {
  if (logPath) writeFileSync(logPath, '');
  log(`pi writer on 0.0.0.0:${port} bin=${bin} model=${model} fallback=${fallback}`);
  console.log(`pi writer on 0.0.0.0:${port} (device at 10.0.2.2:${port}) model=${model} fallback=${fallback}`);
});

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAX_INPUT = 64_000;
const MAX_INSTRUCTIONS = 64_000;

// One run of the user's own Claude, tool-free, in an empty folder, so a hostile post on screen can't make it read a file.
export function write({ instructions, input: text }, { claude, timeoutMs = 90_000 }) {
  if (typeof instructions !== 'string' || typeof text !== 'string' || text.length > MAX_INPUT || instructions.length > MAX_INSTRUCTIONS) throw new Error('Bad request.');
  const cwd = mkdtempSync(join(tmpdir(), 'ownvoice-link-'));
  return new Promise((done, fail) => {
    const run = spawn(claude, ['-p', '--model', 'sonnet', '--safe-mode', '--tools', '', '--no-session-persistence', '--strict-mcp-config', '--system-prompt', instructions], { cwd, env: { ...process.env, MAX_THINKING_TOKENS: '0' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => run.kill(), timeoutMs);
    run.stdin.on('error', () => {});
    run.stdout.setEncoding('utf8');
    run.stdout.on('data', (chunk) => { out += chunk; });
    const finish = () => { clearTimeout(timer); rmSync(cwd, { recursive: true, force: true }); };
    run.on('error', (error) => { finish(); fail(error); });
    run.on('close', (code) => { finish(); code === 0 && out.trim() ? done({ text: out.trim().replace(/^```(?:json)?\s*|\s*```$/g, '') }) : fail(new Error('Claude did not answer.')); });
    run.stdin.end(`Screen:\n${text}`);
  });
}

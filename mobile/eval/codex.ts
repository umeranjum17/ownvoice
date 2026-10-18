import { spawn } from 'node:child_process';

export function codexAnswer(prompt: string, maxTokens: number, binary = process.env.CODEX_BIN ?? 'codex'): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ['exec', '--ephemeral', '--color', 'never', '--model', 'gpt-6-luna', '--skip-git-repo-check', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => code === 0
      ? resolve(stdout.trim())
      : reject(new Error(`codex exec failed (${code}): ${stderr.trim() || stdout.trim()}`)));
    child.stdin.end(`Answer the following writing request directly. Keep the response within ${maxTokens} tokens.\n\n${prompt}`);
  });
}

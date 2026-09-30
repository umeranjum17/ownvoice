// Release only the engine, from merged main. CI authenticates through npm OIDC.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const registry = 'https://registry.npmjs.org';
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message ?? `${command} failed: ${result.stderr ?? ''}`);
  }
  return result.stdout?.trim() ?? '';
}

function alreadyPublished(name, version) {
  const result = spawnSync('npm', ['view', `${name}@${version}`, 'version', '--json', '--registry', registry], { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status === 0) return JSON.parse(result.stdout) === version;
  // Only a registry 404 means absent. Authentication/network failures must fail closed.
  let error;
  try { error = JSON.parse(result.stdout).error; } catch { /* fail below */ }
  if (error?.code === 'E404') return false;
  throw new Error(`npm lookup failed: ${result.stderr}`);
}

try {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--dry-run')) throw new Error('usage: npm run release -- [--dry-run]');
  const dryRun = args.includes('--dry-run');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  if (pkg.name !== 'ownvoice-engine' || pkg.private) throw new Error('release only supports the public ownvoice-engine package');
  if (!dryRun) {
    if (run('git', ['status', '--porcelain'], { cwd: root })) throw new Error('publish refuses a dirty tree');
    run('git', ['fetch', 'origin', 'main'], { cwd: root });
    if (run('git', ['rev-parse', 'HEAD'], { cwd: root }) !== run('git', ['rev-parse', 'origin/main'], { cwd: root })) {
      throw new Error('publish refuses: HEAD != origin/main');
    }
  }
  run('npm', ['run', 'lint'], { stdio: 'inherit' });
  run('npm', ['run', 'typecheck'], { stdio: 'inherit' });
  run('npm', ['test'], { stdio: 'inherit' });
  run('npm', ['run', 'smoke:pack'], { stdio: 'inherit' });
  if (alreadyPublished(pkg.name, pkg.version)) {
    console.log(`${pkg.name}@${pkg.version} already on npm; skipping`);
  } else {
    const publish = ['publish', '--access', 'public', '--registry', registry];
    if (dryRun) publish.push('--dry-run');
    else if (process.env.GITHUB_ACTIONS === 'true') publish.push('--provenance');
    run('npm', publish, { stdio: 'inherit' });
  }
} catch (error) {
  console.error(`release: ${error.message}`);
  process.exitCode = 1;
}

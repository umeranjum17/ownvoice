// Exercise the release CLI with offline npm/git executables.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function release(mode, args = []) {
  const dir = mkdtempSync(join(root, 'node_modules', '.release-test-'));
  const trace = join(dir, 'trace');
  try {
    for (const name of ['npm', 'git']) {
      const file = join(dir, name);
      writeFileSync(file, `#!${process.execPath}
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.OV_RELEASE_TRACE, JSON.stringify({name:'${name}',args})+'\\n');
const mode = process.env.OV_RELEASE_CASE;
if ('${name}' === 'git') {
  if (args[0] === 'status') console.log(mode === 'dirty' ? ' M changed' : '');
  if (args[0] === 'rev-parse') console.log(mode === 'unmerged' && args[1] === 'HEAD' ? 'feature' : 'main');
} else if (args[0] === 'view') {
  if (mode === 'published') console.log(JSON.stringify('0.1.0'));
  else { console.log(JSON.stringify({error:{code:mode === 'registry-error' ? 'E401' : 'E404'}})); process.exitCode = 1; }
}
`);
      chmodSync(file, 0o755);
    }
    const result = spawnSync(process.execPath, [join(root, 'scripts/release.mjs'), ...args], {
      encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, OV_RELEASE_TRACE: trace, OV_RELEASE_CASE: mode, GITHUB_ACTIONS: 'true' },
    });
    return { ...result, calls: readFileSync(trace, 'utf8').trim().split('\n').map(line => JSON.parse(line)) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('release skips a version already on npm', () => {
  const result = release('published');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.calls.some(call => call.name === 'npm' && call.args[0] === 'publish'));
});
test('release publishes absent versions with provenance after its gates', () => {
  const result = release('absent');
  assert.equal(result.status, 0, result.stderr);
  const npm = result.calls.filter(call => call.name === 'npm');
  assert.deepEqual(npm.slice(0, 4).map(call => call.args), [['run','lint'], ['run','typecheck'], ['test'], ['run','smoke:pack']]);
  assert.deepEqual(npm.at(-1).args, ['publish','--access','public','--registry','https://registry.npmjs.org','--provenance']);
});
test('release dry run passes --dry-run', () => {
  const result = release('absent', ['--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.calls.at(-1).args.includes('--dry-run'));
  assert.ok(!result.calls.some(call => call.name === 'git'));
});
for (const mode of ['registry-error', 'dirty', 'unmerged']) {
  test(`release refuses ${mode}`, () => {
    const result = release(mode);
    assert.equal(result.status, 1);
    assert.ok(!result.calls.some(call => call.name === 'npm' && call.args[0] === 'publish'));
  });
}

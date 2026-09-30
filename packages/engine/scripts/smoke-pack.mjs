// Exercise the tarball as an npm consumer, including declaration resolution.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const scratch = mkdtempSync(join(root, 'node_modules', '.pack-smoke-'));
const run = (command, args, cwd = scratch) => execFileSync(command, args, { cwd, encoding: 'utf8' });
try {
  const report = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', scratch], root));
  const packed = report[0];
  for (const file of ['dist/index.js', 'dist/index.d.ts', 'dist/cli.mjs', 'protocol/schema.json', 'LICENSE', 'README.md']) {
    assert.ok(packed.files.some(entry => entry.path === file), `tarball missing ${file}`);
  }
  const consumer = join(scratch, 'consumer');
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(scratch, packed.filename)], consumer);
  writeFileSync(join(consumer, 'check.mjs'), `
    import assert from 'node:assert/strict';
    import { Protocol } from 'ownvoice-engine';
    import { handle } from 'ownvoice-engine/protocol';
    assert.equal(Protocol.hello().protocol, 1);
    assert.deepEqual(handle({verb:'voice.parse', markdown:'**Never say:**\\n* synergy'}).rules.never, ['synergy']);
  `);
  run(process.execPath, ['--no-experimental-strip-types', 'check.mjs'], consumer);
  writeFileSync(join(consumer, 'check.ts'), `import { Protocol } from 'ownvoice-engine';\nimport { handle } from 'ownvoice-engine/protocol';\nconst value: number = Protocol.hello().protocol;\nhandle({verb:'hello'});\nvoid value;\n`);
  run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--module', 'NodeNext', '--target', 'ES2022', 'check.ts'], consumer);
  const bin = join(consumer, 'node_modules/.bin/ownvoice-engine');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.deepEqual(JSON.parse(run(bin, ['hello'], consumer)), { protocol: 1, version: pkg.version });
  assert.deepEqual(JSON.parse(run(bin, ['schema'], consumer)), JSON.parse(readFileSync(join(root, 'protocol/schema.json'), 'utf8')));
  console.log(`tarball consumer checks passed: ${pkg.name}@${pkg.version}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

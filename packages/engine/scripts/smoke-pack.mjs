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
    import { Protocol, Voice } from 'ownvoice-engine';
    import { handle } from 'ownvoice-engine/protocol';
    assert.equal(Protocol.hello().protocol, 2);
    const profile = handle({verb:'voice.parse', markdown:'## How I reply\\n- yep\\n- say more?\\n- tried it.'}).rules;
    assert.deepEqual(profile.samples, ['yep', 'say more?', 'tried it.']);
    const selected = Voice.selectedGuide(profile, false, 700);
    assert.deepEqual(selected.samples, ['yep', 'say more?', 'tried it.']);
    assert.deepEqual(handle({verb:'voice.guide', rules:profile}), {line:selected.line});
    assert.ok(selected.line.length <= 700);
    assert.equal(handle({verb:'voice.guide', rules:{samples:[1]}}).error.code, 'bad-request');
    assert.deepEqual(Voice.selectedGuide(profile, false, 0), {line:'', samples:[]});
    assert.deepEqual(handle({verb:'voice.parse', markdown:'**Never say:**\\n* synergy'}).rules.never, ['synergy']);
  `);
  run(process.execPath, ['--no-experimental-strip-types', 'check.mjs'], consumer);
  writeFileSync(join(consumer, 'check.ts'), `import { Protocol, Voice, Slop } from 'ownvoice-engine';\nimport { handle } from 'ownvoice-engine/protocol';\nconst value: number = Protocol.hello().protocol;\nhandle({verb:'hello'});\nconst oldRules: Slop.Rules = {never:[], noDashes:false, statementEndings:false, note:''};\nconst newRules: Slop.Rules = {...oldRules, samples:['yep', 'say more?']};\nconst selected: {line:string; samples:string[]} = Voice.selectedGuide(newRules, false, 700);\nvoid selected; void value;\n`);
  run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--module', 'NodeNext', '--target', 'ES2022', 'check.ts'], consumer);
  const bin = join(consumer, 'node_modules/.bin/ownvoice-engine');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.deepEqual(JSON.parse(run(bin, ['hello'], consumer)), { protocol: 2, version: pkg.version });
  const parsed = JSON.parse(execFileSync(bin, [], {cwd:consumer, encoding:'utf8', input:JSON.stringify({verb:'voice.parse', markdown:'## How I reply\n- yep\n- say more?'})}));
  assert.deepEqual(parsed.rules.samples, ['yep', 'say more?']);
  const guided = JSON.parse(execFileSync(bin, [], {cwd:consumer, encoding:'utf8', input:JSON.stringify({verb:'voice.guide', rules:parsed.rules})}));
  assert.ok(guided.line.includes(JSON.stringify(['yep', 'say more?'])));
  assert.deepEqual(JSON.parse(run(bin, ['schema'], consumer)), JSON.parse(readFileSync(join(root, 'protocol/schema.json'), 'utf8')));
  console.log(`tarball consumer checks passed: ${pkg.name}@${pkg.version}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

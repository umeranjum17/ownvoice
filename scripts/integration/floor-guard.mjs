#!/usr/bin/env node
// Real subprocess/Git-history journeys for the required floor, not mocked Git calls.
// node scripts/integration/floor-guard.mjs <task-owned scratch> <evidence-directory>
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const guard = resolve(dirname(fileURLToPath(import.meta.url)), '../floor-guard.mjs');
const [scratchArg, evidenceArg] = process.argv.slice(2);
assert(scratchArg && evidenceArg, 'Pass private scratch and evidence paths');
const scratch = resolve(scratchArg), evidence = resolve(evidenceArg);
mkdirSync(scratch, { recursive: true });
mkdirSync(evidence, { recursive: true });
const suite = 'mobile/Widget.test.mjs', journey = 'mobile/e2e/widget.mjs';
const caseLines = [
  "test('Widget mocked display', () => {",
  '  mocked.offered.mockReturnValue([Widget()]);',
  '  assert.equal(Widget(), 1);',
  '});',
];
const original = ["import { Widget } from './Widget.mjs';", ...caseLines,
  "test('retained Widget path', () => { assert.equal(Widget(), 1); });", ''].join('\n');
const retained = original.replace(caseLines.join('\n') + '\n', '');
const realJourney = "import { Widget } from '../Widget.mjs';\nif (Widget() !== 1) throw new Error('Widget journey failed');\n";
const results = [];
let cwd, base;
const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const put = (path, body) => { mkdirSync(dirname(resolve(cwd, path)), { recursive: true }); writeFileSync(resolve(cwd, path), body); };
const commit = (body) => { git('add', '.'); git('commit', '-qm', body); };
const setup = (name, source = original, journeyBody = realJourney) => {
  cwd = resolve(scratch, name);
  mkdirSync(cwd); // Never reuse or erase a caller's directory.
  git('init', '-q'); git('config', 'user.name', 'Umer'); git('config', 'user.email', 'fixture@example.invalid');
  put(suite, source); put('mobile/Widget.mjs', 'export const Widget = () => 1;\n'); put(journey, journeyBody);
  put('CONSTRAINTS.md', '| Coverage | minimum 80 |\n');
  commit('fixture: retained real journey and mocked legacy cases');
  base = git('rev-parse', 'HEAD');
  git('branch', 'main');
};
const record = () => ({ file: suite, baseBlob: git('rev-parse', base + ':' + suite), first: 2, last: 5,
  surface: 'Widget', reason: 'Retire this complete mocked display case; retained real journey is unchanged.',
  unproved: 'Separate native negative-proof task is unresolved.',
  journey: { path: journey, candidate: base, blob: git('rev-parse', base + ':' + journey),
    evidence: 'Synthetic fixture journey at this exact candidate/blob; no native proof claimed.', limit: 'Host fixture positive journey only.' } });
const message = 'test-diet fixture: retire exact mocked case\n\nJourney-Coverage: ' + journey + '\nTest-Diet-Retirement: diet/record.json';
const qualify = (name, expected, rule = '') => {
  const args = [guard, '--base', 'main'];
  const r = spawnSync(process.execPath, args, { cwd: resolve(cwd, 'mobile'), encoding: 'utf8' });
  assert.ifError(r.error);
  for (const [suffix, text] of [['stdout', r.stdout], ['stderr', r.stderr], ['exit', r.status + '\n'],
    ['command', `cd ${resolve(cwd, 'mobile')} && ${process.execPath} ${args.join(' ')}\n`]]) {
    writeFileSync(resolve(evidence, name + '.' + suffix), text);
  }
  results.push({ name, expected, actual: r.status, base, head: git('rev-parse', 'HEAD'), guard: execFileSync('git', ['hash-object', guard], { encoding: 'utf8' }).trim() });
  writeFileSync(resolve(evidence, 'bindings.json'), JSON.stringify(results, null, 2) + '\n');
  assert.equal(r.status, expected, `${name}: ${r.stderr}`);
  if (rule) assert(r.stderr.includes('[' + rule + ']'), `${name}: expected ${rule}`);
  console.log(`${name}: exit ${r.status}`);
};
const partial = (name, mutate = () => {}, expected = 1, source = original) => {
  setup(name, source);
  const rec = record();
  put(suite, source.replace(caseLines.join('\n') + '\n', ''));
  let msg = message, include = true;
  const controls = { put, remove: (p) => rmSync(resolve(cwd, p)),
    message: (m) => { msg = m; }, omit: () => { include = false; } };
  mutate(rec, controls);
  if (include) put('diet/record.json', JSON.stringify(rec, null, 2) + '\n');
  commit(msg);
  qualify(name, expected, expected ? 'assertion-removed' : '');
};

partial('valid-scoped-retirement', () => {}, 0);
partial('missing-record', (_r, c) => c.omit());
partial('missing-task', (_r, c) => c.message(message.replace('test-diet', 'maintenance')));
partial('missing-journey-trailer', (_r, c) => c.message(message.replace('Journey-Coverage: ' + journey, '')));
partial('forged-base-blob', (r) => { r.baseBlob = '0'.repeat(40); });
partial('forged-candidate', (r) => { r.journey.candidate = '0'.repeat(40); });
partial('forged-journey-blob', (r) => { r.journey.blob = '0'.repeat(40); });
partial('missing-proof-reference', (r) => { r.journey.evidence = ''; });
partial('missing-negative-limit', (r) => { r.unproved = ''; });
partial('unbound-journey', (r, c) => {
  r.journey.path = 'mobile/e2e/missing.mjs'; c.message(message.replace(journey, r.journey.path));
});
partial('changed-retained-journey', (_r, c) => c.put(journey, realJourney + '// changed\n'));
partial('wrong-surface', (r) => { r.surface = 'OtherWriter'; });
partial('inexact-scope', (r) => { r.first = 1; });
partial('extra-unexplained-assertion', (_r, c) => c.put(suite, retained.replace('assert.equal(Widget(), 1);', 'Widget();')));
for (const word of ['security', 'credential', 'encrypt', 'backup']) {
  // Guard the enclosing case even when the exact retired leg omits its guarded title.
  const guarded = original.replace('Widget mocked display', word + ' Widget mocked display');
  setup('guarded-' + word, guarded);
  const rec = record(); rec.first = 3; rec.last = 4;
  put(suite, guarded.split('\n').filter((_l, i) => i !== 2 && i !== 3).join('\n'));
  put('diet/record.json', JSON.stringify(rec)); commit(message);
  qualify('guarded-' + word, 1, 'invalid-test-diet');
}
setup('late-metadata');
const late = record(); put(suite, retained); commit('unexplained removal');
put('diet/record.json', JSON.stringify(late)); commit(message);
qualify('late-metadata', 1, 'assertion-removed');
setup('unrelated-journey', original, "console.log('unrelated integration');\n");
const unrelated = record(); put(suite, retained); put('diet/record.json', JSON.stringify(unrelated)); commit(message);
qualify('unrelated-journey', 1, 'invalid-test-diet');
setup('mocked-journey', original, realJourney + "jest.mock('../Widget.mjs');\n");
const mocked = record(); put(suite, retained); put('diet/record.json', JSON.stringify(mocked)); commit(message);
qualify('mocked-journey', 1, 'invalid-test-diet');
setup('unexplained-loss'); put(suite, retained); commit('maintenance'); qualify('unexplained-loss', 1, 'assertion-removed');
setup('whole-file-diet'); rmSync(resolve(cwd, suite)); commit('test-diet fixture\n\nJourney-Coverage: ' + journey);
qualify('whole-file-diet', 0);
setup('whole-file-unexplained'); rmSync(resolve(cwd, suite)); commit('maintenance'); qualify('whole-file-unexplained', 1, 'test-deleted');
setup('whole-file-guarded'); put('mobile/auth.test.mjs', original); commit('fixture: guarded test');
base = git('rev-parse', 'HEAD'); git('branch', '-f', 'main', base);
rmSync(resolve(cwd, 'mobile/auth.test.mjs')); commit('test-diet fixture\n\nJourney-Coverage: ' + journey);
qualify('whole-file-guarded', 1, 'test-deleted');
setup('assertion-replacement'); put(suite, original.replace('assert.equal(Widget(), 1);', 'assert.ok(Widget());')); commit('replace assertion'); qualify('assertion-replacement', 0);
for (const [name, line, rule] of [
  ['suppression', '// @ts-ignore\nconst x = 1;\n', 'silenced-checker'],
  ['stub', 'try { Widget(); } catch {}\n', 'unfinished-work'],
  ['skip', "test.skip('Widget', () => {});\n", 'test-made-easier'],
]) {
  setup(name); put('mobile/change.mjs', line); commit('unrelated floor violation'); qualify(name, 1, rule);
}
setup('threshold'); put('CONSTRAINTS.md', '| Coverage | minimum 79 |\n'); commit('lower threshold'); qualify('threshold', 1, 'threshold-loosened');
console.log(`${results.length} real floor CLI histories passed`);

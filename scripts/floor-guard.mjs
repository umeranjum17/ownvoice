#!/usr/bin/env node
// floor-guard.mjs — diff-scoped enforcement of the CONSTRAINTS.md floor.
// Adapted from constraint-driven-development references/floor-guard.md (same contract).
// Usage: node scripts/floor-guard.mjs [--base <ref>]   (default base: origin/main)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const baseArg = (() => {
  const i = process.argv.indexOf('--base');
  return i > -1 ? { given: true, ref: process.argv[i + 1] } : { given: false, ref: 'origin/main' };
})();

// `git diff --no-index` exits 1 whenever the two sides differ, which is the normal case for a
// new file, so that output is kept. Any other failure is null, and null never reads as clean.
const git = (args, { diffExit = false } = {}) => {
  try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { return diffExit && e.status === 1 && typeof e.stdout === 'string' ? e.stdout : null; }
};
const bail = (msg) => { console.error('floor-guard: ' + msg); process.exit(2); };

// Run from the top of the work tree. `git ls-files` lists only the current directory's subtree,
// relative to it, so a guard started in a subfolder would miss untracked files elsewhere and name
// the rest differently from `git diff`, which always covers the whole tree.
const top = git(['rev-parse', '--show-toplevel'])?.trim();
if (!top) bail('not inside a git work tree');
process.chdir(top);

// Merge base; bail to exit 2 rather than pretending a shallow/rootless clone is clean. Without an
// explicit --base, fall back to a local main and then to HEAD, because a checkout may have the
// history without a remote-tracking ref. An explicit ref that does not resolve is still exit 2.
const mergeBaseOf = (ref) => git(['merge-base', ref, 'HEAD'])?.trim() ?? null;
const mergeBase = mergeBaseOf(baseArg.ref) ?? (baseArg.given ? null : mergeBaseOf('main') ?? mergeBaseOf('HEAD'));
if (!mergeBase) bail('no merge base against ' + baseArg.ref);

// Unified diff plus untracked files (git diff alone cannot see new files).
const tracked = git(['diff', '--unified=0', mergeBase, '--']);
if (tracked === null) bail('could not diff against ' + mergeBase);
const untrackedFiles = git(['ls-files', '--others', '--exclude-standard']);
if (untrackedFiles === null) bail('could not list untracked files');
const untracked = untrackedFiles.split('\n').filter(Boolean).map((f) => {
  const d = git(['diff', '--no-index', '--unified=0', '/dev/null', f], { diffExit: true });
  if (d === null) bail('could not diff untracked file ' + f);
  return d;
}).join('\n');
const diff = tracked + '\n' + untracked;

// Walk the diff. `---` and `+++` are file headers only between a file's `diff` line and its first
// `@@` hunk; inside a hunk every line is content, so an added `++i` (shown as `+++i`) or a removed
// `-- comment` is a change, not a header. Both headers name the file, so a deletion
// (`+++ /dev/null`) keeps its name.
const added = [], removed = [], deleted = [];
const pathOf = (s) => s.replace(/^[a-zA-Z0-9]\//, '');
let file = '', oldFile = '', inHeader = false, oldLine = 0;
for (const line of diff.split('\n')) {
  if (line.startsWith('diff ')) inHeader = true;
  else if (line.startsWith('@@')) {
    inHeader = false;
    oldLine = Number((line.match(/^@@ -(\d+)/) ?? [])[1]) || 0;
  }
  else if (inHeader) {
    if (line.startsWith('--- ')) oldFile = pathOf(line.slice(4));
    else if (line.startsWith('+++ ')) {
      const newFile = pathOf(line.slice(4));
      file = newFile === '/dev/null' ? oldFile : newFile;
      if (newFile === '/dev/null') deleted.push(file);
    }
  }
  else if (line.startsWith('+')) added.push({ file, text: line.slice(1) });
  else if (line.startsWith('-')) removed.push({ file, text: line.slice(1), at: oldLine++ });
}

const findings = [];
const flag = (rule, f, text) => findings.push({ rule, file: f, text: text.trim().slice(0, 120) });
const isTest = (f) => /\.(test|spec)\.|_test\.|test_|__tests__|(^|\/)(e2e|integration|tests?)\//.test(f);
const isConstraints = (f) => /CONSTRAINTS\.md$/.test(f);

// Blank out string and regex literals before testing an added line. A guard's own source, a
// doc example or a line defining a pattern all mention the very tokens below without silencing
// or skipping anything, so a path exclusion would hide real findings; blanking the literals keeps
// the check on the code itself.
const codeOnly = (s) => s
  .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""')
  .replace(/\/(?:\\.|[^/\n])+\/[gimsuy]*/g, 'RE');

// 1. Silenced checker — extend this list for your ecosystem.
const SUPPRESSIONS = /@ts-ignore|@ts-nocheck|eslint-disable|biome-ignore|# *noqa|# *type: *ignore|istanbul ignore|nosemgrep|gitleaks:allow|Stryker disable/;
// 4. Unfinished work.
const STUBS = /throw new (Error|NotImplemented).*[Nn]ot implemented|catch\s*\(\w*\)\s*\{\s*\}|catch\s*\{\s*\}|\bTODO\b|\bpass\s*# *stub/;
// 2. A test made easier (added skips).
const SKIPS = /\.(skip|todo)\b|\b(xit|xdescribe)\s*\(|@pytest\.mark\.skip|t\.Skip\s*\(/;

for (const { file, text } of added) {
  const code = codeOnly(text);
  if (SUPPRESSIONS.test(code)) flag('silenced-checker', file, text);
  if (STUBS.test(code)) flag('unfinished-work', file, text);
  if (SKIPS.test(code)) flag('test-made-easier', file, text);
  if (isConstraints(file) && /^\| *(W|E)\d+ *\|/.test(text)) flag('new-exception', file, text);
}

// 2b. A test file deleted, or an assertion removed from a test file that still exists.
//
// Test-diet exception (agreed for this repo): a deleted unit test may pass only when its commit
// names the test-diet task AND names, by path, an integration/e2e journey that already existed
// before this diff and still exercises the deleted unit's module. Both facts are read from the
// commits themselves and from the tree, never from a filename glob, and a machine that cannot
// establish them refuses rather than guesses. Files guarding security, crypto or data loss are
// never excused, diet or not.
const GUARDED = /crypt|cipher|encrypt|decrypt|hash|hmac|sign|password|secret|token|auth|permission|consent|keystore|master.?key|migration|backup|restore|data.?loss/i;
const commitBodies = git(['log', '--format=%B', mergeBase + '..HEAD']) ?? '';
const namedDiet = /test[\s(\[-]*diet/i.test(commitBodies);
const namedJourneys = new Set(
  [...commitBodies.matchAll(/^[ \t]*Journey-Coverage:[ \t]*(\S+)[ \t]*$/gm)].map((m) => m[1])
);
const journeyRetains = (module) => [...namedJourneys].some((j) => {
  if (j === undefined || !isTest(j)) return false;
  // The journey must predate this diff: a journey added here is not retained coverage.
  if (added.some((a) => a.file === j) || deleted.includes(j)) return false;
  if (git(['cat-file', '-e', mergeBase + ':' + j]) === null) return false;
  const body = git(['show', mergeBase + ':' + j]) ?? git(['cat-file', 'blob', 'HEAD:' + j]) ?? '';
  return body.includes(module);
});
// Removed-with-its-module: a deleted test whose module is gone from the whole tree at the
// diff's head took its code with it, so nothing was hidden. Whether the module survives is
// read from the real tree (tracked plus untracked files, minus what this diff deletes) using
// the same module name the journey rule derives — never a glob or a hand-kept list. Any file
// of that module (another test, a source or config file module.ts/.tsx/.json) or any directory
// named for it keeps the module alive and the deletion under the diet rule below; names match
// exactly, like the journey rule's body check. A tree that cannot be listed refuses the
// excuse, exactly like a journey that cannot be read.
const treeFiles = git(['ls-files']);
const moduleOf = (f) => f.replace(/^\.?\//, '').replace(/(_test|\.test|\.spec)\.[^.]+$/, '').replace(/^.*\//, '');
const moduleAlive = (module) => {
  if (treeFiles === null) return true;
  return treeFiles.split('\n').filter(Boolean)
    .concat(untrackedFiles.split('\n').filter(Boolean))
    .filter((p) => !deleted.includes(p))
    .some((p) => {
      const n = moduleOf(p);
      return n === module || n.startsWith(module + '.') || p.split('/').includes(module);
    });
};
const removedWithModule = [];
const excuse = (f) => {
  if (GUARDED.test(f)) return 'security/crypto/data-loss guard';
  const module = moduleOf(f);
  if (!moduleAlive(module)) { removedWithModule.push(f); return null; }
  if (!namedDiet) return 'commit does not name a test-diet task';
  if (!namedJourneys.size) return 'no Journey-Coverage path named in the commit';
  if (!journeyRetains(module)) return 'no named pre-existing journey covers ' + module;
  return null;
};

for (const f of deleted) {
  if (!isTest(f)) continue;
  const why = excuse(f);
  if (why) flag('test-deleted', f, why);
}
// Assertion-replacement exception: a removed assertion line is excused when its file does not
// lose assertion lines across this diff. The same check rewritten for new behaviour (a "Why?"
// count going from one to two because the panel grew a card) holds or grows the count, and only
// a real drop lowers the bar. Both numbers are read from this same diff, per file, with the
// matcher the check already uses — never from a filename glob — and a file that cannot show
// the numbers still has every removed assertion line flagged, exactly as before.
const isAssertion = (text) => /\b(expect|assert|should)\b/.test(codeOnly(text));
const excuseAssertion = (f) => {
  const rem = removed.filter((l) => l.file === f && isAssertion(l.text)).length;
  const add = added.filter((l) => l.file === f && isAssertion(l.text)).length;
  return rem > add ? rem + ' assertion line(s) removed vs ' + add + ' added in this file' : null;
};
// 2d. An assertion removed together with the code it exercised: a removed assertion line is
// excused only when its test exercised an imported symbol that no longer exists anywhere in the
// tree at the diff's head. Identifiers are read from the assertion line itself and from its
// enclosing test block in the file's base version, then intersected with the symbols that file
// imports or requires — the module-under-test surface, never host builtins or jest matchers —
// and each survivor is searched exactly: whole word, fixed string, in file contents, across every
// source or test file of the HEAD tree plus untracked code files. Never a filename glob (a file
// named for the symbol is not the symbol existing), never a fuzzy or partial match (fitBackend
// does not match fitBackends). A mention inside a comment is not the symbol existing either:
// hit lines that are wholly comments are ignored, so a code file's prose about a symbol does not
// keep it alive (a partial-line comment after code still counts, erring toward the finding).
// Prose files (reports, docs) are outside the search: a report mentioning a symbol is not the
// symbol existing. If every imported identifier still exists in
// code the excuse is refused and the finding stands exactly as before; a tree or file that cannot
// be read also refuses the excuse.
const identRe = /[A-Za-z_$][A-Za-z0-9_$]*/g;
const identsOf = (s) => new Set(codeOnly(s).match(identRe) ?? []);
const PROSE = /\.(?:md|txt|rst|adoc|pdf)$/i;
const baseCache = new Map();
const baseFile = (f) => {
  if (!baseCache.has(f)) baseCache.set(f, git(['show', mergeBase + ':' + f]) ?? '');
  return baseCache.get(f);
};
const enclosingTest = (f, at) => {
  const lines = baseFile(f).split('\n');
  let start = -1;
  for (let i = Math.min(at || 1, lines.length) - 1; i >= 0; i--) {
    if (/^\s*(?:test|it)\s*\(/.test(lines[i])) { start = i; break; }
  }
  if (start < 0) return '';
  let end = lines.length;
  for (let j = start + 1; j < lines.length; j++) {
    if (/^\s*(?:test|it|describe)\s*\(/.test(lines[j])) { end = j; break; }
  }
  return lines.slice(start, end).join('\n');
};
const liveness = new Map();
const stillInCode = (id) => {
  if (liveness.has(id)) return liveness.get(id);
  const out = git(['grep', '-I', '-w', '-F', '-e', id, 'HEAD'], { diffExit: true });
  let alive = out === null; // a search that cannot run refuses the excuse
  if (!alive) {
    alive = out.split('\n').filter(Boolean).some((hit) => {
      const colon = hit.indexOf(':', 5); // strip the leading 'HEAD:'
      const path = hit.slice(5, colon);
      if (PROSE.test(path)) return false;
      return !/^\s*(?:\/\/|\*|\/\*|#)/.test(hit.slice(colon + 1)); // comment-only lines are prose
    });
  }
  if (!alive) {
    alive = untrackedFiles.split('\n').filter(Boolean).some((u) => {
      if (PROSE.test(u)) return false;
      try { return new RegExp('(?<![\\w$])' + id.replace(/[$]/g, '\\$') + '(?![\\w$])').test(readFileSync(u, 'utf8')); }
      catch { return true; } // an unreadable file refuses the excuse
    });
  }
  liveness.set(id, alive);
  return alive;
};
const importCache = new Map();
const importedIdents = (f) => {
  if (importCache.has(f)) return importCache.get(f);
  const src = baseFile(f);
  const names = new Set();
  const add = (list) => {
    for (const part of list.split(',')) {
      const n = part.split(/\s+as\s+/).pop().trim().replace(/^type\s+/, '');
      if (n && /[A-Za-z_$][A-Za-z0-9_$]*/.test(n) && !n.includes(' ')) names.add(n);
    }
  };
  for (const m of src.matchAll(/^import\s+[^\n]*?\{([^}]+)\}/gm)) add(m[1]);
  for (const m of src.matchAll(/^import\s+([\w$]+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/\{([^}]+)\}\s*=\s*(?:jest\.)?require(?:\.\w+)?\s*\(/g)) add(m[1]);
  importCache.set(f, names);
  return names;
};
const assertionsDiedWithCode = [];
const exercisedGone = (entry) => {
  const ids = identsOf(entry.text);
  for (const id of identsOf(enclosingTest(entry.file, entry.at))) ids.add(id);
  const imports = importedIdents(entry.file);
  for (const id of ids) if (imports.has(id) && !stillInCode(id)) return id;
  return null;
};
for (const entry of removed) {
  if (isTest(entry.file) && !deleted.includes(entry.file) && isAssertion(entry.text)) {
    const why = excuseAssertion(entry.file);
    if (!why) continue;
    const gone = exercisedGone(entry);
    if (gone) assertionsDiedWithCode.push(entry.file + ' (' + gone + ' is gone from the tree)');
    else flag('assertion-removed', entry.file, why + ': ' + entry.text);
  }
}

// 1b/2c. A rule in CONSTRAINTS.md weakened or removed. A rule is a floor bullet or a table row,
// identified by the bullet's text before its first colon or by the row's first cell. Each number
// carries a direction read from the words around it: a minimum (>=, at least, must not fall) is
// loosened by going down, a maximum (<=, at most, under, must not grow) by going up. A number whose
// direction cannot be read is reported whenever it changes, because the guard cannot tell
// tightening from loosening and staying quiet is the wrong default. Numbers are paired within
// their direction (the first minimum with the first minimum, and so on), so a number added
// elsewhere in the text does not shift the pairing; a threshold with no counterpart after the
// edit was removed, and an added one tightens.
const ruleKey = (t) => {
  const s = t.trim();
  if (s.startsWith('|')) return s.split('|').map((c) => c.trim()).filter(Boolean)[0] ?? '';
  if (/^[-*] /.test(s)) return s.slice(2).split(':')[0].trim();
  return null; // prose, headings, dates: not a rule
};
const isException = (t) => /^\| *(W|E)\d+ *\|/.test(t.trim());
const MIN_BEFORE = /(>=|>|≥|at least|minimum|\bmin\b|no less than|not fall|not drop)\s*$/;
const MAX_BEFORE = /(<=|<|≤|at most|maximum|\bmax\b|no more than|under|below|not grow|not exceed)\s*$/;
const MIN_AFTER = /^\s*\S*\s*(or more|or higher|must not fall|must not drop)/;
const MAX_AFTER = /^\s*\S*\s*(or less|or lower|must not grow|must not exceed)/;
const thresholds = (t) => {
  const out = [], re = /\d+(?:\.\d+)?/g;
  let m;
  while ((m = re.exec(t))) {
    const before = t.slice(Math.max(0, m.index - 24), m.index).toLowerCase();
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 40).toLowerCase();
    const dir = MIN_BEFORE.test(before) || MIN_AFTER.test(after) ? 'min'
      : MAX_BEFORE.test(before) || MAX_AFTER.test(after) ? 'max' : null;
    out.push({ n: Number(m[0]), dir });
  }
  return out;
};
const removedRules = removed.filter((l) => isConstraints(l.file) && ruleKey(l.text) !== null);
const addedRules = added.filter((l) => isConstraints(l.file) && ruleKey(l.text) !== null);
for (const r of removedRules) {
  const a = addedRules.find((x) => ruleKey(x.text) === ruleKey(r.text));
  if (!a) {
    if (!isException(r.text)) flag('rule-removed', r.file, r.text); // dropping an exception tightens: silent
    continue;
  }
  const before = thresholds(r.text), after = thresholds(a.text);
  let verdict = null;
  for (const dir of ['min', 'max', null]) {
    const was = before.filter((x) => x.dir === dir), now = after.filter((x) => x.dir === dir);
    was.forEach((b, i) => {
      const n = now[i];
      if (verdict) return;
      if (!n) verdict = 'threshold-removed';
      else if (n.n === b.n) return;
      else if (dir === 'min' ? n.n < b.n : dir === 'max' ? n.n > b.n : true) {
        verdict = dir ? 'threshold-loosened' : 'threshold-changed';
      }
    });
  }
  if (verdict) flag(verdict, r.file, r.text + '  ->  ' + a.text);
}

if (removedWithModule.length) {
  console.log('floor-guard: removed with its module (code and test deleted together, not a lowered bar):');
  for (const f of removedWithModule) console.log('  ' + f);
}
if (assertionsDiedWithCode.length) {
  console.log('floor-guard: assertions removed with the code they exercised (the imported symbol their test exercised is gone from the source tree at this head):');
  for (const s of assertionsDiedWithCode) console.log('  ' + s);
}
if (findings.length === 0) { console.log('floor-guard: clean'); process.exit(0); }
console.error('floor-guard: ' + findings.length + ' floor violation(s):');
for (const f of findings) console.error(`  [${f.rule}] ${f.file}: ${f.text}`);
if (findings.some((f) => f.rule === 'test-deleted')) {
  console.error('\nA test deletion is excused only when its commit names the test-diet task and a');
  console.error('Journey-Coverage path that already existed and still exercises that module, or when');
  console.error('the module it covered is gone from the tree (removed with its module).');
}
if (findings.some((f) => f.rule === 'rule-removed')) {
  console.error('\nA rule-removed finding can also mean the rule\'s label changed: rename a rule in one commit and change its thresholds in another.');
}
if (findings.some((f) => f.rule === 'threshold-removed')) {
  console.error('\nA threshold-removed finding can also mean a number gained or lost its direction words (">= 80%" becoming "80%", or the reverse): compare the two lines before assuming a threshold was deleted.');
}
console.error('\nEach is a move that lowers the bar. Fix the code, or route it through a tracked exception.');
process.exit(1);

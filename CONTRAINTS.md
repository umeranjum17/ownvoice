# Constraints

Floor for this repo, enforced by `scripts/floor-guard.mjs` (`npm run floor` in `mobile`,
and the same step in CI). No exceptions table yet.

## Floor

- No new suppression comments: `@ts-ignore`, `eslint-disable`, `# noqa`, `# type: ignore`
- No unimplemented stubs: `throw new Error("Not implemented")`, empty `catch {}`
- No skipped or deleted tests without a reason in the commit message
- No secrets in source
- This file does not get weakened to make a change pass

The last two bullets are the human rule. The guard enforces the first three and the
fourth; it is a regex check over the diff, not a secret scanner, so do not read a green
`floor-guard` run as proof that no secret was committed. Nothing in this repo scans for
secrets today (`gitleaks detect` is not wired into `.github/workflows/`), so review the
diff for credentials before pushing.

## Test diet

This repo converts unit tests into integration and end-to-end journeys, so deletions
are expected rather than suspicious. A deleted unit test passes the floor only when its
commit names the test-diet task and names, on a `Journey-Coverage: <path>` line, an
integration/e2e journey that already existed before the change and still exercises the
deleted unit's module. Tests that guard security, credentials, crypto or data loss are
never excused. The guard refuses when it cannot establish both facts itself.

For a complete mocked case or exact mocked assertion leg in a retained suite, the
**removal commit itself** must name the test-diet task, the retained
`Journey-Coverage: <path>`, and `Test-Diet-Retirement: <tracked-json-path>`.
The JSON record has this shape (Git object IDs are full 40-digit hex):

```json
{
  "file": "mobile/app/__tests__/Example.test.tsx",
  "baseBlob": "<merge-base and removal-parent test blob>",
  "first": 10,
  "last": 16,
  "surface": "ExampleWriter",
  "reason": "Why this exact mocked case or assertion leg is being retired",
  "unproved": "Which separately tracked runtime paths remain unresolved",
  "journey": {
    "path": "mobile/e2e/example-proof.mjs",
    "candidate": "<original historical feature commit>",
    "blob": "<unchanged journey blob at that commit>",
    "evidence": "Original proof reference, retaining its candidate/artifact binding",
    "limit": "What that historical journey proves, and what it does not"
  }
}
```

Use one record/trailer per contiguous scope. Line numbers are inclusive in the
base blob; every scoped line must be deleted by that commit. The scope must contain
an assertion, a Jest mock marker and the named surface. The same surface must occur
in the retained non-Jest integration/e2e journey. That journey must be unchanged
from its original ancestor candidate through the base and current tree. Guarded
paths, scope text and enclosing cases (security, credentials, crypto, data loss)
remain ineligible. Other assertion losses and all other floor checks still fail.

This is reviewable commit provenance, not machine authentication of an approval or
runtime evidence. Review must verify the explanation, exact scope, surface mapping
and original proof reference. A valid record does not prove an unresolved native
negative path passed, nor transfer historical proof to the retirement candidate.
An uncommitted record or a later metadata-only commit cannot authorize a deletion.

The guard's CLI integration journey runs with real isolated Git histories:
`node scripts/integration/floor-guard.mjs <empty-private-scratch> <evidence-directory>`.
Run it under isolated HOME/XDG/TMPDIR; it records every floor subprocess command,
stdout, stderr, exit and candidate binding. It does not run native/provider proofs.

## Enforced with numbers

| Dimension | Rule | Checked by | Runs at |
|-----------|------|-----------|---------|
| Types | Zero type errors | `npm run typecheck` (mobile, engine) | every edit, CI |
| Lint | Zero errors from our config | `npm run lint` (mobile, engine) | every edit, CI |
| Tests | Jest and node --test pass | `npm test` (mobile, engine) | every edit, CI |
| Floor | No diff-scoped floor violation | `npm run floor` | CI |

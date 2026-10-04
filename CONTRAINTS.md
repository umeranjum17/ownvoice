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

## Enforced with numbers

| Dimension | Rule | Checked by | Runs at |
|-----------|------|-----------|---------|
| Types | Zero type errors | `npm run typecheck` (mobile, engine) | every edit, CI |
| Lint | Zero errors from our config | `npm run lint` (mobile, engine) | every edit, CI |
| Tests | Jest and node --test pass | `npm test` (mobile, engine) | every edit, CI |
| Floor | No diff-scoped floor violation | `npm run floor` | CI |

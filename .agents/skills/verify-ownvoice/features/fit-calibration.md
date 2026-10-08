# Fit calibration

Host verification recipe for the developer-only G9 CLI. The authoritative [calibration contract and approved scope](../../../../mobile/eval/README.md#fit-calibration-g9-local-only) cover eligibility, verdicts and why weekly numbers stay manual.

## Sub-features

- Seeded verdicts and eligibility exclusions against the linked calibration contract.
- Invalid-input diagnostics and byte-for-byte input preservation.

## How to get to it (user POV)

Use the developer command and input format in the linked calibration contract; there is no changed app screen.

## Driving it with the host CLI

Preconditions: Node with native TypeScript stripping (the writer eval uses the same runtime), installed mobile dependencies, and task-private HOME/XDG/TMPDIR. No model, sign-in or emulator.

Run `node mobile/eval/fit-calibration.integration.ts` from the repo root. It creates seeded outcome files with synthetic Umer insertion ids and drives the actual CLI as a subprocess, checks pass/fail/not-enough outputs and exit codes, unequal denominators, exclusions, bad input and byte-for-byte preservation. It removes its temporary files. Save command, stdout, stderr and exit code under `verify-artifacts/<task>/fit-calibration/`.

To drive a specific seeded file, run `node mobile/eval/fit-calibration.ts <file>` from the repo root. Capture all three verdicts and compare exit codes against the linked contract. The integration runner's successful exit means the CLI contract held, not that real personal outcomes passed G9.

## Gotchas

The seeded host proof does not establish personal calibration or verify Android check-in UI or SQLite persistence (see [Local reply outcomes](./reply-outcomes.md)). For interpretation limits and the account-analytics distinction, use the linked calibration contract.

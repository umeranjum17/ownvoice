# Fit calibration

G9 reads local reply check-ins through the developer CLI. It compares shown fit groups without sending data or claiming Ownvoice caused growth. There is no CSV import or changed app screen.

## Sub-features

- Strong/Good versus Might/Skipped, using the app's actual level strings and Outcome type.
- At least 15 eligible check-ins in each group; smaller groups never pass.
- Strictly higher replies-or-likes rate passes; ties and reversed rates fail.
- Not-posted, absent check-ins and unrated/unsure records do not count.
- Bad JSON, malformed rows and duplicate insertions fail visibly; input stays unchanged.

## How to get to it (user POV)

A developer runs `node mobile/eval/fit-calibration.ts <reply-outcomes.json>` on the JSON array stored at `reply-outcomes`. It prints the verdict, both groups' counts and exclusions. This is not an app feature; weekly numbers remain manual.

## Driving it with the host CLI

Preconditions: Node with native TypeScript stripping (the writer eval uses the same runtime), installed mobile dependencies, and task-private HOME/XDG/TMPDIR. No model, sign-in or emulator.

Run `node mobile/eval/fit-calibration.integration.ts` from the repo root. It creates seeded outcome files with synthetic Umer insertion ids and drives the actual CLI as a subprocess, checks pass/fail/not-enough outputs and exit codes, unequal denominators, exclusions, bad input and byte-for-byte preservation. It removes its temporary files. Save command, stdout, stderr and exit code under `verify-artifacts/<task>/fit-calibration/`.

To drive a specific seeded file, run `node mobile/eval/fit-calibration.ts <file>`. Exit codes are 0 pass, 1 fail, 2 not enough yet, 3 invalid input. Capture all three verdicts; none is interchangeable with a pass. The integration runner's successful exit means the CLI contract held, not that real personal outcomes passed G9.

## Gotchas

No check-in is inferred from daily account analytics or text. A pass measures association on these check-ins only; selection bias remains. Reply text is optional and unnecessary. The current account-overview CSV evidence lacks follower totals and per-reply rows; it cannot safely populate this input. This host proof does not verify Android check-in UI or SQLite persistence (see Local reply outcomes).

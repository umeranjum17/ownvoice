# BYOKit accounts 0.7.1 live A/B

2026-09-30, persistent signed-in `ownvoice-signed` emulator, Android 36,
`emulator-5554`, `dev.ownvoice.next`. Baseline: main `33067c9`; candidate:
pipeline `25c59e35c9f61e9343dbb3766bf2463f399881a9`, pinning
`@byokit/accounts` exactly to `0.7.1`.

Both APKs were ordinary release builds from read-only archives, with isolated
HOME and no E2E flags. Each was installed with `adb install -r` on the same
persistent emulator with the same app sign-in and practice chat. App restarts
used `kill -9` and `am start` only; no force-stop, sign-out, wipe or credential
copying was used. The emulator cannot use the phone writer, so the cards
exercised live ChatGPT through the app.

| Build / action | First nonblank card observed | All cards observed | Count |
| --- | ---: | ---: | ---: |
| Main `33067c9` practice replies | 11,992 ms | 11,992 ms | 3 |
| Candidate `25c59e35` practice replies | 6,961 ms | 6,961 ms | 3 |
| Main selection rewrite, Firmer | 10,199 ms | 10,199 ms | 1 |
| Candidate selection rewrite, full-log rerun | 7,999 ms | 7,999 ms | 1 |
| Candidate selection repeat 1, Firmer | 6,451 ms | 6,451 ms | 1 |
| Candidate selection repeat 2, Firmer | 6,340 ms | 6,340 ms | 1 |
| Candidate selection repeat 3, Firmer | 5,304 ms | 5,304 ms | 1 |

Times run from the bubble tap or rewrite activation through screenshot polling,
including capture/OCR overhead; they are observation bounds, not a latency
benchmark. Both practice runs produced three nonblank cards. All selection
runs used the same invented input, “Please bring the tent. Pack the stove.
Meet Saturday at noon.”, and Firmer. Every successful selection returned:
“Bring the tent. Pack the stove. Meet Saturday at noon.”

One earlier candidate selection attempt hung: zero cards across 40 polls
spanning about 70 seconds, with no error logged. It did not reproduce in the
four later candidate selection runs above. The cause is unknown and no exact
stall point was established; it has not been identified as a kit gap or fixed.
Actual app-pid full logs were captured, but contained no request/stream timing
or BYOKit response error, so they do not establish where that attempt stalled.

Refreshed screenshots: [baseline](accounts-060-baseline.png),
[candidate drafts](accounts-060-candidate.png),
[candidate rewrite](accounts-060-rewrite.png). These now show the 0.7.1 A/B;
the filenames retain the original task name.

Worker evidence is under `/home/umer/lab-tmp/ov-accounts-060`:

- `main-071-ab-result.json`, `candidate-071-ab-result.json`.
- `main-071-selection-result.json`, `candidate-071-selection-full-result.json`.
- `candidate-071-repeat-1-result.json`, `candidate-071-repeat-2-result.json`,
  `candidate-071-repeat-3-result.json`.
- Matching logcat files, including `main-071-selection-full-logcat.txt`,
  `candidate-071-selection-full-full-logcat.txt` and
  `candidate-071-repeat-{1,2,3}-full-logcat.txt`.
- Screenshot sources: `main-071-ab-poll-06.png`,
  `candidate-071-ab-poll-03.png`, `candidate-071-selection-full-poll-03.png`.

Final state: setup complete restored, ChatGPT writer source and app sign-in
preserved; emulator cleanly shut down.

Worker-reported candidate validation: lint and typecheck pass; full Jest passes
47 suites, 777 tests and 46 snapshots. The saved `tests-071-full.log` confirms
the Jest totals. Executable transport coverage uses the real `accounts.respond`
reader for malformed/empty and incomplete streams, completed-envelope conflicts,
LF/CRLF/bare CR, consent withdrawal, dispatch vetoes, send marking and selection
rewrites. This report records the worker's existing QA; no new emulator QA was
run during the review fix.

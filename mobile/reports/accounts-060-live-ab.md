# BYOKit accounts 0.6.0 live A/B

2026-09-30, persistent signed-in `ownvoice-signed` emulator, Android 36,
`emulator-5554`, `dev.ownvoice.next`. Both APKs are ordinary release builds,
without E2E flags. Baseline: main at task start, `f81058b`; candidate:
`ff4e8c0`, pinning `@byokit/accounts` exactly to `0.6.0`.

Installed baseline with `adb install -r`, then candidate with `adb install -r`.
The same account and practice chat were used for both. Setup's TRY step was
revisited via its SQLite kv store; the practice field was focused and the
accessibility service rebound before tapping the bubble at its window centre.
App restarts used `kill -9` and `am start`, never force-stop.

| Build / action | First nonblank card observed | All cards observed | Count |
| --- | ---: | ---: | ---: |
| Main practice replies | 10,394 ms | 10,394 ms | 3 |
| accounts 0.6.0 practice replies | 11,596 ms | 11,596 ms | 3 |
| accounts 0.6.0 selection rewrite, Firmer | 12,275 ms | 12,275 ms | 1 |

Times run from the bubble tap or rewrite activation through screenshot polling,
including capture/OCR overhead; they are observation bounds, not a latency
benchmark. Every reply card was nonblank and addressed Saturday and the
tent/stove arrangement. The selection rewrite used ACTION_PROCESS_TEXT with
invented text, selected Firmer with DPAD/ENTER, and returned:
“Bring the tent. Pack the stove. Meet Saturday at noon.”
The emulator cannot use the phone writer, so these results exercised live
ChatGPT. No no-answer or AndroidRuntime error appeared in the captured logs.

Evidence: [baseline](accounts-060-baseline.png),
[candidate drafts](accounts-060-candidate.png),
[candidate rewrite](accounts-060-rewrite.png).
Native read-log facts marked both successful practice requests sent, at
epochs `1790734952051` and `1790735018451`. No credentials or tokens are
included in the evidence.

Final state: setup complete, temporary setup row removed, writer source still
ChatGPT, Home shows “Writes with your ChatGPT / Ready to help.” No sign-out,
wipe, credential copy, or other app switch change. The emulator was shut down
cleanly with `adb -s emulator-5554 emu kill`. The other running emulator,
`ch_app_icons`, belongs to Crewhouse; firstmate confirmed it was outside the
one-Ownvoice-emulator restriction.

Local validation on `ff4e8c0`: lint and typecheck pass; Jest passes 46 suites,
770 tests, and 46 snapshots. Transport tests execute the actual kit response
reader, including empty/malformed streams, conflicting completed envelopes,
LF/CRLF/bare CR, consent withdrawal during credential resolution, zero fetch
on veto, send marking, and plain-text selection rewrites.

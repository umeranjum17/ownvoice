# Cleaned up applies safe local fixes

Both writers share `src/core/polish.ts`, which applies the existing typing rules to their Cleaned up answers before acceptance. Automatic fixes cover clear dictionary misspellings and repeated function words from a small explicit list. Grammar guesses stay advisory in **Check these**, with the person's per-slip **Fix**. The cleanup preserves corrections already made by the writer. Whole-word matching protects names, handles, tags, URLs and emails, and overlapping deletion/replacement ranges cannot corrupt the text. The shared acceptor retains real apostrophe/casing changes while preserving layout, number/time, shown-version duplicate and avoid-list guards.

Before: `Its a good plan, I shoud be there by the the evening.`

Host writer + cleanup: `It's a good plan, I should be there by the evening.`

An unchanged writer answer gets the automatic spelling and doubled-word fixes while leaving `Its` advisory. Both forms are accepted by P14/P15. The proper-noun case preserves `Umer`. P16 requires `Keep your right hand warm. I should leave.` from `Keep your right hand warm. I shoud leave.`

Validation on recovered candidate `bd4e274`: lint and typecheck passed; Jest passed 49 suites, 840 tests and 46 snapshots. Tests exercise both writers, initial acceptance and retry, apostrophe/casing-only writer fixes, overlapping repeated misspellings, advisory grammar, capitalised words, ambiguous suggestions, protected tokens and the real eval scorer. The existing SettingsTest fetch mock lost an unnecessary cast to resolve its overload mismatch; behavior is unchanged.

Host eval ran from `mobile/eval` with isolated HOME under `/home/umer/lab-tmp/ov-cleanup-spelling`, a task-owned Ollama on port 11439, `MODEL=qwen3.8:27b-q4_K_M`, `MAXTOK_EXTRA=4096`, temperature 0 and seed 7:

```sh
ONLY=P01,P13,S05,R01,R07,P14,P15,P16 node run.ts cleanup-final-qwen http://127.0.0.1:11439 /home/umer/lab-tmp/ov-cleanup-spelling/eval-final.json
node score.ts /home/umer/lab-tmp/ov-cleanup-spelling/eval-final.json
```

All five required gate cases and P14-P16 passed: **8/8 cases, 13 cards, 100% safe and 100% voice**. Raw answers and scores are in `eval-final.json` and `scores-final.json` in that scratch directory. The task-owned server was stopped afterward.

No-mistakes review caught and fixed apostrophe/casing-only changes being dropped, unsafe overlapping edits, broad advisory-grammar automation, name/token deletion and overly restrictive eval expectations. The first run passed review and focused tests, then failed with an agent I/O error; guarded recovery preserved both fix commits before this full validation. No device build or visual capture was performed; the requested single before/after screenshot pair awaits the emulator's release from OV-7.

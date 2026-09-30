# Cleaned up applies safe local fixes

Both writers share `src/core/polish.ts`, which applies the existing typing rules to their Cleaned up answers before acceptance. Automatic spelling fixes cover only unknown lowercase words in the explicit map (`shoud` → `should`, `teh` → `the`, `recieve` → `receive`) or words with exactly one dictionary suggestion. Ranked suggestions remain available for a person’s per-slip Fix, but never decide automatic cleanup. Spelling corrections run first; repeated function-word runs are then removed using the same small explicit list, lowercase-first condition and protected whole-word boundaries. Grammar guesses stay advisory in **Check these**, with the person's per-slip **Fix**. The cleanup preserves corrections already made by the writer. Whole-word matching protects names, handles, tags, URLs and emails, and overlapping deletion/replacement ranges cannot corrupt the text. The shared acceptor retains real apostrophe/casing changes while preserving layout, number/time, shown-version duplicate and avoid-list guards.

Before: `Its a good plan, I shoud be there by the the evening.`

Host writer + cleanup: `It's a good plan, I should be there by the evening.`

An unchanged writer answer gets the automatic spelling and doubled-word fixes while leaving `Its` advisory. Both forms are accepted by P14/P15. The proper-noun case preserves `Umer`. P16 requires `Keep your right hand warm. I should leave.` from `Keep your right hand warm. I shoud leave.`

Historical validation, before both the spelling-safety and cleanup-order changes below, on recovered candidate `bd4e274`: lint and typecheck passed; Jest passed 49 suites, 840 tests and 46 snapshots. Tests exercise both writers, initial acceptance and retry, apostrophe/casing-only writer fixes, overlapping repeated misspellings, advisory grammar, capitalised words, ambiguous suggestions, protected tokens and the real eval scorer. The existing SettingsTest fetch mock lost an unnecessary cast to resolve its overload mismatch; behavior is unchanged.

Historical host eval, before both the spelling-safety and cleanup-order changes below, ran from `mobile/eval` with isolated HOME under `/home/umer/lab-tmp/ov-cleanup-spelling`, a task-owned Ollama on port 11439, `MODEL=qwen3.8:27b-q4_K_M`, `MAXTOK_EXTRA=4096`, temperature 0 and seed 7:

```sh
ONLY=P01,P13,S05,R01,R07,P14,P15,P16 node run.ts cleanup-final-qwen http://127.0.0.1:11439 /home/umer/lab-tmp/ov-cleanup-spelling/eval-final.json
node score.ts /home/umer/lab-tmp/ov-cleanup-spelling/eval-final.json
```

All five required gate cases and P14-P16 passed: **8/8 cases, 13 cards, 100% safe and 100% voice**. Raw answers and scores are in `eval-final.json` and `scores-final.json` in that scratch directory. The task-owned server was stopped afterward.

No-mistakes review caught and fixed apostrophe/casing-only changes being dropped, unsafe overlapping edits, broad advisory-grammar automation, name/token deletion and overly restrictive eval expectations. The first run passed review and focused tests, then failed with an agent I/O error; guarded recovery preserved both fix commits before this full validation. No device build or visual capture was performed; the requested single before/after screenshot pair awaits the emulator's release from OV-7.

The spelling-safety review reproduced `Bring woud for the fire.` becoming `Bring would for the fire.` despite eight dictionary suggestions. The shared automatic boundary now leaves that unchanged writer answer unchanged, while preserving a writer-supplied `Bring wood for the fire.`. An unchanged answer to the original example becomes `Its a good plan, I should be there by the evening.`; a writer-supplied apostrophe correction yields `It's a good plan, I should be there by the evening.`. Both writers and initial/retry acceptance have behavioral regressions for this distinction. Earlier host eval numbers above precede both the spelling-safety and cleanup-order changes and do not qualify either; no new host eval or device validation was run in this review phase.

Historical focused verification after the spelling-safety change, before the cleanup-order change: `npm test -- --runTestsByPath src/core/__tests__/TypingTest.test.ts src/core/__tests__/PolishTest.test.ts src/chatgpt/__tests__/responses.test.ts src/panel/__tests__/phoneWriter.test.ts` passed **4 suites, 166 tests**. This exercises the bundled dictionary and both writer pipelines with supplied answers; it does not establish live writer quality.

The cleanup-order review reproduced `Meet by teh the evening.` becoming `Meet by the the evening.` and `by the The the evening` retaining a double. The shared boundary now applies authorized spelling corrections before removing complete supported runs, yielding `Meet by the evening.` and `by the evening`. Both acceptance methods and writers have behavioral regressions. The spelling map, exactly-one-suggestion rule, advisory grammar policy and protected-token restrictions remain in force. No new live host eval or device validation was run for this change.

Focused verification after the cleanup-order change: `npm test -- --runTestsByPath src/core/__tests__/TypingTest.test.ts src/core/__tests__/PolishTest.test.ts src/chatgpt/__tests__/responses.test.ts src/panel/__tests__/phoneWriter.test.ts --silent` passed **4 suites, 174 tests**. This verifies the bundled dictionary, acceptance/retry methods and both writers with supplied answers; earlier host eval evidence predates this latest change.

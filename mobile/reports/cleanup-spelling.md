# Cleaned up applies the local fixes

Authorized review-fix scope: automatic cleanup applies only clear dictionary misspellings and exact doubled words. Capitalised words and heuristic grammar remain advisory under **Check these** and its per-slip **Fix**. Both writers share `src/core/polish.ts`, which cleans their slot-0 answers without replacing corrections the writer already made. Overlapping doubled-word deletions exclude contained spelling replacements before application. Shared acceptance retains casing and apostrophe changes while preserving layout, number/time, shown-version duplicate and avoid-list guards.

Before: `Keep your right hand warm. I shoud leave.`

After: `Keep your right hand warm. I should leave.`

The original fixture now automatically becomes `Its a good plan, I should be there by the evening.`; `Its` remains advisory unless the writer corrects it.

The proper-noun variant preserves `Umer`. Jest exercises both writer entry points with unchanged answers and the real bundled dictionary; the core check also covers slang, links, list markers and numbers. The dash fixture now starts with correct casing so that it continues testing dash removal independently. Typecheck exposed an existing fetch mock overload mismatch in `SettingsTest`; removing the unnecessary cast retains its behavior and passes typecheck.

Prior implementation validation (before these review fixes): `npm run lint`, `npm run typecheck`, and `npm test -- --ci --silent` in `mobile` passed (47 suites, 769 tests, 46 snapshots). All commands used an isolated HOME under `/home/umer/lab-tmp/ov-cleanup-spelling`.

Prior implementation host writer eval, run from `mobile/eval` against a task-owned Ollama on port 11439, with `MODEL=qwen3.8:27b-q4_K_M`, `MAXTOK_EXTRA=4096`, temperature 0 and seed 7:

```sh
ONLY=P01,P13,S05,R01,R07,P14,P15 node run.ts cleanup-qwen http://127.0.0.1:11439 /home/umer/lab-tmp/ov-cleanup-spelling/eval.json
node score.ts /home/umer/lab-tmp/ov-cleanup-spelling/eval.json
```

On that prior implementation, P01, P13, S05, R01 and R07 passed, as did the exact Cleaned up cases P14 and P15: 7/7 cases, 12 cards, 100% safe and 100% voice. Raw answers and scores are in that scratch directory. The task-owned server was stopped afterward. No device build or visual capture was performed; the requested single before/after screenshot pair remains for firstmate's merge-time device check.

Review regression coverage includes both writer entry points, initial acceptance and retry, apostrophe/casing-only writer corrections, overlapping repeated misspellings, advisory grammar, capitalised words, ambiguous suggestions and acceptance guards. P14-P15 expectations now follow the authorized scope; P16 adds the right-hand sentence. The previous host results above do not validate these revised cases. The outer validation/PR phases must rerun host eval and include its current numbers and the before/after right-hand sentence in the PR body.

Review-fix focused verification: TypingTest, PolishTest, DraftsTest and ChatGPT responses passed; the initial five-file run passed 144/145 tests, exposing an obsolete casing expectation in the phone dash fixture. After aligning that fixture's original and answer casing, all 44 phone-writer tests passed. Across the five focused files, all 145 tests now pass. No full suite, lint, host eval, device, push, PR or CI phase was run here.

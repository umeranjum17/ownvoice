# Cleaned up applies safe local fixes

Both writers share `src/core/polish.ts`, which applies the existing typing rules to their Cleaned up answers before acceptance. Automatic spelling fixes cover only unknown lowercase words in the explicit map (`shoud` → `should`, `teh` → `the`, `recieve` → `receive`) or words with exactly one dictionary suggestion. Ranked suggestions remain available for a person’s per-slip Fix, but never decide automatic cleanup. Spelling corrections run first; repeated function-word runs are then removed using the same small explicit list, lowercase-first condition and protected whole-word boundaries. The explicit `Its`/`its` before the whole word `a`, `an` or `the` rule also applies automatically, preserving case. Other grammar guesses stay advisory in **Check these**, with the person's per-slip **Fix**. The cleanup preserves corrections already made by the writer. Whole-word matching protects names, handles, tags, URLs and emails, and overlapping deletion/replacement ranges cannot corrupt the text. The shared acceptor retains real apostrophe/casing changes while preserving layout, number/time, shown-version duplicate and avoid-list guards.

Before: `Its a good plan, I shoud be there by the the evening.`

Host writer + cleanup: `It's a good plan, I should be there by the evening.`

An unchanged writer answer now gets the explicit article-context apostrophe fix as well as the automatic spelling and doubled-word fixes. P14/P15 require `It's`. The proper-noun case preserves `Umer`. P16 requires `Keep your right hand warm. I should leave.` from `Keep your right hand warm. I shoud leave.`

Historical validation, before both the spelling-safety and cleanup-order changes below, on recovered candidate `bd4e274`: lint and typecheck passed; Jest passed 49 suites, 840 tests and 46 snapshots. Tests exercise both writers, initial acceptance and retry, apostrophe/casing-only writer fixes, overlapping repeated misspellings, advisory grammar, capitalised words, ambiguous suggestions, protected tokens and the real eval scorer. The existing SettingsTest fetch mock lost an unnecessary cast to resolve its overload mismatch; behavior is unchanged.

Historical host eval, before the spelling-safety, cleanup-order and article-context apostrophe changes, ran from `mobile/eval` with isolated HOME under `/home/umer/lab-tmp/ov-cleanup-spelling`, a task-owned Ollama on port 11439, `MODEL=qwen3.8:27b-q4_K_M`, `MAXTOK_EXTRA=4096`, temperature 0 and seed 7:

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

## Article-context correction and focused test coverage

The latest selected test finding authorizes only `Its`/`its` immediately before the whole word `a`, `an` or `the` as an automatic grammar correction. An unchanged writer answer `Its a good plan, Umer shoud be there by the the evening.` now becomes `It's a good plan, Umer should be there by the evening.`. `Its own engine` remains unchanged. The three-entry spelling map, exactly-one-dictionary-suggestion condition, supported repetition list and protected-token boundaries remain intact. Writer-supplied apostrophes survive. Earlier host numbers precede this latest change.

Covering Jest tests for the PR body:

- TypingTest: `all local fixes keep names, links, slang, list markers and numbers`, `automatic apostrophe cleanup is narrow`, `automatic spelling requires a single clear suggestion`, and `automatic doubles use complete unprotected function words`.
- PolishTest: `polish accept/fix cleans unchanged original text`, `polish accept/fix corrects only remaining automatic slips`, and `polish accept/fix preserves repeated names and handles`.
- phoneWriter: `Cleaned up fixes slips and keeps the rest`, `phone cleanup preserves`; responses: `ChatGPT Cleaned up uses the local fixes`, `ChatGPT cleanup preserves`. These execute both adapters with supplied writer answers.
- DraftsTest verifies layout, number/time and duplicate guards; EvalScoreTest executes the real scorer and rejects missing apostrophes, spelling fixes and repetition removal.

Reproduction: the updated TypingTest and PolishTest failed 7 assertions before the rule was added. Focused verification afterward passed **6 suites, 219 tests** (TypingTest, PolishTest, responses, phoneWriter, DraftsTest and EvalScoreTest). No lint, typecheck or full-suite run was performed in this assigned test phase.

Fresh host eval on this candidate used isolated HOME and a reflink copy of the existing model store under worktree-owned `.lab-cleanup`, with `MODEL=qwen3.8:27b-q4_K_M`, `MAXTOK_EXTRA=4096`, temperature 0 and seed 7. The workspace boundary supersedes the earlier external scratch location. From `mobile/eval`: `ONLY=P14,P15,P16,P17,P18,P19 node run.ts cleanup-article-rule http://127.0.0.1:11439 ../../.lab-cleanup/eval.json`, then `node score.ts ../../.lab-cleanup/eval.json`. Result: **5/6 cases, 6 Cleaned up cards, 83% safe and 83% voice**; P14-P18 passed their exact sentences. The five unrelated model/prompt gate cases were skipped in this focused local test phase.

P19 failed that historical live-writer qualification: its raw Cleaned up answer changed `woud` to `wood` and inserted a comma after `@will`, yielding `Bring wood for the fire. We should visit Bora Bora. Give Ben Ben's keys. Hey @will, will you join us? Its own engine runs. I should leave.`. Automatic cleanup did not cause these differences. The exact safety fixture remains strict. The task-owned server was stopped and transient model copies, HOME, logs and generated scoring outputs were removed. No live Android validation was requested or performed.

## Protected-word fallback

The latest authorized fix makes the shared Cleaned up acceptance and retry discard writer answers that change protected tokens or original capitalised name-like words, including their order and repeated occurrences. That card instead uses the original text with only approved local fixes, passed through the existing acceptance guards. Handles, tags, links, emails and number/time tokens are compared exactly, including adjacent punctuation; the historical P19 answer above therefore falls back deterministically. Capitalised words are protected conservatively, except `I` and its contractions and `Its`/`It's`, so writer-supplied apostrophes survive. Newly capitalised sentence words remain allowed. Other cards keep their existing behavior, and a writer-supplied `wood` correction without a protected-word change remains allowed under the earlier decision.

Reproduction: `PolishTest`'s `polish accept/fix falls back to local fixes when the writer changes protected wording` failed before the guard, displaying changed `@bill` and shortened `Bora`. It now covers names, repeated names, handles, punctuation beside handles, tags, URLs, emails and times on both acceptance methods. The existing `Cleaned up fixes slips and keeps the rest` and `ChatGPT Cleaned up uses the local fixes` tests now also feed changed `Bora Bora` and `@will` through both adapters and assert the local-only card lands. The scenario test names listed above remain the PR coverage map. List tests now expect local-original fallback when a writer drops protected numbers; the layout-retry test retains numbers while flattening lines so it still exercises the layout guard.

Focused verification: TypingTest, PolishTest, responses, phoneWriter, DraftsTest and EvalScoreTest passed **6 suites, 223 tests**. No lint, typecheck, broad suite or live driving was run in this assigned phase. A fresh host rerun was not possible because the isolated store lacks `qwen3.8:27b-q4_K_M`; no model was provisioned, as instructed. Earlier host evidence precedes this guard. The protected-word failure in P19 is now enforced by the deterministic guard and its behavioral tests, rather than claimed as a fresh host pass.

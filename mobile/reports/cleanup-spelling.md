# Cleaned up applies safe local fixes

The current cleanup contract is owned by [Cleaned up acceptance](../README.md#cleaned-up-acceptance); the exact-output fixtures are documented in the [eval threshold rule](../eval/README.md#threshold-rule). This report records validation evidence and the covering Jest tests for the PR body. All recorded behavioral verification below predates the final local-only implementation, protected-dash normalization and polish fallback/status fixes; it does not qualify the current candidate.

Historical validation, before the spelling-safety, cleanup-order, article-context and protected-word changes, on recovered candidate `bd4e274`: lint and typecheck passed; Jest passed 49 suites, 840 tests and 46 snapshots. Tests exercise both writers, initial acceptance and retry, apostrophe/casing-only writer fixes, overlapping repeated misspellings, advisory grammar, capitalised words, ambiguous suggestions, protected tokens and the real eval scorer. The existing SettingsTest fetch mock lost an unnecessary cast to resolve its overload mismatch; behavior is unchanged.

Historical host eval, before the spelling-safety, cleanup-order, article-context apostrophe and protected-word changes, ran from `mobile/eval` with isolated HOME under `/home/umer/lab-tmp/ov-cleanup-spelling`, a task-owned Ollama on port 11439, `MODEL=qwen3.8:27b-q4_K_M`, `MAXTOK_EXTRA=4096`, temperature 0 and seed 7:

```sh
ONLY=P01,P13,S05,R01,R07,P14,P15,P16 node run.ts cleanup-final-qwen http://127.0.0.1:11439 /home/umer/lab-tmp/ov-cleanup-spelling/eval-final.json
node score.ts /home/umer/lab-tmp/ov-cleanup-spelling/eval-final.json
```

Historical before/after for the PR: `Its a good plan, I shoud be there by the the evening.` → `It's a good plan, I should be there by the evening.`

All five required gate cases and P14-P16 passed: **8/8 cases, 13 cards, 100% safe and 100% voice**. Raw answers and scores are in `eval-final.json` and `scores-final.json` in that scratch directory. The task-owned server was stopped afterward.

No-mistakes review caught and fixed apostrophe/casing-only changes being dropped, unsafe overlapping edits, broad advisory-grammar automation, name/token deletion and overly restrictive eval expectations. The first run passed review and focused tests, then failed with an agent I/O error; guarded recovery preserved both fix commits before this full validation. No device build or visual capture was performed; live product driving was unavailable in this run, and coverage used supplied-answer Jest tests instead.

Historical focused verification after the spelling-safety change, before the cleanup-order change: `npm test -- --runTestsByPath src/core/__tests__/TypingTest.test.ts src/core/__tests__/PolishTest.test.ts src/chatgpt/__tests__/responses.test.ts src/panel/__tests__/phoneWriter.test.ts` passed **4 suites, 166 tests**. This exercises the bundled dictionary and both writer pipelines with supplied answers; it does not establish live writer quality.

Historical focused verification after the cleanup-order change: `npm test -- --runTestsByPath src/core/__tests__/TypingTest.test.ts src/core/__tests__/PolishTest.test.ts src/chatgpt/__tests__/responses.test.ts src/panel/__tests__/phoneWriter.test.ts --silent` passed **4 suites, 174 tests**. This verifies the bundled dictionary, acceptance/retry methods and both writers with supplied answers; earlier host eval evidence predates the cleanup-order change.

## Current test coverage

Covering Jest tests for the PR body (names checked against the current source; no new test run is claimed):

- TypingTest: `all local fixes keep names, links, slang, list markers and numbers`, `automatic apostrophe cleanup is narrow`, `automatic contractions fix clear forms and preserve ambiguous ones`, `correction tables do not inherit object keys`, `automatic spelling requires a single clear suggestion`, and `automatic doubles use complete unprotected articles`.
- PolishTest: `polish %s ignores writer cleanup and shows only local fixes` covers accept/fix, swapped noon/midnight, changed names/handles and the original message; `local cleanup leaves advisory wording unchanged and preserves other writer slots`, `local cleanup keeps protected dashes with no-dashes enabled`, and `unchanged requires writer evidence through %s` cover preservation and status.
- phoneWriter: `Cleaned up fixes slips and keeps the rest`, `phone cleanup preserves`; responses: `ChatGPT Cleaned up uses the local fixes`, `ChatGPT cleanup preserves`. These execute both adapters with supplied writer answers.
- DraftsTest verifies layout, number/time and duplicate guards; EvalScoreTest executes the real scorer and rejects missing apostrophes, spelling fixes and repetition removal. WriterRouteTest: `polish retains %i usable primary cards without phone fallback` and `empty or blank polish still falls back and partial replies stay incomplete`; responses: `two valid ChatGPT polish cards survive fallback routing: $typed`; phoneWriter: `flattened versions losing numbers leave no accepted cards` and `only writer evidence of unchanged text marks an already-minimal list unchanged`.

## Historical article-context verification

Reproduction: the updated TypingTest and PolishTest failed 7 assertions before the rule was added. Focused verification afterward passed **6 suites, 219 tests** (TypingTest, PolishTest, responses, phoneWriter, DraftsTest and EvalScoreTest). No lint, typecheck or full-suite run was performed in this assigned test phase.

Historical host eval after the article-context correction and before the protected-word guard used isolated HOME and a reflink copy of the existing model store under worktree-owned `.lab-cleanup`, with `MODEL=qwen3.8:27b-q4_K_M`, `MAXTOK_EXTRA=4096`, temperature 0 and seed 7. The workspace boundary supersedes the earlier external scratch location. From `mobile/eval`: `ONLY=P14,P15,P16,P17,P18,P19 node run.ts cleanup-article-rule http://127.0.0.1:11439 ../../.lab-cleanup/eval.json`, then `node score.ts ../../.lab-cleanup/eval.json`. Result: **5/6 cases, 6 Cleaned up cards, 83% safe and 83% voice**; P14-P18 passed their exact sentences. The five unrelated model/prompt gate cases were skipped in this focused local test phase.

P19 failed that historical live-writer qualification: its raw Cleaned up answer changed `woud` to `wood` and inserted a comma after `@will`, yielding `Bring wood for the fire. We should visit Bora Bora. Give Ben Ben's keys. Hey @will, will you join us? Its own engine runs. I should leave.`. Automatic cleanup did not cause these differences. The exact safety fixture remains strict. The task-owned server was stopped and transient model copies, HOME, logs and generated scoring outputs were removed. No live Android validation was requested or performed.

## Historical protected-word fallback

An earlier shared guard addressed the historical P19 failure above. That guard was subsequently removed; the current implementation is documented in [Cleaned up acceptance](../README.md#cleaned-up-acceptance).

Reproduction: `PolishTest`'s `polish accept/fix falls back to local fixes when the writer changes protected wording` failed before the guard, displaying changed `@bill` and shortened `Bora`. At that stage it covered names, repeated names, handles, punctuation beside handles, tags, URLs, emails and times on both acceptance methods. At that stage the `Cleaned up fixes slips and keeps the rest` and `ChatGPT Cleaned up uses the local fixes` tests also fed changed `Bora Bora` and `@will` through both adapters and asserted the local-only card landed. List tests then expected local-original fallback when a writer drops protected numbers; the layout-retry test retained numbers while flattening lines to exercise the layout guard.

Recorded verification after the protected-word guard: TypingTest, PolishTest, responses, phoneWriter, DraftsTest and EvalScoreTest passed **6 suites, 223 tests**. No lint, typecheck, broad suite or live driving was run in this assigned phase. A fresh host rerun was not possible because the isolated store lacks `qwen3.8:27b-q4_K_M`; no model was provisioned, as instructed. Earlier host evidence precedes this guard. At that stage the deterministic guard and its behavioral tests covered P19; this was not a fresh host pass.

For the final implementation, see [Cleaned up acceptance](../README.md#cleaned-up-acceptance). The earlier host evidence predates that implementation; no fresh host rerun was performed during review. For the current scope of P19 evidence, see the [eval threshold rule](../eval/README.md#threshold-rule).

# Cleaned up applies the local fixes

Reproduced with the real phone-writer entry point and an unchanged writer answer: the original was dropped with no corrected card. Both writers now share `src/core/polish.ts`, using `typing.ts`'s existing slips and exact suggestions. When fixable slips exist, slot 0 uses the original with those fixes only. Other slots and already-clean originals retain the writer's ordinary path. Existing duplicate, number/time and layout checks remain in place.

Before: `Its a good plan, I shoud be there by the the evening.`

After: `It's a good plan, I should be there by the evening.`

The proper-noun variant preserves `Umer`. Jest exercises both writer entry points with unchanged answers and the real bundled dictionary; the core check also covers slang, links, list markers and numbers. The dash fixture now starts with correct casing so that it continues testing dash removal independently. Typecheck exposed an existing fetch mock overload mismatch in `SettingsTest`; removing the unnecessary cast retains its behavior and passes typecheck.

Validation: `npm run lint`, `npm run typecheck`, and `npm test -- --ci --silent` in `mobile` passed (47 suites, 769 tests, 46 snapshots). All commands used an isolated HOME under `/home/umer/lab-tmp/ov-cleanup-spelling`.

Host writer eval, run from `mobile/eval` against a task-owned Ollama on port 11439, with `MODEL=qwen3.8:27b-q4_K_M`, `MAXTOK_EXTRA=4096`, temperature 0 and seed 7:

```sh
ONLY=P01,P13,S05,R01,R07,P14,P15 node run.ts cleanup-qwen http://127.0.0.1:11439 /home/umer/lab-tmp/ov-cleanup-spelling/eval.json
node score.ts /home/umer/lab-tmp/ov-cleanup-spelling/eval.json
```

P01, P13, S05, R01 and R07 passed, as did the exact Cleaned up cases P14 and P15: 7/7 cases, 12 cards, 100% safe and 100% voice. Raw answers and scores are in that scratch directory. The task-owned server was stopped afterward. No device build or visual capture was performed; the requested single before/after screenshot pair remains for firstmate's merge-time device check.

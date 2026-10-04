# Mobile test diet: frozen covered-area plan

Baseline: `f4101baf5394da89b399c5cf27488eb161339b55` (2026-10-04).
Model: `openai-codex/gpt-6.1-sol`; no weaker fallback or delegation.

## Inventory and package order

1. **mobile**: 56 Jest suites, **998 executed/passed cases**, not the previous 1010. Static discovery: 64 test files / 611 declarations across Jest, native Kotlin and one host driver test. Parameterized tests expand declarations, so these numbers are not interchangeable.
2. **native app**: 8 Kotlin test files / 62 static `@Test` declarations, including instrumentation; not executed in this lane.
3. **packages/engine**: 5 Node test files / **40 executed/passed cases** (also 40 static declarations).

Mobile executed areas: core 353, agent 163, screens 137, panel 133, ChatGPT 122, UI 48, rewrite 24, grow 18. Mobile Kotlin and root Kotlin are separate from the 998; pre-existing build reports are not current execution evidence. Native counts are estimates until allocated-device/Gradle qualification.

## Existing consumer journeys, before deletion

- `packages/engine/test/protocol.test.mjs`: spawns the real compiled `ownvoice-engine` CLI, sends JSON over stdin, parses stdout. Existing `check flags stock phrasing and fits the cap` drives clean text, four stock phrases, extracted spans and length bounds. No AI or supplied writer answer is involved.
- Its other process journeys cover rules/fact checks, platform briefs, voice import/guide and lossless thread splitting. Engine helper/bundle tests and mocked release tests are **not** counted as e2e proof.
- `mobile/e2e/{driver,first-run,settings,rn08,overlay-proof,proof-prefill,signin-wait}.mjs` drive native/UI journeys. They require an allocated emulator; no current lifetime allocation exists here. Historical screenshots/reports do not qualify today's candidate. `rn08-setup.test.mjs` uses fake adb, not actual app e2e.
- `mobile/eval/run.ts` drives writing through a model endpoint; no new model allocation, no canned AI accepted. Not used for this deterministic slice.

## Frozen conversion: stock-phrase check only

Delete exactly three redundant cases from `mobile/src/core/__tests__/SlopTest.test.ts`: `stockPhrases`, `plainReplyIsClean`, `hitSpansPointAtThePhrase`.

`mobile/src/core/slop.ts` only re-exports `ownvoice-engine/src/slop.ts`. The real CLI's `check` consumes that exact source's `hits`, `score` and `words`; its already-existing process journey guards clean output, stock output and correct extracted spans. This is shared-core consumer proof, **not native/mobile UI acceptance**. No mobile-specific routing or rendering is being removed.

Do not broaden to contrast/list/flattery/dash checks or model-score blending: their exact semantics lack equivalent current CLI assertions. Preserve every invented-time and number guard in this file, conservatively treating changed/dropped facts as data-loss-sensitive. All consent, credential, signed-switch, privacy, text insertion and thread-loss guards elsewhere stay byte-identical. No tests added, no production/dependency/config changes.

Expected executed host count: mobile **998 → 995**, engine **40 → 40**, combined **1038 → 1035**. The modest scope is deliberate: no unallocated native journey and no new tests for a journey already covered. Larger UI/mock-heavy conversion needs a current emulator allocation or another supported real consumer instrument first.

## Qualification and delivery

Re-run complete mobile Jest and engine Node suites, the existing real CLI process journey, lint/typecheck, and compare production/source hashes. Use isolated HOME/XDG, installed runtimes, and the home heavy-job lock. Publish before/after counts, critical guards and limits in the report/PR; direct ready PR plus normal CI, no independent reviewer/no-mistakes. No phone, personal apps, credential copying, upstream patches or port 8090.

Oct 4 release goal remains; previous missed targets and the older 1010/40 qualification are historical, not renewed native release acceptance. Current task target is 2026-10-04T03:53:00Z.

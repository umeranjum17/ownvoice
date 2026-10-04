# Stock-phrase duplicate test removal

## Counts and scope

| Executed host suite | Before | After | Failures |
|---|---:|---:|---:|
| Mobile Jest (56 suites) | 998 | 995 | 0 |
| Engine Node tests (5 files) | 40 | 40 | 0 |
| Combined distinct cases | 1038 | 1035 | 0 |
| Selected SlopTest file | 22 | 19 | 0 |

The focused rerun of the existing CLI case passed 1/1; it is already included in the 40, not an extra case. No tests added. Static repository test declarations: 713 → 710 (mobile 611 → 608, root native 62 unchanged, engine 40 unchanged). Static counts are not executed totals: Kotlin suites and the fake-adb host driver test were not run. Historical mobile1010/engine40 is not today's baseline.

This PR deletes only stock-phrase, clean-text and span-extraction duplicates. It does not claim that the rest of mobile has been converted. The frozen plan was shared with firstmate before deletion/commit. The smaller reduction avoids deleting unqualified native/UI coverage to chase a count target.

## Real consumer proof

Ran the existing `packages/engine/test/protocol.test.mjs` case `check flags stock phrasing and fits the cap (SlopTest, PlatformsTest)` before and after conversion, plus a focused candidate rerun:

```sh
cd packages/engine
node node_modules/typescript/bin/tsc -p tsconfig.build.json
node --test 'test/*.mjs'
node --test --test-name-pattern='check flags stock phrasing and fits the cap' test/protocol.test.mjs
```

The case launches the real compiled CLI process, sends JSON stdin and checks parsed stdout. Clean text returns no stock/voice flags and `Sounds natural`; four actual stock phrases (`delve`, `game-changer`, `seamless`, `cutting-edge`) return their exact extracted text and `A bit stock`. The extreme length control sends 281 characters to X's 280 cap and checks `fits: false` and the actual length. This is deterministic consumer behavior, not renamed helper tests, a mocked transport or canned AI output.

Mobile's `src/core/slop.ts` is solely a re-export of the same engine `src/slop.ts` consumed by this CLI. Thus this proof qualifies the shared-core slice, not native mobile routing/rendering or writer quality. No APK built/installed, emulator started/driven, model loaded, phone touched or screenshots captured. Native journeys remain unqualified here because no current lifetime allocation was supplied. Full native release acceptance is explicitly **not claimed**.

## Preserved critical guards

All 11 time/number cases in SlopTest remain byte-identical: `inventedTimesIgnoresAddedMeridiem`, `inventedDayAbbreviations`, `inventedDottedMeridiem`, `inventedTimesFlagsMeridiemFlip`, `inventedTimesIgnoresBareCounts`, `inventedDayWords`, `inventedTimes`, `inventedTimesLowercaseSatSun`, `inventedTimesBareHour`, `inventedTimesMayMonth`, `addedNumbers`. These conservatively guard fact corruption/data-loss-sensitive wording. Nothing in consent, credentials/SecureStore, signed switches, privacy, native insertion, protected text or lossless threading was changed. Every other test file is byte-identical. No sole security, crypto or data-loss guard removed, so no no-mistakes stop was necessary.

## Commands and evidence

Intake verified `pwd -P` = git top-level = `/home/umer/.treehouse/ownvoice-92cfa5/6/ownvoice`, with 1.9 TiB available (>15 GiB). `/kun` ENTRY/TOOLS/OPINIONS/VOICE fetched/read; the explicit direct-PR/no-delegation brief overrides its generic workflow gates.

Direct installed Node v26.7.0 ran both baselines and candidate. HOME and XDG directories were isolated under `/home/umer/lab-tmp/ov-test-diet-mobile-364`; candidate heavy checks held `/tmp/fm-ownvoice-heavy.lock`. Mobile commands:

```sh
cd mobile
node node_modules/jest/bin/jest.js --runInBand --ci --json --outputFile=<evidence>/after-jest.json --cacheDirectory=<isolated-cache>/jest
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc --noEmit
```

Engine also passed `node node_modules/eslint/bin/eslint.js .` and `node node_modules/typescript/bin/tsc --noEmit`. All lint/typecheck exits 0 with empty logs. Initial engine baseline could not find its local TypeScript runtime; `npm ci --ignore-scripts --no-audit --no-fund` restored lockfile dependencies in this worktree (no manifest/lock/tool change), then its full baseline passed. No second failure or product repair.

Raw JSON, logs, source manifests, static inventory and fetched Kun inputs: `/home/umer/lab-tmp/ov-test-diet-mobile-364/evidence/`. They are local evidence, not publicly hosted media. The committed report and plan preserve the reproducible proof and limitations.

## Source identity (SHA-256)

Baseline commit: `f4101baf5394da89b399c5cf27488eb161339b55`.

| Scope | Before | After |
|---|---|---|
| Selected SlopTest source | `97860218d11f5e267faddf478aaca824a2cdfed12c37fca58cf6b000782ebe23` | `21298ee507043c176e0b17bcc2347994ddc820b999ac6dd676027501f63a7e39` |
| Sorted mobile/engine production-source manifest | `87224ad8dfb58881c4f7189b41edf820a91e1e6c3cfa76d53501daa0027bbeae` | identical |
| Sorted tracked mobile + engine/root test-area manifest | `6111f17d151cec7285a0f901823cea1d547e4b7b428e0ba3d84c72285f9e328e` | `15e7342bb7a672ddbf0a5d24d09f2f2550c724b92dd83cf5c843666e644fa48b` |

Unchanged consumer inputs: mobile re-export `d518d50b4eadfcc95443585cf4ec0fcbf5c325b1e4203a466816660ee12efce3`; engine slop source `4634f19fd91082ca79fc5ff275926269cc052617fa5fb98195a28d675e8f3d63`. Manifest digests hash sorted `sha256  path\n` rows. Git diff confirms only the three test-case deletions plus required plan/report documentation.

Oct 4 release goal and historical misses remain recorded in the frozen plan; this bounded host conversion does not renew release acceptance. No production change, new dependency, framework, upstream patch, reserved8090 use or independent reviewer.

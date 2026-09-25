# Ownvoice mobile scaffold

The Expo app is intentionally a placeholder; the native module and user flows land in later slices.

```sh
npm ci
npm run lint
npm run typecheck
npm test -- --ci
```

## Ported JVM test cases

| Kotlin suite | JVM cases | Jest cases |
| --- | ---: | ---: |
| JudgeTest | 12 | 12 |
| SlopTest | 12 | 12 |
| VoiceTest (voice-fixture.md) | 9 | 9 |
| PrivacyTest | 6 | 6 |
| OnboardingTest | 4 | 4 |
| RewriteTest (fm/ov-rewrite) | 9 | 9 |
| PlainWordsTest | 7 | 7 |
| **Total** | **59** | **59** |

The tests and type-check pass locally. Local npm `HOME` and npm cache were kept inside the worktree. No Gradle build or phone install was run for this slice; no installed tool configuration was changed.

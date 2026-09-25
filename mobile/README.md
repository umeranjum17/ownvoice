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
| VoiceTest (voice-fixture.md) | 9 | 10 |
| PrivacyTest | 6 | 6 |
| OnboardingTest | 4 | 4 |
| RewriteTest (fm/ov-rewrite) | 9 | 12 |
| PlainWordsTest | 7 | 7 |
| **Total** | **59** | **63** |

59 Kotlin cases were ported; four additional Jest regressions bring the current suite to 63 cases. The mobile Jest suite passes locally. No Gradle build or phone install was run for this slice; no installed tool configuration was changed.

# Ownvoice mobile app

The Expo app contains the TypeScript core and the Android-only `modules/ownvoice-native` accessibility bridge. The module owns the bubble, on-tap screen read, panel activity, and verified text insertion.

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
| RewriteTest (fm/ov-rewrite) | 9 | 14 |
| PlainWordsTest | 7 | 7 |
| **Total** | **59** | **65** |

59 Kotlin cases were ported; seven additional Jest regressions bring the current suite to 66 cases.

## Android build and device checks

Run `npx expo prebuild --platform android --no-install`, then build a release APK from `android/` with `./gradlew assembleRelease --no-daemon`. The local module is discovered from `modules/` by Expo autolinking. Release builds avoid the emulator's shared Metro port. `node e2e/driver.mjs <release-apk> [screenshots-dir]` requires `ANDROID_SERIAL=emulator-NNNN` and refuses phone serials. It installs the release APK, toggles service rebind after install, checks read-back logs for the React Native field and Chrome textarea/contenteditable, then saves four screenshots. The driver uses adb shell input, never UiAutomator (which unbinds accessibility services). Verify off/paused behavior with the home controls.

Use a throwaway `HOME`, npm cache, Gradle home and AVD home inside the worktree for local validation. Never install on the owner's phone or modify installed-tool configuration.

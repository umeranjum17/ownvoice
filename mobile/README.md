# Ownvoice mobile app

The Expo app contains the TypeScript core and an Android-only accessibility bridge in `modules/ownvoice-native`. This slice has a bubble that reads the focused field and visible screen text on tap, plus a transparent React Native drafts panel with temporary example replies. It is not yet the full on-device drafting experience described in the [main README](../README.md).

Turn on Ownvoice in Android accessibility settings from the app, then enable the app you want under **Where the bubble shows** (Ownvoice itself starts off). The bubble appears only in enabled apps while not paused or showing the panel. Tap it to choose **Insert** or **Copy**; insertion checks the field afterward and copies the draft if it fails. **Recent activity** shows a count of reads since the app process started, not a saved history. **Clear last screen** forgets the most recent capture.

```sh
npm ci
npm run lint
npm run typecheck
npm test -- --ci
```

## Checks

The ported core checks are in `src/core/__tests__/`; the example drafts have a check in `src/panel/__tests__/`. Run the commands above for the current suite.

## Android build and device checks

Run `npx expo prebuild --platform android --no-install`, then build a release APK from `android/` with `./gradlew assembleRelease --no-daemon`. The local module is discovered from `modules/` by Expo autolinking. Release builds avoid the emulator's shared Metro port. `node e2e/driver.mjs <release-apk> [screenshots-dir]` requires `ANDROID_SERIAL=emulator-NNNN`, `adb`, `tesseract` and ImageMagick's `magick` on PATH, and refuses phone serials. It installs the release APK, checks read-back logs for the React Native field and Chrome textarea/contenteditable, exercises paused/off bubble prevention and service rebind after reinstall, then saves screenshots in the requested directory (by default `e2e/artifacts`). The driver uses screenshot OCR to target controls, adb shell input and window dumps, never UiAutomator (which unbinds accessibility services).

Use a throwaway `HOME`, npm cache, Gradle home and AVD home inside the worktree for local validation. Never install on the owner's phone or modify installed-tool configuration.

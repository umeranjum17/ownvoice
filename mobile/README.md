# Ownvoice mobile app

The Expo app contains the TypeScript core and an Android-only accessibility bridge in `modules/ownvoice-native`. This slice has a bubble that reads the focused field and visible screen text on tap, plus a transparent React Native drafts panel with replies generated on the phone through ML Kit GenAI. The separate ChatGPT sign-in and writer helpers are not connected to the screen yet. This app is not yet a replacement for the full experience described in the [main README](../README.md).

Turn on Ownvoice in Android accessibility settings from the app, then enable the app you want under **Where the bubble shows** (Ownvoice itself starts off). The bubble appears only in enabled apps while not paused or showing the panel. Tap it to get drafts, then choose **Insert** or **Copy**; if the phone needs to prepare its writing model, the panel shows **Getting Ownvoice ready…** (with a percentage when available) before switching to **Writing…**, and failures appear in plain language. Insertion checks the field afterward and copies the draft if it fails. **Recent activity** adds newly collected tap counts when pressed; it is not a saved history. **Clear last screen** forgets the most recent capture.

```sh
npm ci
npm run lint
npm run typecheck
npm test -- --ci
```

## Checks

The ported core checks are in `src/core/__tests__/`; the phone writer has checks in `src/panel/__tests__/`. The ChatGPT response and switch helpers have tests in `src/chatgpt/__tests__/` and `src/core/__tests__/`. Run the commands above for the current suite.

## Android build and device checks

Run `npx expo prebuild --platform android --no-install`, then build a release APK from `android/` with `./gradlew assembleRelease --no-daemon`. The local module is discovered from `modules/` by Expo autolinking. Release builds avoid the emulator's shared Metro port. `node e2e/driver.mjs <release-apk> [screenshots-dir]` requires `ANDROID_SERIAL=emulator-NNNN`, `adb`, `tesseract` and ImageMagick's `magick` on PATH, and refuses phone serials. It installs the release APK, checks read-back for the React Native field and Chrome textarea/contenteditable, exercises paused/off bubble prevention and service rebind after reinstall, then saves screenshots in the requested directory (by default `e2e/artifacts`). The driver uses screenshot OCR to target controls, adb shell input and window dumps, never UiAutomator (which unbinds accessibility services).

Use a throwaway `HOME`, npm cache, Gradle home and AVD home inside the worktree for local validation. The automated driver is emulator-only; phone installs require explicit permission and must not replace the existing app. Do not modify installed-tool configuration.

## ChatGPT integration (not yet available in the app)

The sign-in helper uses byokit's device-code flow and Expo SecureStore for credentials; its sign-out helper calls byokit's logout. The streamed Responses writer requests three C2 rewrite versions from `gpt-6-sol`, using the text being rewritten, screen conversation and writing rules. If the writer fails or returns fewer than three drafts, `withPhoneFallback` can ask a supplied phone writer instead. The current screen uses the phone writer directly, not this fallback.

**Privacy if this integration is connected:** A ChatGPT rewrite sends the text being rewritten, screen context and any writing rules to OpenAI. That differs from the installed Kotlin app and this Expo screen, which keep writing on the phone. Checking the public remote switch makes a plain GET to GitHub without app-added identifiers; the network request still exposes ordinary connection information such as the device's IP address to the host. The switch accepts a signed newer sequence, caches the verified choice for six hours, and keeps the last verified choice when the fetch fails; before any verified flag, it defaults to on. No flag has been published at the switch URL yet. None of these network paths runs from the current app screen.

For an opt-in, outside-CI Responses proof using a throwaway copy of an existing sign-in, see [`scripts/live-proof.ts`](scripts/live-proof.ts) and its [recorded result](reports/live-proof.md). Do not pass the installed sign-in file directly or commit credentials.

To produce a switch flag offline, keep a 32-byte private signing key as hex outside this repository and, from `mobile/`, run `SWITCH_SEQ=1 node --experimental-strip-types scripts/sign-switch.ts /path/to/private-key off` (increment the sequence for later flags). This prints the signed JSON; it does not publish it. Never commit the private key.

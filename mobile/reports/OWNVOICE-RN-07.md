# Ownvoice React Native — home and settings release proof

Emulator: Pixel 7, Android 36, `emulator-5600` (lane-owned, non-Play image). Built a release APK with `EXPO_PUBLIC_E2E_STUB=1` for emulator acceptance; this flag is not for distribution.

Checks:

- `npm test -- --runInBand --silent`: 237 tests passed.
- `npx tsc --noEmit`: passed.
- `./gradlew assembleRelease --no-daemon -Dorg.gradle.jvmargs=-Xmx6144m`: passed.
- `ANDROID_SERIAL=emulator-5600 node e2e/first-run.mjs android/app/build/outputs/apk/release/app-release.apk reports/ov-rn-07`: light and dark setup through an inserted practice draft and home; checks visible wording and insertion.
- `ANDROID_SERIAL=emulator-5600 node e2e/settings.mjs reports/ov-rn-07`: home, app list, Your voice, picker import preview, read history in light and dark. The read entry persisted across release reinstall and restart; Wipe everything cleared it and the imported phrase. The log contains metadata, never message text.

The picker import is in this slice. Sharing a voice profile into Ownvoice is a separate slice and is not wired here.

Screenshots: [`reports/ov-rn-07/`](ov-rn-07/) contains `OWNVOICE-RN-07-light-*.png` and `OWNVOICE-RN-07-dark-*.png` for every screen; the same files were copied to the lane's muxr attachment directory. The capture is mechanical, without visual judgement.

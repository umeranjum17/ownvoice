# Restricted-setting help on the permission step (React Native app)

Part of the ownvoice verification map. Source: `mobile/src/ui/RestrictedHelp.tsx` (`useRestricted`, `RestrictedCard`), asked through `restrictedSettings` in `mobile/modules/ownvoice-native` (the `android:access_restricted_settings` app op, else the install source), shown by `mobile/app/setup.tsx` (PERMISSION), words in `packages/engine/src/words.ts` (`restricted*`).

## How to get to it (user POV)

Install Ownvoice from a downloaded file on Android 13 or later and reach "Let Ownvoice see your chats": Android greys out Use Ownvoice, and the step shows a card with the steps and Open App info above Turn on.

## Driving it

Harness: an owned Android emulator. Android surface, not covered by the Host CLI launch above.

1. Build a release APK with `EXPO_PUBLIC_E2E_DOWNLOAD=1` per `mobile/README.md` (the pretend download lets the phone choice reach the permission step).
2. Run `node mobile/e2e/restricted-setting.mjs <apk> <out-dir>` with `ANDROID_SERIAL` and `OWNVOICE_AVD_NAME` set (or the `restricted-setting-help` journey). adb installs are trusted, so each pass installs the APK the way a person does: pushed to Downloads, opened from Files, Android's installer, **Install** (a local-file install; the driver checks `packageSource` is 3 or 4). It then taps through Android's "App was denied access" message on the greyed row, **Open App info**, the three-dot **Allow restricted settings**, and **Turn on** with **Use Ownvoice** and **Allow**; it checks the restricted-settings op moves default, ignore, allow, and fails if the card's words, its re-check after each return, or setup moving on are missing. Android 15+ keeps the op from the app, so there the card keeps all five steps until the switch is on; on 13 and 14 it drops the try step and says "That worked" (that branch is not yet proven on an emulator). Light at font 1.0, dark at 1.3.
3. Capture: `<light|dark-large>-0N-*.png` plus `steps.json` in `<out-dir>`.

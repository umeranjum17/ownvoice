# Restricted-setting help on the permission step (React Native app)

Part of the ownvoice verification map. Source: `mobile/src/ui/RestrictedHelp.tsx` (`useRestricted`, `RestrictedCard`), asked through `restrictedSettings` in `mobile/modules/ownvoice-native` (the `android:access_restricted_settings` app op, else the install source), shown by `mobile/app/setup.tsx` (PERMISSION), words in `packages/engine/src/words.ts` (`restricted*`).

## How to get to it (user POV)

Install Ownvoice from a downloaded file on Android 13 or later and reach "Let Ownvoice see your chats": Android greys out Use Ownvoice, and the step shows a card with the steps and Open App info above Turn on.

## Driving it

Harness: an owned Android emulator. Android surface, not covered by the Host CLI launch above.

1. Build a release APK with `EXPO_PUBLIC_E2E_DOWNLOAD=1` per `mobile/README.md` (the pretend download lets the phone choice reach the permission step).
2. Run `node mobile/e2e/restricted-setting.mjs <apk> <out-dir>` with `ANDROID_SERIAL` and `OWNVOICE_AVD_NAME` set (or the `restricted-setting-help` journey). adb installs are trusted, so the driver sets the app op to `deny`, the state a file install leaves. It taps through the greyed switch and Android's message, App info's three-dot menu and **Allow restricted settings**, checks the op moves errored, ignored, allowed, and fails if the card's words, its re-check after each return, or setup moving on after Turn on are missing. Light at font 1.0, dark at 1.3.
3. Capture: `<light|dark-large>-0N-*.png` plus `steps.json` in `<out-dir>`.

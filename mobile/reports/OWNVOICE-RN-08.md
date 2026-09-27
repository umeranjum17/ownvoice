# Slice 8 emulator evidence status

The earlier light/dark screenshots were removed because they predate the rewrite-verdict and Why? alignment fixes. No current-candidate release-build screenshots are recorded here.

The OCR-only acceptance driver is `mobile/e2e/rn08.mjs`. It requires `ANDROID_SERIAL` to identify an emulator and `OWNVOICE_AVD_NAME` to match `adb emu avd name` before making device changes. It checks direct process-text and share intents and uses the selection-menu chooser for the editable Replace path.

The current candidate still needs an owned AVD, an emulator-only release APK built with `EXPO_PUBLIC_E2E_STUB=1`, and a fresh driver run for visual evidence. Never distribute the flagged build.

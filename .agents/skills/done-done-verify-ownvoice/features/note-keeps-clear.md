# The note and bubble keep clear of the message box (Android)

Source: `mobile/modules/ownvoice-native/android/src/main/java/dev/ownvoice/bridge/OwnvoiceService.kt`
(`finishInsert`, `sendBounds`, `say`) and the `@platform-kits/overlay` kit's `ServiceBubble.keepClear`.
This is an Android surface; the Host CLI launch alone does not prove it.

## Drive

1. Use an owned emulator, one lane at a time. Build two stub+GPT release APKs per `mobile/README.md`
   (`EXPO_PUBLIC_E2E_STUB=1 EXPO_PUBLIC_E2E_GPT=1 EXPO_PUBLIC_E2E_AUTH_BASE=http://10.0.2.2:21455`): the base
   (`BEFORE_APK`) and this change (`APK`).
2. Run the `note-clear` journey in `.done-done.yaml`. It finishes setup on the base build, then runs
   `mobile/e2e/own-post.mjs` at 720x1280 with the largest text, light and dark: one line in the X-style
   composer, **Copy** on the panel, then edit a version and **Use this**. After Copy and after Use this it
   takes screenshots until the note shows, reads the note's box by OCR and the composer field and its Post
   button from the accessible tree, and writes `note-boxes-<label>-<theme>.json`. The base run only logs;
   the change's run fails when a note covers the field or the button. Nothing is posted.

## Evidence

Cite the `copied-*` and `inserted-*` PNGs from `before/` and `after/`, and the four `note-boxes-*.json`.
The journey proves the X-style fixture only, not the real X, Chrome or chat app layouts.

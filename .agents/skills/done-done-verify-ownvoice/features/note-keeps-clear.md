# The note and bubble keep clear of the message box (Android)

Source: `mobile/modules/ownvoice-native/android/src/main/java/dev/ownvoice/bridge/OwnvoiceService.kt`
(`say`, `sayPending`, `clearBoxes`, `renewClear`, `finishInsert`, `sendBounds`) and the `@platform-kits/overlay`
kit's `ServiceBubble.keepClear`.
This is an Android surface; the Host CLI launch alone does not prove it.

## Drive

1. Use an owned emulator, one lane at a time. Build two stub+GPT release APKs per `mobile/README.md`
   (`EXPO_PUBLIC_E2E_STUB=1 EXPO_PUBLIC_E2E_GPT=1 EXPO_PUBLIC_E2E_AUTH_BASE=http://10.0.2.2:21455`): the base
   (`BEFORE_APK`) and this change (`APK`).
2. Boot with `-gpu guest -feature -WiFiPacketStream,-Uwb` (the journey turns the guest's Wi-Fi off). Run the
   `note-clear` journey in `.done-done.yaml`. It finishes setup on the base build, picks **On this phone** (the stub
   build's phone writer) in the app, then runs `mobile/e2e/own-post.mjs` with the largest text, light and dark, at
   360 dp for the base and 360, 390 and 445 dp for the change (`OWN_POST_DP`): one line in the X-style composer,
   **Copy** on the panel, then edit a version and **Use this**. After Copy and after Use this it waits until the
   panel's own text has left the screen (the panel's window node lingers, and the note draws behind it), then
   screenshots until the note shows. The note's box is read from the accessible tree (the pill is a view in an
   accessibility-overlay window) or by OCR of that same screenshot (a system toast is in no tree), and
   `note-boxes-<label>-<theme>.json` records `foundBy`, the note, the composer field and the Post button with the
   overlap verdict. The base run only logs; the change's run fails when a note covers the field or the button.
   Nothing is posted.

## Evidence

Cite the `copied-*` and `inserted-*` PNGs from `before/` and `after/`, and the `note-boxes-*.json`.
The journey proves the X-style fixture only, not the real X, Chrome or chat app layouts.

Known limits of this journey (seen 25 Oct): the note holds for 4 s after the panel closes, so a leg whose panel
takes longer to leave the screen misses it and fails with "never showed". The Inserted note was
still measured over the composer at 360 and 390 dp on the build proven at 445 dp, which is why the field's box
is now measured when the draft is read (`Capture.fieldBox`) instead of when the note is said.

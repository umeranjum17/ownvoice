# Reply drafts

> Known limit in 1.0.3: generic reply cards are withheld per the accepted scope cut (see [Reply ideas, one tap away](../../../../README.md#reply-ideas-one-tap-away)). The procedure below describes earlier behavior, not this release.

Tap the bubble over a chat with an empty message field and Ownvoice offers short replies shaped to the app underneath; cards stream in as drafts land and each can be edited before use, rated, or sent through the app's own compose screen, and **Why?** explains a card's checks. **Insert** puts one in the field, **Copy** copies it (both Copy and the compose hand-off stay disabled while a missing-fact warning shows). With the emulator stub build, three fixed drafts are written without changing device settings.

## Sub-features

- `reply-offer`: bubble tap in an enabled app shows reply cards (chat headings name the person or stay generic; X/Reddit panels name the platform).
- `reply-insert`: Insert writes the draft into the focused field and verifies it afterward; **Edit** rewrites a card first.
- `reply-copy`: Copy places the draft on the clipboard; Copy and the compose hand-off stay disabled while a missing-fact warning shows.
- `reply-extras`: per-card tone line, **Why?** checks display and ratings.
- `reply-paused`: paused/off states show no bubble.

## How to get to it (user POV)

- Tap into a message box in an app switched on under **Where the bubble shows**, then tap the Dot bubble.
- Use **Write new ones** for another attempt; **Insert** a card even while others load; **Edit** a card before inserting it.

## Driving it with mobile/e2e/driver.mjs

Preconditions:

- Explicit emulator allocation; a release APK built with `EXPO_PUBLIC_E2E_STUB=1`; `ANDROID_SERIAL=emulator-NNNN`, `OWNVOICE_AVD_NAME=<its AVD>`, `JAVA_HOME`, SDK via `ANDROID_HOME`, `adb`/`zip`/`tesseract`/`magick` on `PATH`.

- **Install and drive.** `node e2e/driver.mjs <release-apk> [screenshots-dir]` installs on the throwaway emulator, walks setup, enables the service (with the documented off/on rebind), taps the bubble in a chat field, and reads back inserted text from the React Native field plus Chrome's textarea/contenteditable.
- **Paused/off prevention.** The driver exercises paused and service-off states asserting no bubble.
- **Proof.** Screenshots land in the requested directory (default `e2e/artifacts`); copy the ones showing cards and read-back into `verify-artifacts/<task>/reply-drafts/` with the driver log (stable per-task folder — see the skill's Review evidence).

## Gotchas

- The driver refuses phone serials and verifies the AVD name — never point it elsewhere.
- `uiautomator dump` unbinds the service; the driver's own probe sets `FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES`.
- After any reinstall the service needs the off/on `enabled_accessibility_services` toggle (the driver does this).
- Panel controls swallow `adb input tap` — drive cards and buttons with DPAD (`input keyevent 19/20/21/22`) + ENTER (`keyevent 66`); see the skill's Review evidence.
- Insertion into Chrome retries 13×150 ms because Chrome refuses `ACTION_SET_TEXT` under an overlay; a failed insert falls back to Copy.

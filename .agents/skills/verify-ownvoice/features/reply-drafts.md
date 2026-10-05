# Reply drafts

Tap the bubble over an empty message box when the screen shows a readable post or message above it and Ownvoice offers reply cards shaped to the app underneath; each card can be edited before use, rated, or sent through the app's own compose screen, and **Why?** explains a card's checks. **Insert** puts one in the field, **Copy** copies it (both Copy and the compose hand-off stay disabled while a missing-fact warning shows). With the emulator stub build, three fixed drafts are written without changing device settings. When nothing readable sits above the box (an image-only post, a label-only compose screen), the panel shows the plain withhold note instead: no card, no writer call, nothing invented.

## Sub-features

- `reply-offer`: bubble tap with an empty box over a readable post shows reply cards (chat headings name the person or stay generic; X/Reddit panels name the platform, including Chrome when the URL bar identifies the site).
- `reply-withhold`: a post with no text to ground on shows the plain unavailable note before any writer runs; nothing is invented.
- `reply-insert`: Insert writes the draft into the focused field and verifies it afterward; **Edit** rewrites a card first.
- `reply-copy`: Copy places the draft on the clipboard; Copy and the compose hand-off stay disabled while a missing-fact warning shows.
- `reply-extras`: per-card tone line, **Why?** checks display and ratings.
- `reply-grow`: a reply typed under an X or Reddit post shows **Suggested replies · X/Reddit** with **Yours** kept and the cards built on that point, ordered by their fit level once it answers (slot order without one). Drive it like `reply-fit` with typed text in the reply box.
- `reply-paused`: paused/off states show no bubble.
- `reply-fit`: on X and Reddit replies the engagement rating is Jev's fit level; with no key it says it can't rate the fit. Drive it with `mobile/e2e/jev-proof.mjs` (Chrome shows a lab X post at x.com; levels and probabilities come from the `ownvoice-fit` log line) against `mobile/e2e/jev-standin.mjs serve` until a real key exists; see `mobile/README.md` (Reply fit). For `evidence.sh pair`, the launch command must re-enable the service and sign the E2E ChatGPT in again (both are lost on its force-stop) before `KEEP=1 jev-proof.mjs` on a one-reply case file.

## How to get to it (user POV)

- Tap into a message box in an app switched on under **Where the bubble shows**, then tap the Dot bubble.
- Use **Write new ones** for another attempt; **Insert** a card even while others load; **Edit** a card before inserting it.

## Driving it with mobile/e2e/x-replies.mjs (X-style composer) and mobile/e2e/driver.mjs

Preconditions:

- Explicit emulator allocation; a release APK built with `EXPO_PUBLIC_E2E_STUB=1`; `ANDROID_SERIAL=emulator-NNNN`, `OWNVOICE_AVD_NAME=<its AVD>`, `JAVA_HOME`, SDK via `ANDROID_HOME`, `adb`/`zip`/`tesseract`/`magick` on `PATH`. The X driver additionally needs `adb root` (hosts bind + `adb reverse tcp:80`) and `ffmpeg` for motion validation.

- **X-style composer journey.** `node e2e/x-replies.mjs <release-apk> [task]` binds `x.com` to the emulator's loopback behind the fixture page `e2e/x.html` (no login, fixture posts, demo data named Umer), then walks: composer focus → bubble tap → rated cards (X platform named) → **Edit** with changed text → **Insert** → the "Inserted. Send it yourself." confirmation and a field read-back, plus the image-only post's withhold note; light and dark; then the same at font scale 1.3 on the narrowest screen. Screenshots and the motion recording land in `verify-artifacts/<task>/`.
- **Install and drive (general fields).** `node e2e/driver.mjs <release-apk> [screenshots-dir]` installs on the throwaway emulator, walks setup, enables the service (with the documented off/on rebind), taps the bubble in a chat field, and reads back inserted text from the React Native field plus Chrome's textarea/contenteditable.
- **Paused/off prevention.** The driver exercises paused and service-off states asserting no bubble.
- **Proof.** Screenshots land in the requested directory (default `e2e/artifacts`); copy the ones showing cards and read-back into `verify-artifacts/<task>/reply-drafts/` with the driver log (stable per-task folder — see the skill's Review evidence).

## Gotchas

- The driver refuses phone serials and verifies the AVD name — never point it elsewhere.
- `uiautomator dump` unbinds the service; the driver's own probe sets `FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES`.
- After any reinstall the service needs the off/on `enabled_accessibility_services` toggle (the driver does this).
- Panel controls swallow `adb input tap` — drive cards and buttons with DPAD (`input keyevent 19/20/21/22`) + ENTER (`keyevent 66`); see the skill's Review evidence.
- Insertion into Chrome retries 13×150 ms because Chrome refuses `ACTION_SET_TEXT` under an overlay; a failed insert falls back to Copy.

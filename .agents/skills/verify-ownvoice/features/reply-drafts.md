# Reply drafts

> Known limit in 1.0.3: generic reply cards are withheld per the accepted scope cut (see [Reply ideas, one tap away](../../../../README.md#reply-ideas-one-tap-away)). The procedure below describes earlier behavior, not this release.

Tap the bubble over a chat with an empty message field and Ownvoice offers short replies shaped to the app underneath; cards stream in as drafts land and each can be edited before use, rated, or sent through the app's own compose screen, and **Why?** explains a card's checks. **Insert** puts one in the field, **Copy** copies it (both Copy and the compose hand-off stay disabled while a missing-fact warning shows). With the emulator stub build, three fixed drafts are written without changing device settings.

## Sub-features

- `reply-offer`: bubble tap in an enabled app shows reply cards (chat headings name the person or stay generic; X/Reddit panels name the platform).
- `reply-insert`: Insert writes the draft into the focused field and verifies it afterward; **Edit** rewrites a card first.
- `reply-copy`: Copy places the draft on the clipboard; Copy and the compose hand-off stay disabled while a missing-fact warning shows.
- `reply-extras`: per-card tone line, **Why?** checks display and ratings.
- `reply-grow`: a reply typed under an X, LinkedIn or Reddit post shows **Suggested replies · X/Reddit/LinkedIn** with **Yours** kept and the cards built on that point, ordered by their fit level once it answers (slot order without one). Two or three usable cards are enough; a repeated, echo, slot-instruction or never-say card dropped by the acceptor leaves fewer and still shows, and only an empty writer answer falls back. A card that is only a slot instruction or the prompt's own draft label, or opens with either before a newline or a colon, never shows (it drops and the slot is asked once more); prove it on the phone with the X fixture and inputs whose typed point is a bare instruction. Drive it like `reply-fit` with typed text in the reply box, or with `mobile/e2e/grow-reply-live.mjs` (below).
- `reply-paused`: paused/off states show no bubble.
- `reply-fit`: on X, LinkedIn and Reddit replies the engagement rating is the fit level or a plain **Not sure about this one** bar; the contract is in `mobile/README.md` (Reply fit). Drive it with `mobile/e2e/fit-live-proof.mjs <cases.json> [out] [limit]` on a signed-in ChatGPT build (`DARK=1` for a dark pass; it leaves the app on the last panel and does not stop the shared emulator), or `mobile/e2e/jev-proof.mjs` against `mobile/e2e/jev-standin.mjs serve` for the Jev stand-in builds. For `evidence.sh pair`, the launch command must re-enable the service and sign the E2E ChatGPT in again (both are lost on its force-stop).

## How to get to it (user POV)

- Tap into a message box in an app switched on under **Where the bubble shows**, then tap the Dot bubble.
- Use **Write new ones** for another attempt; **Insert** a card even while others load; **Edit** a card before inserting it.

## Driving it with mobile/e2e/driver.mjs

Preconditions:

- Explicit emulator allocation; a release APK built with `EXPO_PUBLIC_E2E_STUB=1` (and `EXPO_PUBLIC_E2E_GPT=1` for cleared-data writer-choice setup); pick the writer through the app UI. Label captures **stub writer**, not real-model proof; `ANDROID_SERIAL=emulator-NNNN`, `OWNVOICE_AVD_NAME=<its AVD>`, `JAVA_HOME`, SDK via `ANDROID_HOME`, `adb`/`zip`/`tesseract`/`magick` on `PATH`.

- **Install and drive.** `node e2e/driver.mjs <release-apk> [screenshots-dir]` installs on the throwaway emulator, walks setup, enables the service (with the documented off/on rebind), taps the bubble in a chat field, and reads back inserted text from the React Native field plus Chrome's textarea/contenteditable.
- **Grow-mode feed replies.** `node e2e/grow-reply-live.mjs e2e/grow-reply-cases.json [out-dir] [limit] [x,reddit]` installs the Composer fixture as `com.twitter.android` (X) and `com.reddit.frontpage` (Reddit), opens each realistic post with the person's typed reply in the field, taps the bubble, and reads the ranked cards (tag, text, fit words) from the accessibility tree, one screen recording per platform. It needs a live writer (a signed-in ChatGPT plan; the on-phone model cannot run on an emulator), which the run confirms on Home before drafting. Without a live writer it captures the panel's plain failure note instead and proves nothing about the drafts: record that as `not proven`.
- **Paused/off prevention.** The driver exercises paused and service-off states asserting no bubble.
- **Proof.** Screenshots land in the requested directory (default `e2e/artifacts`); copy the ones showing cards and read-back into `verify-artifacts/<task>/reply-drafts/` with the driver log (stable per-task folder — see the skill's Review evidence).

## Gotchas

- The driver refuses phone serials and verifies the AVD name — never point it elsewhere.
- `uiautomator dump` unbinds the service; the driver's own probe sets `FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES`.
- After any reinstall the service needs the off/on `enabled_accessibility_services` toggle (the driver does this).
- For React Native panel controls, use conditional Back (only when the keyboard is shown), then guarded TAB focus and DPAD_CENTER (`23`); Enter (`66`) did not activate Use this in the F6a emulator proof. A plain tap using fresh screenshot/native bounds also activated it. See the skill's Review evidence.
- Insertion into Chrome retries 13×150 ms because Chrome refuses `ACTION_SET_TEXT` under an overlay; a failed insert falls back to Copy.

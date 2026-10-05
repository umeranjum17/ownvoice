# Own posts from a blank composer

Tap the bubble over an empty composer in a feed app (X, Reddit) and Ownvoice asks for the one line the post is about, writing nothing: an empty screen can support no topic, and a question offered as his post is something he would have to delete. Type that line and the ordinary new-post path drafts from it in his voice, with the shared cards, checks, **Edit**, then **Use this**. Nothing is posted: the person presses Post themselves.

## Sub-features

- `own-ask`: a blank focused field in a feed app shows **Start your post** and asks for the one line, with no card, no **Try again** and no writer call.
- `own-draft`: that one line is what the post is drafted from, through the ordinary new-post path.
- `own-edit-insert`: **Edit** rewrites one draft and **Use this** puts exactly that text in the composer; the native module confirms the insertion.
- `own-elsewhere`: a chat or mail composer, or a screen with no field at all, keeps the empty state; an empty field never produces a withheld reply card.
- `quiet-checks`: a card shows an engagement or stock-wording row only when that check found something; a card with nothing to flag carries no rows.

## How to get to it (user POV)

- Open a blank composer in an app switched on under **Where the bubble shows** and tap the Dot bubble.
- Write the one line about what the post is, tap the bubble again, **Edit** a draft until it says what he means, then **Use this**; the text lands in the composer, unposted.

## Driving it with mobile/e2e/own-post.mjs

Preconditions:

- Explicit emulator allocation; a release APK built with `EXPO_PUBLIC_E2E_STUB=1 EXPO_PUBLIC_E2E_GPT=1` (fixed openings and the offline sign-in stand-in), `ANDROID_SERIAL=emulator-NNNN`, `OWNVOICE_AVD_NAME=<its AVD>`, `JAVA_HOME` (a real JDK, not `/usr`), `ANDROID_HOME`, and `adb`/`zip`/`tesseract`/`magick` on `PATH`.
- `node e2e/first-run.mjs <apk>` once on the emulator, so setup is finished and the ChatGPT stand-in is connected.

- **Drive.** `ANDROID_SERIAL=… OWNVOICE_AVD_NAME=… node e2e/own-post.mjs <release-apk> [outdir]` installs a blank X-style composer fixture (`com.twitter.android`, "Posting as Umer"), taps the bubble, asserts it asks for the one line and offers no draft, types that line, asserts drafts land, edits the first one, inserts it and reads the composer back; `insert result ok=true` in logcat proves the native insert. `OWNVOICE_THEME=dark` runs the same journey in dark; `OWNVOICE_BEFORE=1` captures the same screens on the base build without the own-post assertions.
- **Proof.** Screenshots and the edit-and-insert recording land in `verify-artifacts/ov-own-posts/` (stable per-task folder — see the skill's Review evidence). Extreme case: `settings put system font_scale 1.3` and re-toggle the service; all three openings stay readable and the longest wraps.

## Gotchas

- The driver refuses phone serials and verifies the AVD name.
- The panel swallows coordinate taps, so the driver's controls go through the probe's own `ACTION_CLICK`, not `input tap`.
- The offline sign-in stand-in keeps its connected state in memory: any restart of the app (a theme flip, a force-stop) ends it, and the driver reconnects through the app's own **How Ownvoice writes** screen before tapping the bubble again.
- An app restart also unbinds the accessibility service, so the documented `enabled_accessibility_services` off/on toggle comes before the bubble tap.
- Android reports an empty field's hint as its text, so the fixture's "What's happening?" is treated as blank.

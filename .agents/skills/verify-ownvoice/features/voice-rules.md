# Voice rules in drafts

The rules a person enters under **Your voice** must visibly change what the writer drafts. One selected guide line (`packages/engine/src/voice.ts` `selectedGuide`) now reaches **both** writer prompts: the ChatGPT reply/rewrite prompt and the on-device `phoneReplyPrompt`/`phoneSlotPrompt` (`packages/engine/src/drafts.ts` `ruleBlock`); a card that still uses a banned phrase is dropped by `acceptReplies` at every caller.

## Sub-features

- `voice-guide`: the never-say phrases and the "How I write" note ride the phone prompt inside its 700-character instruction budget (rules win the room, samples drop first).
- `voice-ban`: `acceptReplies` drops a reply card that still uses a never-say phrase, so the per-slot retry asks once more.
- `voice-mark`: the **Yours** card and the rewrite sheet mark a never-say phrase in the person's own text (`Slop.hits`).

## How to get to it (user POV)

Open **Your voice**, add a never-say phrase (a suggestion chip or typed) and type the **How I write** note. In an app the bubble shows in, type a reply point under an X, LinkedIn or Reddit post and tap the Dot bubble; the **Suggested replies · X/Reddit/LinkedIn** cards grow from it, with **Yours** kept above them.

## Driving it with mobile/e2e

Preconditions: an allocated emulator, a release APK built with **no** `EXPO_PUBLIC_E2E_*` flags (the live writer is the point) and the owner's ChatGPT sign-in present, plus `ANDROID_SERIAL`, `OWNVOICE_AVD_NAME`, `JAVA_HOME`, the Android SDK, and `adb`/`zip`/`tesseract`/`magick` on `PATH`. The emulator has no phone writer, so the live writer is the signed-in ChatGPT; the phone-prompt path is exercised only by `mobile/eval` against a live endpoint.

Drive the grow-mode journey the way `mobile/e2e/jev-proof.mjs` sets it up: a self-signed HTTPS page mapped to `x.com` in Chrome carries the post and a reply field. For each run, clear logcat, open the page, type the reply point in the field, tap the bubble, wait for the cards, and read the drafted text (the panel plus the `ownvoice-fit`/log lines). Run the **same thread** five times with an empty never-say list and five times with the phrase (for example `No worries` or `at the end of the day`) added under **Your voice**; the phrase must appear in at least 3 of 5 runs without the rule and 0 of 5 with it. Then change the note to `lowercase, blunt` and capture a before/after of the same thread. Capture through the skill's `evidence.sh pair` into `verify-artifacts/<task>/`, light and dark, and keep the per-run table next to the shots.

## Gotchas

- `phoneReplyPrompt`/`phoneSlotPrompt` build the rules half of the guide with `rulesOnly` and re-select the shortest samples; rules always reach the prompt, samples may drop. Keep the 700-character instruction budget when editing the phone instructions.
- A forced stop unbinds the accessibility service; re-enable `enabled_accessibility_services` and check `accessibility_enabled` is 1 before reading the bubble (see [Android developer notes](../../../../mobile/README.md#android-build-and-device-checks)).
- `uiautomator dump` unbinds the service; use the driver's probe, which sets `FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES`.
- This proof drives the ChatGPT route; it does not prove the on-device model's prose quality (that is the writer eval gate).
- The cloud writer needs a signed-in plan with quota. A plan at its usage limit (for example the ChatGPT test plan, `kind=rate_limit` in logcat) leaves the panel on the phone-writer message, so the draft generation half cannot be captured until the limit resets or another provider is wired; the never-say **mark** on the person's own text still renders and can be captured.

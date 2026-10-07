# Typing checks

With the spelling switch on, readable fields get a slip count after a pause. Chrome exposes only a capped prefix of very long fields; Ownvoice must disclose that limitation, hide the misleading count, disable a partial spelling Fix and draft Insert, and resume normal checks in a fresh field.

## Sub-features

- `typing-readable`: a small opted-in field answers with a count.
- `typing-limited`: a real Chrome field larger than 10 KB has no misleading count and shows the plain partial-check notice on the bubble and tapped panel.
- `typing-partial-fix`: a partial capture offers no actionable spelling Fix or draft Insert that could replace the unread suffix.
- `typing-resume`: a fresh readable field answers normally after the limited field.

## How to get to it (user POV)

Turn on **Check my spelling as I type** and Chrome in **Where the bubble shows**. Type a note in Chrome; pause for its count. In a very long note the bubble explains the limited read instead. Tap it to see the same notice in the panel.

## Driving it with mobile/e2e/typing-limit.mjs

Preconditions:

- Explicitly allocated emulator, installed APK, typing and Chrome enabled, `ANDROID_SERIAL`, `OWNVOICE_AVD_NAME`, SDK/JDK, and `su` for checking the opt-in fixture.
- Run from the repo root. The normal app writer is not needed; the page is synthetic and nothing is submitted.
- `ANDROID_SERIAL=emulator-NNNN OWNVOICE_AVD_NAME=<allocated-avd> node mobile/e2e/typing-limit.mjs <evidence-dir> after light` drives all four sub-features. It asserts actual DOM length beyond 10 KB, not only an accessibility prefix.
- Use `before` for the original APK: the honesty assertions must fail. Run both light/dark, restarting Ownvoice and rebinding its service after each theme flip, as documented in the main skill.
- Set `OWNVOICE_RECORD=1` to record the whole changed interaction with the skill's motion helper. `OWNVOICE_EVIDENCE_TASK=<task>` selects the stable capture folder; the JSON/log directory should be that same folder (or its feature subdirectory).

## Gotchas

- On a shared allocated emulator, another journey can replace the APK or preferences between locks. Prepare and verify the opted-in app inside the same lock as the whole journey.
- Some emulator consoles return an empty AVD name; the driver accepts the boot AVD property as a fallback but still rejects missing or mismatched identities.
- The original Chrome cap is UTF-8 bytes, not Java/JavaScript string length. A selection beyond the exposed value also proves the field was truncated.
- A disappearing six-second notice pill is expected; the bubble's accessible label and the tapped panel keep the disclosure. The test waits for that pill to close before the ordinary bubble tap.

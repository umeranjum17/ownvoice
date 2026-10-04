# Rewrite a selection

Select text in any app, choose **Ownvoice** from the selection menu (or share text to it), and pick **Shorter**, **Simpler**, **Fix spelling**, **Friendlier** or **Firmer**. The sheet shows the version with **Copy** and **Share this text** — it never inserts the text back itself. A version that adds a time, number or fact says **Check this**. Works without accessibility permission; the bubble hides while the sheet is open.

## Sub-features

- `rewrite-open`: process-text and share intents open the rewrite sheet from any app.
- `rewrite-version`: each chip produces a rewritten version with phrase marks.
- `rewrite-copy-only`: Copy copies the version; the source field is left untouched (no Replace anywhere).
- `rewrite-number-warning`: an added number gets the **Check this** warning.
- `rewrite-hides-bubble`: no Dot bubble while the sheet shows.

## How to get to it (user POV)

- Select text in any app → selection menu → **Ownvoice** → choose a chip.
- Share plain text to Ownvoice from any share sheet.

## Driving it with mobile/e2e/rn08.mjs

Preconditions:

- Explicit emulator allocation; a release APK built with `EXPO_PUBLIC_E2E_STUB=1`; `ANDROID_SERIAL=emulator-NNNN` and `OWNVOICE_AVD_NAME` matching that emulator (the driver verifies the AVD name and refuses mismatches).

- **Direct intents.** `node e2e/rn08.mjs <release-apk> [screenshots-dir]` drives the sheet through direct process-text and share intents, checks the three chips, the copy-only sheet (field untouched), a warned new number, the hidden bubble, and the drafts panel's verdict note in light and dark. Evidence lands in the requested directory (default `reports/rn08`).
- **Proof.** Copy sheet screenshots showing the chosen chip, the rewritten version and the Copy state into `verify-artifacts/rewrite-selection/<run>/` with the driver log.

## Gotchas

- The driver checks the AVD name before any install or device change — keep `OWNVOICE_AVD_NAME` exact.
- Hand-over-only is deliberate: Chrome can drop a selection and insert at the caret, so the sheet hands text over and never inserts.
- Selection-menu entries can be ignored or caret-inserted by Chrome; the driver uses direct intents for determinism and covers the menu path through Your voice's own editable field.
- The same SDK/JDK prerequisites as the insertion driver apply.

# Slice 8 emulator evidence — rewrite selected text, share, drafts-panel polish

Rows R1–R5 of the rewrite sheet plus the three drafts-panel fixes from the visual review,
on the worktree-owned `ov-rn-8` AVD (Android 16, API 36 google_apis x86_64, release APK of
`dev.ownvoice.next` built with `EXPO_PUBLIC_E2E_STUB=1`). No physical phone was touched;
every adb command in that historical capture targeted `emulator-5558`. The current driver requires both an emulator serial and a matching `OWNVOICE_AVD_NAME` before it touches the device.

These screenshots were captured before the later rewrite-verdict and Why? alignment changes. They are historical evidence, not screenshots of the current candidate. Refresh the light/dark release-build captures on an owned AVD after building the current candidate; this worktree session has neither the release APK nor the original `emulator-5558`.

## What ran

The original `node e2e/rn08.mjs <release-apk> reports/rn08` run used `ANDROID_SERIAL=emulator-5558` and a fresh clean install per scenario. Future runs must also set `OWNVOICE_AVD_NAME=ov-rn-8`. (prefs
seeded through `su`, the RN `setup-done` kv row seeded after first boot, the accessibility
service re-toggled per AGENTS.md, night mode forced with the twilight schedule disabled):

1. **Empty selection (R2)** — launched straight at `RewriteActivity` with Android's
   process-text intent; the sheet shows only "Select some text first, then choose
   Ownvoice." (`OWNVOICE-RN-08-01-empty-*`).
2. **Selection + chips (R2/R3)** — the "You selected" card with the promise note, and the
   three chips **Shorter / Simpler / Fix spelling**, one chosen at a time (`-02-chips-*`).
3. **Replace (R4)** — the chosen version lands as written and the note reads "Replace your
   text with it, or copy it." (`-03-result-editable-*`); **Replace** then returns it —
   proven by the logged fingerprint `rewrite returned sha=…` (the text itself never goes
   to the log) and copies it too (`-04-replaced-toast-*`).
4. **Read-only share (R4)** — a SEND share offers only **Copy** ("Copy it, then paste it
   where you like.", no Replace); the fingerprint `rewrite copied sha=…` matches the
   chosen version (`-05-result-readonly-*`).
5. **New number (R4)** — a rewrite that adds a number is warned about: "Check this: it
   adds …" (`-06-number-warned-*`).
6. **Bubble (R5)** — the bubble is hidden while the sheet shows (checked via the overlay
   window's `mViewVisibility`, never UiAutomator) and returns after the sheet closes
   (`-07-bubble-hidden-while-sheet`).
7. **Drafts panel** — the differing-card case opens a locally served Chrome textarea with
   “stock please” and focuses it before tapping the bubble (rather than matching “message” in
   Home's explanatory copy). When every card would say the same thing ("Sounds natural"), the
   verdict note is dropped (`-08`/`-11-panel-shared-note-hidden-*`); when cards differ,
   every card keeps its line — "A bit stock: 3 phrases you could say more simply" beside
   "Sounds natural" (`-10`/`-13-panel-differing-verdicts-*`); the **Why?** button rides the
   card's baseline and the cover no longer reads as an error — it says what was checked:
   "The lines above come from reading your writing." (`-09`/`-12-why-cover-checked-line-*`).

Light and dark throughout. The intent-driven rewrite checks do not themselves exercise the
Android selection-menu chooser; that needs a separate on-device interaction. The driver targets
controls by screenshot OCR only; tesseract 5.5
dropped the word-confidence format the earlier drivers used, so this one reads TSV per OCR
pass (whole, 150 px strips, a pure-white-pixel pass for filled buttons in light, and a hard
grey-threshold pass for them in dark), clusters each pass alone, finds a filled button as the
button band's dominant non-background colour and taps its centre when no pass reads the label.

## Local checks

223 mobile Jest tests — the new `src/rewrite/__tests__/RewriteTest.test.tsx` (the §2.8
scenarios: Replace returns the chosen version, stale taps discard, read-only offers only
Copy, the new number is warned, the Kotlin-verbatim selection prompts), the shared-note and
differing-card panel checks in `src/panel/__tests__/PanelVerdicts.test.tsx`, PlainWords over
the new wording — plus TypeScript typecheck, ESLint and the release build. The Replace /
read-only / new-number rows are unit-covered against the Kotlin sources' behaviour and
wording, and fingerprint-checked on the emulator above.

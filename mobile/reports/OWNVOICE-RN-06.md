# Slice 6 emulator evidence

Setup (S1–S7) on the worktree-owned `ov-rn-6` AVD (Android 16, API 36 google_apis x86_64, release APK of `dev.ownvoice.next`). No physical phone was touched; all adb commands targeted `emulator-5594`.

## What ran

`node e2e/first-run.mjs <release-apk> e2e/artifacts` (forces light before the first pass, disables the twilight schedule, switches to dark for the second pass, and restores the prior mode, schedule and accessibility settings afterward; each pass clears app data and relaunches):

1. **Welcome** — home redirect opens setup on a cleared install (S6); Dot waves hello; the one-time model download starts quietly (`modelStatus` → `downloadModel`, errors swallowed).
2. **Permission** — three promises with the ported hand/lock/chat icons, the animated copy of the phone's Ownvoice switch (flips every 1.4 s), "full control" explainer, **Turn on** (deep links to accessibility settings with the row highlighted), **Not now**, **Switch greyed out?** (App info + restricted-settings help).
3. **Comes back by itself** — the test flips the accessibility switch with `settings put`; the service connects, reads the `comeBack` flag and opens `ownvoice://setup`, landing straight on **Try it** (B10).
4. **Try it** — practice chat (Sam, the two messages); the field is focused without the keyboard (`mInputShown=false` verified); the bubble is visible on Ownvoice's own screen via the practice allowance (`setPractice`, never saved, pause still blocks); bubble tap → panel → **Insert** → the draft lands in the practice field (logcat `insert result ok=true`), the subtitle becomes "That's it. …" and **Continue** appears (B11).
5. **Where should I help?** — only installed offered apps (Gmail here) with icon and switch, on by default (Slack and Reddit are in the offered list); **Done** saves the shown choices into the bubble rules; leaving any other way also marks setup done.
6. **Home** — reachable after Done; step and inserted state survive process death (S7, kv-store).

Every setup screen's visible text (OCR) is scanned against the plain-words banned list — no technical words. Total taps for the first run: Continue, Turn on, bubble, Insert (plus Continue/Done after).

Screenshots: `light-NN-*` and `dark-NN-*` pairs (copied to the pane attachments as `OWNVOICE-RN-06-*`).

## Regression

`node e2e/driver.mjs` still passes end to end on the same AVD: RN field, Chrome textarea and contenteditable inserts (read-back ok=true ×3), pause/off bubble hiding, per-app switch, and the service-rebind-after-reinstall check (`OWNVOICE-RN-06-regression-*` screenshots). The driver gained: the psm-13 raw-line OCR pass (filled pills), a Copy-anchored Insert tap (the Insert pill defeats OCR), Chrome first-run dismissal, and the build-flagged stand-in writer (`EXPO_PUBLIC_E2E_STUB=1`) gives the panel fixed drafts on this model-less emulator without a device setting.

## Local checks

159 mobile Jest tests (10 new Setup tests, PlainWords `displayedSetupCopy` over all four steps), TypeScript typecheck, ESLint, release build.

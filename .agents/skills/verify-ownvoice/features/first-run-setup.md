# First-run setup

A fresh install opens Welcome, asks **How should Ownvoice write?** (phone or ChatGPT, sign-in inside the step), explains the permission, runs a practice chat whose first inserted draft ends the practice step, then offers installed apps for **Where should I help?**. Hardware Back finishes; **Not now** skips.

## Sub-features

- `setup-order`: the five steps appear in order and survive process death.
- `setup-writer`: choosing ChatGPT (emulator: no phone writer) completes the in-step sign-in stand-in.
- `setup-permission`: the explained permission step, greyed-switch help included.
- `setup-practice`: the practice chat's inserted draft ends the practice step (setup continues to the app list).
- `setup-plain-words`: no screen shows technical words.

## How to get to it (user POV)

- Open Ownvoice on a fresh install (or after `pm clear`); setup opens by itself, and returns to the front after the service connects (`ownvoice://setup`).

## Driving it with mobile/e2e/first-run.mjs

Preconditions:

- Explicit emulator allocation; a release APK built with `EXPO_PUBLIC_E2E_GPT=1 EXPO_PUBLIC_E2E_STUB=1` (offline sign-in stand-in plus fixed drafts); `ANDROID_SERIAL=emulator-NNNN`.

- **Walk setup twice.** `node e2e/first-run.mjs <release-apk> [screenshots-dir]` walks the whole flow in light and dark, choosing ChatGPT, scanning every screen's visible text for technical words, and restoring the phone's settings after. Screenshots save as `light-NN-*` / `dark-NN-*`.
- **Known gap (2026-10-04).** The driver's practice-insert finder is stale against the #138 card layout (an **Edit** pill now sits where it scans for **Why?**), so the walk fails at the TRY step. Complete the insert with the skill's DPAD+ENTER panel recipe and finish setup by hand until the driver's finder is fixed (product change, out of skill scope).
- **Proof.** Copy the step screenshots (welcome, writer choice, connected, permission, practice insert, home) into `verify-artifacts/<task>/first-run-setup/` with the driver log (stable per-task folder — see the skill's Review evidence).

## Gotchas

- Emulators have no phone writer: the ChatGPT stand-in leads; never claim phone-writer behavior from this run.
- The emulator's twilight schedule flips night mode overnight — the driver forces each mode before its screenshots.
- Shell input and screencap only; UiAutomator would unbind the service.
- Never use `EXPO_PUBLIC_E2E_*`-flagged builds for distributable APKs.

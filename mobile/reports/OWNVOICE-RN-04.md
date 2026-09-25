# Slice 4 emulator evidence: theme, components, Dot

Built from the look spec (sections 1–3): the dynamic-colour theme, the shared components in `mobile/src/ui/`, and Dot (coral) on the native bubble, the panel header, and the launcher icon.

Setup: release `dev.ownvoice.next` APK on the `medium_phone` AVD (Android 16 / API 36, x86_64, 1080 × 2400 @ 420 dpi), Chrome on `example.com`, the Ownvoice accessibility service enabled, Chrome switched on in "Where the bubble shows". No physical phone was touched.

## What the screenshots show

- `OWNVOICE-RN-04-01-bubble-chrome-light.png` — the resting bubble is Dot (coral drop, oval 3 dp shadow) over Chrome, light mode. Status bar cropped.
- `OWNVOICE-RN-04-02-bubble-listening.png` — Dot's listening mood right after a tap: raised brows, open mouth, coral sparkle marks (`ownvoice_mascot_listening`). Captured with a screen recording at 15 fps because the panel opens in under a second on a warm process.
- `OWNVOICE-RN-04-03-panel-light.png` — the drafts panel using the new theme and components: dynamic `surfaceContainerLow` sheet, 28 dp top corners, handle, 40 dp Dot header slot, title, 48 dp close X, muted note, no bottom Close button.
- `OWNVOICE-RN-04-04-bubble-chrome-dark.png` — the same bubble in dark mode. Dot stays coral; only its small marks follow `values-night`.
- `OWNVOICE-RN-04-05-panel-dark.png` — the same panel in dark mode from the phone's dynamic dark palette.
- `OWNVOICE-RN-04-06-app-icon-launcher.png` — the launcher: coral Dot on pale peach, from `app.json` `icon`/`adaptiveIcon` (foreground, monochrome, background `#FFF0EA`); the legacy mipmaps come from `expo prebuild`.

## Emulator limits written down

- The emulator has neither ChatGPT sign-in nor the phone model, so the panel shows the plain-language "doesn't work on this phone yet" note; cards, Insert/Copy and the done/check bubble pills need a writer and are slice 5 / real-phone QA (spec E9, P3–P8).
- The emulator launcher applies themed icons only inconsistently (it re-rendered the dock icon from a stale cache until a fresh reinstall, and its themed mode ignores other icons). The monochrome layer itself ships and renders as the Dot drop glyph (see `mobile/assets/icon/dot-icon-monochrome.png`); themed-icon-on-launcher remains to be checked on the phone (P7).

Local checks: 136 Jest tests (including 42 light/dark component snapshots), TypeScript typecheck, ESLint, and the release build passed.

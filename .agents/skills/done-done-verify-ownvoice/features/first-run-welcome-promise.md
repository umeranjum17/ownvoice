# First-run welcome promise (React Native app)

Part of the ownvoice verification map. Source: `packages/engine/src/words.ts` (`welcomeTitle`, `welcomeNote`), shown by `mobile/app/setup.tsx` (Welcome). What it may promise follows `modeOf` and the reply withhold in `mobile/src/panel/Panel.tsx`: reply ideas from an empty box only under a readable post on a feed app (X, Reddit, LinkedIn), polish of typed text everywhere else.

## How to get to it (user POV)

Install fresh and open Ownvoice: the first screen is the welcome.

## Driving it

Harness: an owned Android emulator. Android surface, not covered by the Host CLI launch above.

1. Build a release APK per `mobile/README.md` (no stub flags needed).
2. Run `node mobile/e2e/welcome.mjs <apk> <out-dir>` with `ANDROID_SERIAL` and `OWNVOICE_AVD_NAME` set (or the `welcome-promise` journey). It clears the app per cell, walks light and dark at font 1.0 and 1.3, and fails if the screen says "any chat" or lacks "On X, Reddit and", "under a post" and "polish" (OCR misreads "LinkedIn"). `OWNVOICE_BEFORE=1` skips that check to capture the base build.
3. Capture: `<before|after>-<light|dark>[-large]-welcome.png` in `<out-dir>`.

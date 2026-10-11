# Settings navigation smoke

A non-destructive walk through the installed Android app: Home → Where the bubble shows → Your voice. It proves those routes render, not setup, sign-in, import, wiping, writer quality or field insertion.

## Sub-features

- `settings-navigation`: Home shows Where the bubble shows, apps explains disabled apps, Your voice renders its heading.
- `settings-readiness`: boot completion, installed package and deep-link resolution must all succeed before navigation.

## How to get to it (user POV)

After setup, open Home, Where the bubble shows and Your voice.

## Driving it with mobile/e2e

Preconditions: an explicitly allocated throwaway emulator, installed release APK, setup completed, `ANDROID_SERIAL`, `OWNVOICE_AVD_NAME`, and `adb`/`tesseract` on PATH. For a setup-complete fixture, `rn08.mjs` documents seeding `setup-done` in the emulator's SQLite store after first launch; this is fixture preparation, not setup proof.

From `mobile/`, run `node e2e/settings.mjs <absolute-evidence-directory> browse`. The driver polls boot/package/intent readiness with a deadline, verifies AVD identity, navigates all three routes, and waits for their actual visible text. Save stdout/stderr and exit code. Success ends with `browse: PASS (Home → apps → voice, real installed app)`.

## Gotchas

- `sys.boot_completed=1` alone is insufficient: package manager and intent resolution may still be unavailable.
- This mode does not use the stale writer/sign-in expectations in the older full settings driver.
- The voice import control is below the first viewport; this smoke waits for the observed Your voice heading, not import readiness.
- No fixed settling sleeps are used by this mode; short delays only pace condition polling.

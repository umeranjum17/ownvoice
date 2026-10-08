# Growth check-in and counts

Android verification for F6b. The user-facing behavior and privacy contract live in [Your growth](../../../../README.md#your-growth).

## Sub-features

- Home check-in persistence (`checkin` + `checkinAt` on the original outcome in `mobile/src/core/store.ts`; calibration input is defined in [the eval contract](../../../../mobile/eval/README.md#fit-calibration-g9-local-only)).
- Home reminder navigation, count persistence, and timestamp-based platform trends on Your growth.
- The scoped count-digits exception in `PlainWordsTest`.

## How to get to it (user POV)

Follow [Your growth](../../../../README.md#your-growth) for the Home and count-entry paths.

## Driving it with Android e2e

Preconditions: allocated emulator with `su`, setup finished, and a release APK built with `EXPO_PUBLIC_E2E_STUB=1`. No sign-in or model server is needed.

Run from the repo root, with task-private HOME/XDG/TMPDIR and `ANDROID_SERIAL`/`OWNVOICE_AVD_NAME` naming the allocated emulator. No dedicated growth driver ships yet (follow-up alongside "Read my counts"); drive the same path by hand with the F6a instruments:

```sh
# Release APK per mobile/README.md, with EXPO_PUBLIC_E2E_STUB=1; install, finish setup, choose the stub writer.
```

Seed one suggestion outcome record with an `at` timestamp at least a day in the past plus one week-old counts entry. Follow the SQLite capture/edit/restore pattern in the local `database()` helper inside `mobile/e2e/outcomes.mjs` against the `reply-outcomes` and `growth-counts` keys; the helper is not exported. Force-stop before reading or editing the database, then relaunch Home (`ownvoice://`) and re-enable the service as described in [Android developer notes](../../../../mobile/README.md#android-build-and-device-checks). Capture through `evidence.sh` into `verify-artifacts/ov-grow-f6b/`: the Home check-in line, each of the four answers saving onto a separate unanswered record (re-read SQLite after each), the weekly Home reminder opening count entry on Your growth, and the growth screen. Repeat in both themes at phone width. Disable Wi-Fi and mobile data to check offline saves, restoring both afterward; offline success alone does not prove zero attempted network calls. Inspect the check-in and count-save call paths for transport and writer calls separately.

## Gotchas

Verify first-answer preservation, fresh and own-text inserts staying quiet, failed-save retry, invalid pasted counts, skipped platform observations, stale trends, and Wipe everything clearing counts after reopening Your growth. Expected behavior is in the linked user guide; `mobile/app/__tests__/Growth.test.tsx` supplies regression cases, not native proof. This proof does not qualify writer prose, fit levels, or any remote backend. Read every screenshot before reporting ready.

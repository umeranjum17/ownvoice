# Growth check-in and counts

F6b asks about one inserted reply about a day later, takes weekly X/Reddit counts he types in, and shows them on a growth screen. Everything stays on the phone; no writer, judge, or network call is involved.

## Sub-features

- A recorded insert grows one quiet Home line after about a day (Got replies back / Some likes / Nothing yet / Didn't post it); the answer lands on that same outcome record (`checkin` + `checkinAt` in `mobile/src/core/store.ts`, shared with F6c calibration).
- A Home card about once a week takes his typed X follower count and Reddit karma; the numbers stay on the phone and render only on the growth screen (the one scoped digits exception in `PlainWordsTest`).
- The growth screen reads "since you started", shows his counts as bars with plain trend words (Up / Same / Down since last week), and never says Ownvoice caused a change.
- Manual buttons alone cover the check-in; the optional one-tap "Read my counts" screen read is a follow-up, not built here.

## How to get to it (user POV)

Insert a reply through the bubble, wait about a day, and answer the Home line. Type weekly counts into the Home card when it asks, then open See your growth.

## Driving it with Android e2e

Preconditions: allocated emulator with `su`, setup finished, and a release APK built with `EXPO_PUBLIC_E2E_STUB=1`. No sign-in or model server is needed.

Run from the repo root, with task-private HOME/XDG/TMPDIR and `ANDROID_SERIAL`/`OWNVOICE_AVD_NAME` naming the allocated emulator. No dedicated growth driver ships yet (follow-up alongside "Read my counts"); drive the same path by hand with the F6a instruments:

```sh
# Release APK per mobile/README.md, with EXPO_PUBLIC_E2E_STUB=1; install, finish setup, choose the stub writer.
```

Seed one outcome record with an `at` timestamp faked a day forward plus one week-old counts entry, using `mobile/e2e/outcomes.mjs`'s `database()` SQLite read-back helper against the `reply-outcomes` and `growth-counts` keys. Force-stop, relaunch Home (`ownvoice://`), and capture through `evidence.sh` into `verify-artifacts/ov-grow-f6b/`: the Home check-in line, each of the four answers saving onto its record (re-read SQLite after each), the weekly card with typed counts, and the growth screen. Repeat in both themes at phone width, with Wi-Fi and mobile data off to prove no network call.

## Gotchas

The check-in line shows only for unanswered records at least a day old; answering twice keeps the first answer. Counts are his own typed strings, kept verbatim — bars and trends use only values that parse as numbers. This proof does not qualify writer prose, fit levels, or any remote backend. Read every screenshot before reporting ready.

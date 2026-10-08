# Local reply outcomes

F6a keeps insertion metadata on the phone. Reply text is kept only with the person's opt-in; the read history screen shows the records and the switch.

## Sub-features

- Confirmed insertion records platform, shown fit, card and time; copy/failure does not record an outcome.
- The real SQLite store survives process death, defaults to no text, and keeps text only while opted in.
- A refused SQLite append leaves earlier records intact and does not prevent insertion.

## How to get to it (user POV)

Type a reply under a post, tap the bubble and use a suggestion or Yours. In Ownvoice, open What Ownvoice read to read the record or change Keep my replies to learn from.

## Driving it with Android e2e

Preconditions: allocated emulator with `su`, setup finished, and a release APK built with `EXPO_PUBLIC_E2E_STUB=1`. No sign-in or model server is needed.

Run from the repo root, with task-private HOME/XDG/TMPDIR and `ANDROID_SERIAL`/`OWNVOICE_AVD_NAME` naming the allocated emulator:

```sh
OWNVOICE_OUTCOME_PROOF=1 OWNVOICE_THEME=light node mobile/e2e/own-post.mjs <apk> <scratch>
OWNVOICE_OUTCOME_PROOF=1 OWNVOICE_THEME=dark node mobile/e2e/own-post.mjs <apk> <scratch>
```

First run with `OWNVOICE_BEFORE=1` on the base build in each theme. The driver captures both changed screens through `evidence.sh` into `verify-artifacts/ov-grow-f6a/`. Candidate runs start with cleared app data/setup finished; the driver reads the real SQLite file after force-stop, inserts with text off and on, rejects an append using a SQLite trigger, then checks an inserted Yours card's shown bottom level. It checks the recording module has SQLite-only imports and no transport calls, and completes insertion/persistence offline. Each run writes `results.json` in scratch; preserve it beside the captures.

## Gotchas

The fixture is synthetic and never posts. Unavailable/hidden fit is stored as null, not a guessed level. `su` is required for independent release-store read-back and SQLite failure injection; never substitute mocked storage. This proof does not qualify real writer prose or a remote fit backend. Read every screenshot before reporting ready.

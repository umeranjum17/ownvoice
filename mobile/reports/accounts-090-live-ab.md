# BYOKit accounts 0.9.0 upgrade proof

2026-09-30, persistent `ownvoice-signed` AVD, Android 36,
`emulator-5684`, `dev.ownvoice.next`. Baseline: `cbf44cd5` with accounts
0.7.1. Candidate application: `b8a5da0` with accounts pinned exactly to
0.9.0; `6b7548b` adds the storage compatibility test without changing the app.

## Storage and release changes

Read the [accounts changelog](https://github.com/umeranjum17/byokit/blob/main/packages/accounts/CHANGELOG.md)
before upgrading. The 0.8.0 sealing requirement applies to desktop `fileStore`;
Ownvoice uses the kit's `secureStore` over Expo SecureStore and Android Keystore,
with the same `ownvoice.chatgpt.1` key. No storage migration is required.
The 0.9.0 kit supplies the refresh transaction through that store: it persists
an attempt before sending a single-use refresh grant, commits its replacement
before returning access, and requires sign-in again for uncertain or terminal
attempts. Ownvoice has one Accounts instance in one Android app process, with
no separate refresh owner. No private adapter or refresh workaround was added.

`src/chatgpt/__tests__/SecureStoreUpgrade.test.ts` writes the persisted 0.7.1
generation/pointer record through mocked Expo SecureStore, reads it with the
installed 0.9.0 kit and asserts both the credential and `Accounts.signedIn`.
This proves storage compatibility, not provider acceptance of a live token.

The original saved token was already invalidated by the provider: the first
0.7.1 baseline request failed with `signed_out` before candidate installation.
Firstmate approved separating the storage proof from live acceptance and
completed a fresh device-code sign-in in the captain's desktop browser. The
worker never entered, read or copied provider credentials. The fresh sign-in
then persisted through the baseline install and the candidate reinstall; no
further sign-in was needed for the successful A/B below.

## Live A/B

Both APKs were ordinary x86_64 release builds from read-only source archives,
without E2E flags, built under `/home/umer/lab-tmp/ov-accounts-080`. Both used
`adb install -r`; restarts used `su 0 kill -9` and `am start`, never force-stop.
Ownvoice was temporarily enabled through the app's bubble settings. The same
practice screen, empty reply field and fresh ChatGPT sign-in were used for
both runs. An emulator cannot use the phone writer, so these responses came
through the real ChatGPT account path.

| Build / action | First nonblank response observed | All responses observed | Count |
| --- | ---: | ---: | ---: |
| 0.7.1 practice replies | 11,156 ms | 11,156 ms | 3 |
| 0.9.0 practice replies | 9,235 ms | 9,235 ms | 3 |
| 0.7.1 Firmer selection | 3,590 ms | 3,590 ms | 1 |
| 0.9.0 Firmer selection | 4,826 ms | 4,826 ms | 1 |

Times start immediately before the tap and include screenshot capture and OCR
polling overhead. They are observation bounds from one run each, not a speed
benchmark. Practice card titles and their nonblank text were checked in the
recorded OCR and screenshots; white Insert buttons were not reliably OCR'd.
The baseline practice timing was recovered from its recorded polling trace.

Both selection runs used the process-text entry point with the complete input
“Please bring the tent. Pack the stove. Meet Saturday at noon.” and Firmer.
Both returned “Bring the tent. Pack the stove. Meet Saturday at noon.”

Screenshots: [baseline replies](accounts-090-baseline.png),
[candidate replies](accounts-090-candidate.png),
[candidate rewrite](accounts-090-rewrite.png).

## Validation and delivery

Lint and typecheck pass; Jest passes **48 suites, 783 tests, 46 snapshots**,
including the storage compatibility test. Both native release builds pass.
The no-mistakes Test step is deliberately skipped at firstmate's instruction:
its free test agent can grab another lane's emulator. Live sign-in/A/B evidence
is attached here; CI covers lint, typecheck, Jest and native builds/tests in
`.github/workflows/android.yml`.

Scratch evidence includes `baseline-enabled-{practice,selection}-result.json`,
`candidate-enabled-{practice,selection}-result.json`, matching OCR polling logs
and screenshots, and `jest-090-with-storage.log` under the build directory.
APK SHA-256:

- Baseline: `d63c7afbb6b89fe50c98d49bc3e10ebf683f7a63b7ae26f8eee21e06e932d069`.
- Candidate: `48f61409af0e014a36f6a7720fd762cb5db0fc56d8835db4e61ef3e0a7c19dbd`.

Final device state: setup complete restored, Ownvoice's own bubble switched
back off through the app, ChatGPT source and fresh sign-in retained, and the
owned emulator stopped. The installed candidate APK matched its recorded
SHA-256 before shutdown.

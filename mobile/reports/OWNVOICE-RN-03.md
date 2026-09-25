# Slice 3 emulator evidence

Installed the release `dev.ownvoice.next` APK on the worktree-owned `ownvoice-rn-3` AVD (Android 35, x86_64). The practice screen shows the requested fictional Sam conversation and an empty `Message` field. The router header is hidden. Only the Ownvoice accessibility service was enabled in this AVD; no physical phone was used after the device reservation instruction, and no message was sent.

Tapping the bubble showed the plain-language unsupported-phone message. The native status log recorded the exact model status **`unavailable`**. The download path therefore stopped before starting a download; no progress or model-generated drafts were available on this emulator, so first-draft timing and live streaming remain unverified here.

Screenshots (both captured from the emulator, showing only Ownvoice):

- `OWNVOICE-RN-03-01-practice.png`
- `OWNVOICE-RN-03-02-model-unavailable.png` (shows the unsupported-phone result; it does not show generated drafts)

Local checks: 81 mobile Jest tests, TypeScript typecheck, ESLint, the native hint-text unit test, and the release build passed. The tests cover numbered/preambled output cleaning, one-call-per-version fallback, and excluding input hint text. Emulator status evidence is from `adb -s emulator-5580 logcat -d -s OwnvoiceNative`: `model status unavailable`.

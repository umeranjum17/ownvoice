# Use my computer (React Native app)

Part of the ownvoice verification map. Source: `mobile/src/computer/`, helper `link/host.mjs`.

## How to get to it (user POV)

Home › Use my computer: paste the helper's code, compare the two words on both screens, then tap the bubble in a field app; the drafts are written by the paired computer. Forget this computer returns to the paste screen.

## Driving it

Harness: an owned Android emulator (or the test phone under its lock), plus the helper on the host. Android surface, not covered by the Host CLI launch above.

1. Build the release APK, start the helper (`node link/host.mjs`) with its own throwaway state folder.
2. Run `node mobile/e2e/computer-proof.mjs <apk> <out-dir>` with `ANDROID_SERIAL` and `OWNVOICE_AVD_NAME` set. It pairs, checks the words, asks for drafts, stops the helper and expects "Your computer didn't answer this time."
3. Capture: screenshots land in `<out-dir>`; keep them with the run's evidence.

## Plain-address guard

Android allows cleartext app-wide for the ws:// link, so `mobile/src/core/plainAddress.ts` refuses every other `http://` or `ws://` address (fetch seam, sign-in page, stored computer address); proof-build stand-ins pass only for the origins their `EXPO_PUBLIC_E2E_*` flags name. Prove it on the host: `cd mobile && npx jest src/core/__tests__/PlainAddress.test.ts src/computer` (release flags unset: plain model and sign-in URLs refused, the computer's ws:// still dials).

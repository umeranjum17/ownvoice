# First-run writer choice (React Native app)

Source: `mobile/app/setup.tsx`, `mobile/src/core/source.ts`, `mobile/src/chatgpt/settings.ts`.

## User journey

A fresh install opens Welcome. Continue opens **How should Ownvoice write?** with nothing selected and the main action disabled until a writer is tapped. Leaving setup with Back keeps no writer; Home asks the person to choose. A restored practice step without a chosen writer asks the same question instead of using the phone silently.

The model step after account sign-in is a separate picker slice, not covered by this feature. This slice does not change prompts, cloud model selection or offline fallback.

## Drive and prove

1. Build the baseline and candidate APKs per `mobile/README.md` with `EXPO_PUBLIC_E2E_GPT=1 EXPO_PUBLIC_E2E_STUB=1`. No credential, download or model server is needed; this journey makes no vendor requests.
2. On one allocated rooted throwaway emulator (launch through the memory gate with `-gpu guest -feature -WiFiPacketStream,-Uwb`; keep guest Wi-Fi off), run `ANDROID_SERIAL=emulator-NNNN OWNVOICE_AVD_NAME=<owned-name> OWNVOICE_BEFORE=1 node mobile/e2e/first-choice.mjs <baseline-apk> <before-folder>`, then the same command without `OWNVOICE_BEFORE` for the candidate. Use the SDK and JAVA_HOME required by `e2e/accessibility.mjs`.
3. The driver captures 360/390/445dp (720/780/890×1280 pixels at density 320) and a reachable large-screen window (1280×800 pixels at density 160), each light/dark at font 1.0/1.3. It asserts the main action and radios before/after a real tap. Each cell captures `*-choose.png`, `*-chosen.png`, `*-home.png` and `*-practice.png`, with results in `steps.json`. One candidate selection interaction is recorded as `choice-interaction.mp4`.
4. The practice case explicitly restores a synthetic legacy SQLite store containing `setup: {step: TRY, inserted: false}` and no writer source. It is a recovery fixture, not a claim that a normal fresh user can bypass the disabled choice action. The test replaces only the throwaway app's store while stopped, then rebinds its service and taps its real practice bubble. Baseline writes with the stub; candidate asks first. No owner's data is read or copied.
5. The driver verifies the actual bound service after each rebind and reads back the practice text. Bubble taps target the app-owned 56dp ImageView inside the current viewport and retain bounds/midpoints in `*-tap-*.json`. At most three taps are allowed; a new native capture or PanelActivity stops retries, and the original result assertion must still pass. The shared snapshot-readiness fix must be on the candidate before this replay.
6. Inspect every retained screenshot for painting, clipping, overlap and plain copy; seal only real-screen captures in done-done's default evidence root. Stop the owned emulator immediately after capture.

# Native Android snapshot readiness (e2e harness only)

Source: `mobile/e2e/probe/Probe.java`, `mobile/e2e/accessibility.mjs`. Screen changes: none.

On an owned rooted emulator, the self-instrumenting observer must not accept an empty window cache as a screen with no controls. It waits up to ten seconds for a readable application/overlay root, optionally scoped by `expectedPackage`, then fails explicitly if none arrives. The host wrapper rejects an empty visible result too, with a bounded instrumentation process timeout. Existing `(click)` calls and service-preserving UiAutomation flags stay unchanged.

## Drive

1. Launch the allocated emulator through the memory gate, with `-gpu guest -feature -WiFiPacketStream,-Uwb`; disable guest Wi-Fi. Use a stub APK; no browser, network, credential or writer is needed.
2. Archive main's `mobile/e2e/accessibility.mjs` and `probe/Probe.java` into a task-owned scratch tree (preserve their relative paths and the test debug keystore). Run `OWNVOICE_BEFORE=1 ANDROID_SERIAL=emulator-NNNN OWNVOICE_AVD_NAME=<owned-name> JAVA_HOME=<jdk> node mobile/e2e/probe-readiness.mjs <stub-apk> <before-out> <archived-accessibility.mjs>`.
3. Run the same command without `OWNVOICE_BEFORE` or the baseline module argument for the candidate. It opens the real app, taps Continue, holds the populated writer choice still and checks forty default snapshots plus ten package-scoped snapshots. A deliberately absent package must produce the explicit native ten-second readiness failure, not an empty successful observation.
4. Keep `observations.json`, `deadline.json`, `steps.json`, stdout/exit status and the real `*-stable-choice.png`. The screenshot is context, not proof of the observer's timing; the native call results carry that claim. Also replay real consuming app journeys (for this change: the first-run writer-choice before/after matrices).
5. Stop only the owned emulator after both proofs. Seal actual artifacts in done-done's default root and describe the registration command honestly. No screen layout or theme claim is made by this harness-only feature.

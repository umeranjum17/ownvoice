# Typing badge and Check these

On an explicitly allocated, throwaway Android emulator with setup complete and Chrome enabled in Where the bubble shows, build/install the release candidate and rebind OwnvoiceService after installation. Then extend the existing overlay journey with its spelling mode:

```sh
ANDROID_SERIAL=emulator-5630 OWNVOICE_AVD_NAME=ov-grow-f6a \
  node mobile/e2e/overlay-proof.mjs "$EVIDENCE" --typing-fix
```

Run the entire boot → install → rebind → journey → stop under the allocated device lock. `EVIDENCE` is the operator's absolute task evidence directory. The driver refuses a mismatched AVD before changing the device; set JAVA_HOME to the build JDK and put adb on PATH. It builds its standalone accessibility observer under the evidence directory without suppressing Ownvoice's service.

This mode serves synthetic normal and local X-style compose fields. It verifies correct text has no badge, five findings, one finding in a long field, native pause-to-badge time below one second, Check these and Fix, exact field readback, badge clearance, and two successive Fixes preserving both changes. The long fixture deliberately avoids the stock ending 'let me know if', which would add a second finding.

Capture is owned by this driver: host-streamed screenshots `light-before-fix.png`, `light-after-fix.png`, dark equivalents, five-finding screenshots and font-scale 1.3 before/after shots. Theme changes force-stop and rebind the service. `chrome-typing.mp4` records the light compose interaction; `typing-results.json` records assertions even on failure; `timing.md` records observed native timing. Inspect every screenshot and verify the recording has decodable frames. This is Chrome proof only, not WhatsApp, Gmail or real X-app proof.

The native insert closes the panel before verifying the app field. Its verdict must be explicitly `ok: true` before the JS list and badge advance; clipboard fallback or an absent verdict must not remove a finding. Font scale is restored in cleanup, the local server and reverse port are removed, and the caller stops its emulator.

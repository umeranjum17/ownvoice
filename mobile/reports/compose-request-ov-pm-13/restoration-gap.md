Restoration integrity handoff

Owned emulator-5684 stopped fully (adb emu kill returned OK; emulator process wait completed). Session 37889 returned exit 0. Lifetime locks closed, and a different owner acquired both locks. No further emulator action from this lane is authorized without a coordinated window.

Original retained nonsecret settings captured before any install:
- enabled_accessibility_services = dev.ownvoice.next/dev.ownvoice.bridge.OwnvoiceService
- accessibility_enabled = 1

Cleanup attempted, in order:
1. flock /tmp/fm-ownvoice-heavy.lock adb -s emulator-5684 install -r /home/umer/lab-tmp/ov-pm-13/prior-signed.apk
   Result: Success, exit 0 recorded in restore.exit.
2. adb -s emulator-5684 shell settings put secure enabled_accessibility_services ''
   Result: Bad arguments. The empty local argv did not survive adb remote-shell argument joining. This clear attempt failed.
3. adb -s emulator-5684 shell settings put secure enabled_accessibility_services dev.ownvoice.next/dev.ownvoice.bridge.OwnvoiceService
   Result: no diagnostic output; individual exit status was not recorded (cleanup uses set +e).
4. adb -s emulator-5684 shell settings put secure accessibility_enabled 1
   Result: no diagnostic output; individual exit status was not recorded.
5. adb -s emulator-5684 emu kill; wait owned emulator process
   Result: OK, process exited before lifetime locks released.

Actual post-cleanup setting readback: NOT CAPTURED. Original vs restored equality and accessibility service binding are therefore unproven. Prior APK install succeeded; installed-package hash was not reread after restore.

Requested coordinated next-owner check: read the two nonsecret settings and verify original values above; verify accessibility binding as needed. If a rebind is required, pass the complete remote-shell command as ONE adb shell argument, preserving a remote empty string (settings put secure enabled_accessibility_services ''). Then write the exact prior service value and accessibility_enabled 1, and capture readback. Do not alter signed account, profile or preferences beyond this exact service restoration. This lane will not reboot or touch another owner's emulator.

Coordinated final resolution (2026-10-01)

The next authorized owner observed enabled_accessibility_services=null and accessibility_enabled=0 before correction; initial equality is NOT claimed. Minimum corrective activation restored dev.ownvoice.next/dev.ownvoice.bridge.OwnvoiceService and accessibility_enabled=1, with exact final nonsecret readback. Prior installed APK SHA256 was verified as 034d669751bd49c5dc2d9ff827c74df7abf4e1d0bbdcfc20f6be8e71ae2b581f. The owner restored its opaque saved DB/native preferences and verified connected-profile UI=true; this lane never inspected or copied tokens. Its owned emulator PID3591506 exited at 2026-10-01T11:40:30.574350Z and its serial was absent.

Source: Firstmate message011 and retained task evidence/restoration-final-update.md, referencing the coordinated owner's authorized owned-restoration-final.txt and owned-shutdown.txt receipts. This later resolution closes the operational gap without changing the unsuccessful original cleanup/readback chronology above. No fresh emulator execution was performed for this documentation correction.

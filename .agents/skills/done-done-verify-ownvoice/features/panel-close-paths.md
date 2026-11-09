# Panel handoffs and insertion (Android)

The panel must remove its sheet before the window finishes when a person opens the writer list, opens the source picker, or puts a draft in a field. The host CLI does not prove these Android paths.

## Drive

Build an emulator release APK with `EXPO_PUBLIC_E2E_STUB=1` using the Android build instructions in `mobile/README.md`. Start an owned rooted emulator, with Wi-Fi off, and set `ANDROID_SERIAL`, `OWNVOICE_AVD_NAME`, `APK`, and `PANEL_SCRATCH` to its serial, AVD name, stub APK, and owned scratch directory. Run `done-done run panel-close-paths`. The journey uses an X-style lab composer and synthetic app-owned writer choices, no account or network. It opens the source picker ten times and verifies its contents, inserts a generated draft in the lab field, then opens the writer list ten times and verifies its contents. It checks that each process stays alive across its cycles and that the crash buffer has no fatal exception. It never sends the draft.

## Evidence

The run writes `driver.log`, `crash.log`, `steps.json`, and real-screen `source-picker.png`, `inserted-draft.png`, and `writer-list.png`. Read the driver log for all twenty cycles and the inserted field text. The fixture proves these Android panel paths, not a real third-party app or a live writer.

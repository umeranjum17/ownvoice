# OV-7: shared overlay migration and emulator proof

This report records the initial overlay 0.2.2 migration and its emulator evidence. The dependency was subsequently upgraded for accessible tap activation and insert cancellation; see [`package.json`](../package.json) for the current pin and [Android developer notes](../README.md#android-build-and-device-checks) for current integration ownership.

The migration preserved sign-in, phone-only promises and app words. Current default apps are owned by [`defaultApps.json`](../src/core/defaultApps.json); event subscriptions and opt-in typing are defined by [`OwnvoiceService.kt`](../modules/ownvoice-native/android/src/main/java/dev/ownvoice/bridge/OwnvoiceService.kt) and its [service config](../modules/ownvoice-native/android/src/main/res/xml/ownvoice_service.xml).

Legacy per-app spot compatibility is implemented in [`migrateSpots`](../modules/ownvoice-native/android/src/main/java/dev/ownvoice/bridge/OwnvoiceService.kt) and [`legacySpot`](../modules/ownvoice-native/android/src/main/java/dev/ownvoice/bridge/LegacySpot.kt).

## Approved geometry

Firstmate resolved `overlay022-placement` on 2026-09-30: use the shared kit geometry, provided the bubble stays above the keyboard and clear of the focused field. No private geometry implementation was added.

| Behaviour | Before | Kit 0.2.2 |
| --- | --- | --- |
| Bubble size | 52 dp | 56 dp |
| Edge inset | 8 dp | 0 |
| Keyboard gap | 8 dp | 0 |
| Drag threshold | 12 dp on either axis | 8 dp Euclidean |

Before (existing RN-14 keyboard proof) and after (OV-7 focused textarea proof), showing the approved size/edge/gap differences:

![Before migration](ov7-overlay/before-keyboard.webp)
![After migration](ov7-overlay/after-keyboard.webp)

The captured bubble is wholly above the keyboard and does not intersect the focused field; see [raw geometry](ov7-overlay/geometry.json) for measured bounds.

## Validation

These recorded runs cover the initial 0.2.2 migration, before the later accessible-tap and cancellation fixes. They do not establish live acceptance of the current dependency pin.

- Final-main Expo prebuild and release assembly passed (752 tasks); module and kit JVM tests passed, including captured input, copy-only, placement equivalents and legacy-spot migration.
- Legacy app debug assembly and JVM tests passed.
- Lint/typecheck passed with throwaway HOME; 47 Jest suites, 767 tests and 46 snapshots passed.
- Flag-cache regression passed: clean/normal-after-flags both 4 markers; removing the cache fix yielded 6. The lab screen stayed out of normal exports.
- First-run light/dark passed on the rebuilt APK: ChatGPT stand-in selected/connected, plain text, practice insertion landed.
- Insertion driver passed RN and Chrome textarea/contenteditable multiline read-back, pause/resume, per-app off/on and service rebind after reinstall. Contenteditable returned the kit's newline-loss success; textarea retained line breaks.
- Overlay proof passed keyboard/field clearance, TalkBack label `Ownvoice`, keyboard-close spot restoration, tap-only typing while off, opt-in count `Ownvoice, one thing to check`, password exclusion, kill -9 + am start restore, and emulator reboot restore without service toggles.
- rn08 light copy/share/clipboard/new-number checks passed. The bounded accessible-menu fix then passed the complete dark handback rerun plus R5 and light/dark panel-verdict scenarios. The terminal log reports: “Rewrite R1-R5, Copy fingerprints, the new-number warning, the hidden bubble and the panel verdict note all check out.” [Scenario evidence](ov7-overlay/rn08-evidence.txt).


The standalone probe instruments itself with `FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES`, leaving Ownvoice's process/service attached. It reads actual switch checked state, labels and editable values, and omits password text. Harness navigation uses Expo route links; rewrite chips use physical taps on accessible bounds. Copy handback compares the editable field exactly, avoiding a false failure from the shortened Copy toast. OCR is used where accessible targeting is unavailable.

Logs/screenshots are under `/home/umer/lab-tmp/ov-eng-7`: `release-final-main.log`, `jest-rebased.log`, `flag-cache-final.log`, `first-run-rebased.log`, `driver-routes-final.log`, `overlay-proof-final.log`, and `rn08-dark-final.log` (final green run), with earlier harness diagnostics in `rn08-verified.log`, `rn08-dark-menu-state.txt`, and `rn08-dark-menu.png`. Lane AVD is `ov-eng-7` / `emulator-5582`; it was stopped after the final green dark validation round. Nothing pushed; no no-mistakes run started.

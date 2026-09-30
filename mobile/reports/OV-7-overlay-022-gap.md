# OV-7: overlay 0.2.2 placement decision

Firstmate resolved `overlay022-placement` on 2026-09-30: use the kit's shared geometry, provided the bubble is fully above the keyboard and clear of the focused field. The small visual differences below are approved and must be shown in the PR body with before/after captures. No private placement implementation was added.

| Behaviour | Ownvoice before migration | `@byokit/overlay` 0.2.2 |
| --- | --- | --- |
| Bubble size | 52 dp | Fixed 56 dp in `Bubble.build` |
| Edge inset | 8 dp in `OwnvoiceService.place` | Fixed 0 in `Placement.toPixels` |
| Keyboard clearance | 8 dp in `OwnvoiceService.place` | Fixed 0 in `Placement.restBottom` |
| Drag threshold | 12 dp on either axis | 8 dp Euclidean distance |

`ServiceBubble.Config` exposes mood, label, rules, per-app spots and panel visibility. The kit supplies the geometry and gestures. The approval does not permit a bubble over the keyboard or focused field; those remain emulator acceptance gates.

Ownvoice's old per-app spots are migrated as app data: `ownvoice-native` / `bubble:<package>` (`Left|Right,<pixelTopBelowStatusBar>`) is decoded once and handed to the public kit `Placement.snap` and `SpotStore` contracts. A saved kit spot always wins; malformed old values keep the kit default. The kit owns all ongoing placement and persistence.

## Current checkpoint

Branch `fm/ov-eng-7` includes the prior bubble migration and is rebased onto origin/main. Overlay is pinned exactly at npm 0.2.2. Its `FieldNode.of` adapter is captured at tap time; the private adapter is removed. Focused-field text for tap and opt-in typing uses the kit. Default apps have one JSON source compiled into both Android apps and imported by JavaScript. The service subscribes only to the used text-change event; no sign-in or phone-only promise changes.

Validation completed: expo prebuild; release assembly; module and kit JVM suites; legacy app debug assembly/JVM suite; lint/typecheck; 47 Jest suites / 764 tests / 46 snapshots. The multiline fixture's 37 writer tests passed. A fresh prebuild/release also passed (752 tasks; build-final.log) after restoring the full npm-ci graph (the earlier legacy-peer-deps install had removed Safe Area and generated stale autolinking). The first emulator run exposed that stale build's RNCSafeAreaProvider crash; it was not accepted as a pass. First-run light/dark acceptance passed with successful practice inserts on the fresh APK. Firstmate approved replacing OCR switch-state reads with a standalone test instrumentation APK. The committed probe instruments itself with `FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES`, reports switch checked state and bubble content descriptions, and never reads password text. Driver and rn08 controls prefer accessibility nodes with OCR fallback; the stale-installed-APK refusal test remains green. Lint/typecheck passed after the initial tooling change, and lint passed after the rn08/navigation changes.

The RN/Chrome driver then hit the same navigation failure twice: its second app-choice visit (Chrome) remained on Home after tapping the accessible “Where the bubble shows” row. The first failure reported `Could not find visible Find an app`; the second reproduced after explicitly selecting the clickable Home row (logged center `540,1243.5`). A separate manual integer-coordinate tap opened the app list, whose accessible nodes exposed the Chrome checked state correctly. No product or kit workaround was added. The second driver was terminated at this repeated failure, and lane AVD `ov-eng-7` (`emulator-5582`) was stopped. Chrome insertion, full rn08, keyboard/field clearance, reboot/process-death and typing acceptance remain outstanding. The probe confirms the actual bubble accessibility label `Ownvoice`. Nothing pushed and no no-mistakes run started.

Firstmate's next steering prescribed integer tap coordinates. Commit `801fe9f` rounds both coordinates in the driver's sole `tap` wrapper with `Math.round`, and lint passed. The rerun still failed on the Chrome app-choice visit with `Could not find visible Find an app` at `chooseApp` line 147. The Home-row diagnostic logs its raw center (`540,1243.5`), but the actual adb arguments are rounded (`540`, `1244`). The screenshot and accessible state still show Home. The lane emulator was stopped after this failed run. Rounding alone has not resolved the navigation blocker.

Evidence for the rounded rerun: `/home/umer/lab-tmp/ov-eng-7/driver-rounded.log`, `rounded-navigation.png`, and `rounded-navigation-state.txt`.

Evidence: `/home/umer/lab-tmp/ov-eng-7/driver-accessible.log`, `driver-accessible-final.log`, `driver-current.png`, `driver-navigation-state.txt`, and `apps-state.txt`.

Heavy logs and the temporary nonsuppressing UiAutomation probe are under `/home/umer/lab-tmp/ov-eng-7`. The probe is validation tooling only; `getUiAutomation(FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES)` preserved Ownvoice while recording its real label and the per-app switch states. Host emulator RenderThread crashed with SIGSEGV under its default renderer; the SwiftShader/Vulkan-disabled retry stayed up through both first-run modes and the subsequent driver checks.

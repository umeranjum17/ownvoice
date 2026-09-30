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

Validation completed: expo prebuild; release assembly; module and kit JVM suites; legacy app debug assembly/JVM suite; lint/typecheck; 47 Jest suites / 764 tests / 46 snapshots. The multiline fixture's 37 writer tests passed. A fresh prebuild/release also passed (752 tasks; build-final.log) after restoring the full npm-ci graph (the earlier legacy-peer-deps install had removed Safe Area and generated stale autolinking). The first emulator run exposed that stale build's RNCSafeAreaProvider crash; it was not accepted as a pass. First-run light/dark acceptance passed with successful practice inserts on the fresh APK. The RN/Chrome driver is blocked by repeated OCR misses of the small per-app Off state (Ownvoice and Chrome); screenshots and a nonsuppressing accessibility probe confirm the UI state is correct. A separate first driver attempt clicked Share instead of Use this because it centered the whole action row; the driver now targets the first draft button. Chrome insertion, full rn08, keyboard/field clearance, reboot/process-death and typing acceptance remain outstanding. The nonsuppressing probe did confirm the actual bubble accessibility label `Ownvoice`. Lane AVD `ov-eng-7`, serial `emulator-5582`, was stopped. Nothing pushed and no no-mistakes run started.

Heavy logs and the temporary nonsuppressing UiAutomation probe are under `/home/umer/lab-tmp/ov-eng-7`. The probe is validation tooling only; `getUiAutomation(FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES)` preserved Ownvoice while recording its real label and the per-app switch states. Host emulator RenderThread crashed with SIGSEGV under its default renderer; the SwiftShader/Vulkan-disabled retry stayed up through both first-run modes and the subsequent driver checks.

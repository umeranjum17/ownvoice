# OV-7: overlay 0.2.2 placement decision

The task requires the person's bubble placement and keyboard avoidance to stay the same. The npm kit's public Kotlin path cannot currently express Ownvoice's dimensions and gaps. No private implementation was added to compensate.

| Behaviour | Ownvoice before migration | `@byokit/overlay` 0.2.2 |
| --- | --- | --- |
| Bubble size | 52 dp | Fixed 56 dp in `Bubble.build` |
| Edge inset | 8 dp in `OwnvoiceService.place` | Fixed 0 in `Placement.toPixels` |
| Keyboard clearance | 8 dp in `OwnvoiceService.place` | Fixed 0 in `Placement.restBottom` |
| Drag threshold | 12 dp on either axis | 8 dp Euclidean distance |

`ServiceBubble.Config` exposes mood, label, rules, per-app spots and panel visibility. `Bubble` and `Placement` expose no size, edge-gap, keyboard-gap or drag-policy option. Replacing BubbleControl or wrapping the host to compensate would recreate kit behaviour privately, which the brief forbids. BYOKit needs public configuration for Ownvoice's existing placement/gesture policy, or firstmate needs an explicit decision allowing the changed behaviour.

Existing per-app spots also need a data migration: Ownvoice persisted `ownvoice-native` / `bubble:<package>` as `Left|Right,<pixelTopBelowStatusBar>`; the migration currently uses the kit's `byokit.overlay.spots` / `app:<package>` with `LEFT|RIGHT,<fraction>`. Merely switching stores loses a person's saved position. The kit's public SpotStore can receive migrated values, but converting coordinates must follow the eventual supported placement policy. No migration workaround was implemented.

## Current checkpoint

Branch `fm/ov-eng-7` includes the prior bubble migration and is rebased onto origin/main. Overlay is pinned exactly at npm 0.2.2. Its `FieldNode.of` adapter is captured at tap time; the private adapter is removed. Focused-field text for tap and opt-in typing uses the kit. Default apps have one JSON source compiled into both Android apps and imported by JavaScript. The service subscribes only to the used text-change event; no sign-in or phone-only promise changes.

Validation completed: expo prebuild; release assembly; module and kit JVM suites; legacy app debug assembly/JVM suite; lint/typecheck; 47 Jest suites / 764 tests / 46 snapshots. The multiline fixture's 37 writer tests passed. A fresh prebuild/release also passed (752 tasks; build-final.log) after restoring the full npm-ci graph (the earlier legacy-peer-deps install had removed Safe Area and generated stale autolinking). The first emulator run exposed that stale build's RNCSafeAreaProvider crash; it was not accepted as a pass. Full first-run/rn08/Chrome/reboot/typing/TalkBack acceptance remains outstanding. Lane AVD `ov-eng-7`, serial `emulator-5582`, was stopped. Nothing pushed and no no-mistakes run started.

Heavy logs and the temporary nonsuppressing UiAutomation probe are under `/home/umer/lab-tmp/ov-eng-7`. The probe is validation tooling only and has not yet been used to claim a label check.

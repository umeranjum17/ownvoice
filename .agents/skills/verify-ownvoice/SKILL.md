---
name: verify-ownvoice
description: Verify Ownvoice by driving its real surfaces — the ownvoice-engine JSON protocol CLI on the host (always available), and the Android app through the mobile/e2e drivers on a throwaway emulator (only with an explicit device allocation). Use when an Ownvoice change needs behavioral proof, or when asked to run, prove or verify Ownvoice.
---

# Verify Ownvoice

Two drivable surfaces. The **host surface** is the published `ownvoice-engine` package (`packages/engine`): a model-free JSON protocol with a CLI, documented in `packages/engine/README.md`. The **primary surface** is the Android app (`mobile/`): an accessibility bubble that drafts replies, polishes text and rewrites selections; its drivers live in `mobile/e2e/`. The host surface is a real consumer seam, not an Android equivalent — never claim Android behavior from engine-only proof.

## Launch

Host (no emulator, no model, no network):

```sh
cd packages/engine && npm ci && npm run build   # writes dist/ (gitignored)
node dist/cli.mjs hello                          # readiness: {"protocol":2,"version":"0.2.0"}
```

Use an isolated `HOME`/`XDG_*` and an `npm_config_cache` outside the real home. Android: build a release APK from `mobile/` per `mobile/README.md` ("Android build and device checks"; `EXPO_PUBLIC_E2E_STUB=1` for emulator-only acceptance), then boot a throwaway emulator. Android launch needs an explicit lifetime allocation from the operator; the test phone is BYOKit-owned — never install on, connect to, or change settings on it.

## Doctor

Run before driving whenever anything looks off (all read-only):

```sh
cd packages/engine
node dist/cli.mjs hello        # version must equal version in package.json
npm ls --omit=dev              # must be empty: no runtime dependencies
node dist/cli.mjs schema       # prints protocol/schema.json
node -e "console.log(process.version)"   # >= 18
```

Android: drivers refuse non-`emulator-` serials and verify `OWNVOICE_AVD_NAME`. The shared `emulatorName` reader uses `adb emu avd name`, falling back only on blank output to `getprop ro.boot.qemu.avd_name` (the console path can return nothing under isolated HOME). A nonblank mismatch, or both readings blank, still refuses the journey.

## Drive

Host: one JSON request on stdin, one response on stdout — see [features/engine-protocol.md](features/engine-protocol.md) for exact requests. Android: run the documented driver for the feature — see the other files in [features/](features/), including [typing checks](features/typing-check.md) for the overlay journey's spelling/Fix mode and its driver-owned captures. Reuse these instruments; do not write a new harness when one exists.

## Review evidence (fleet standard)

The skill produces every proof a reviewer checks; nothing is hand-captured around it. For a user-visible change, capture into **one stable evidence folder** `verify-artifacts/<task>/` (gitignored, never committed): `<task>` is the task slug the caller names, and the same folder is reused by every run of that task, so before and after sit side by side — the path never changes between runs. The PR names the folder. The set:

- every screen the change touches, **before** (base build) and **after** (candidate build);
- in every theme the app has: light and dark — it has no others;
- at every form factor the app has: **phone width only** — an Android phone app with no tablet or desktop layout (no width-adaptive layout in `mobile/src`); add the new width here if one ever ships, until then phone is the whole matrix, not a skip;
- plus one motion recording (mp4) of each changed interaction.

[evidence.sh](evidence.sh) (executable, run from the repo root) owns the capture:

```sh
.agents/skills/verify-ownvoice/evidence.sh pair <task> <screen> <label> -- \
  adb shell am start -n dev.ownvoice.next/.MainActivity   # or a deep link / driver navigation
.agents/skills/verify-ownvoice/evidence.sh motion-start <task> <interaction>
# …perform the interaction (guarded DPAD activation on sheets, below)…
.agents/skills/verify-ownvoice/evidence.sh motion-stop
```

`pair` force-stops the app, flips the theme, relaunches and settles before each shot — RN reads the colour scheme at process start, and the emulator's twilight schedule is disabled first (the sequence `mobile/e2e/first-run.mjs` uses). Run `pair` with label `before` on the base build and `after` on the candidate. `theme` and `shot` exist for screens a driver has already put on display. Screenshots stream host-side via `adb exec-out screencap -p` — never screencap to device storage such as `/sdcard/Download` (EACCES on real phones); recordings pull from `/data/local/tmp`.

**Guarded DPAD activation on sheets:** controls on the translucent drafts panel and rewrite sheet swallow `adb shell input tap` — the tap lands and nothing fires. Navigate with `input keyevent 19/20/21/22` and activate a focused React Native button with `keyevent 23` (DPAD_CENTER). Enter (`66`) did not activate Use this in the F6a emulator journey; retain that as a keyboard finding, not an app fix. Taps work on setup and Home screens and on the bubble itself; tapping the dimmed area dismisses a sheet. Panel sequence: tap the bubble and wait for cards in the accessibility tree. Send `input keyevent 4` **only if** `dumpsys input_method` reports `mInputShown=true`; otherwise Back dismisses the sheet. Step `input keyevent 61` (TAB) one at a time, at most twelve steps, logging the focused node after each. Alternatively, use DOWN to enter the intended card, then LEFT to reach that row's Use this. DOWN alone can skip suggestion cards' Use this and land on Copy; record this keyboard-navigation finding, not as a fixed app defect. Fit bars can take focus stops: require the intended card's action to have keyboard/accessibility focus before sending `keyevent 23`; refuse and capture the focus trail/screenshot if it never does. The earlier fixed DOWN sequence inserted the first card on 2026-10-04 but is not sufficient for every card layout. (Evidence: retro 2026-10-04 `state/ov-gmail-replies.status`; `mobile/reports/live-proof-p9.md`.)

**Service after force-stops:** `pair` and any `am force-stop` unbind the accessibility service (Android rebinds only when `enabled_accessibility_services` changes), so later captures of bubble/panel screens need the documented off/on service toggle first; app screens like Home are unaffected.

## Evidence

One stable folder per task: `verify-artifacts/<task>/` (Review evidence above). Review captures sit at its top level; behavioral proofs, driver logs and CLI transcripts under `verify-artifacts/<task>/<feature>/`. Capture the command, stdout, stderr and exit code for CLI proof; screenshots plus driver logs for Android. Use synthetic text only. State the feature ID and entry point with every artifact. Never commit media — public repos link the private evidence page and the PR names the folder.

## Cleanup

Host: remove scratch request files; `dist/` is regenerable build output. Android: the drivers restore what they change; kill only emulators this run started. Cleanup never touches `verify-artifacts/` — after cleanup, confirm the evidence still exists at `verify-artifacts/<task>/`.

## Helpers

One shipped helper: [evidence.sh](evidence.sh) (executable) — theme flips, host-side screenshots, the before/after `pair` matrix and motion recordings into the stable evidence folder; invocations shown in Review evidence above. Every other drive is a repo one-liner or an existing `mobile/e2e/*.mjs` driver named in the feature map.

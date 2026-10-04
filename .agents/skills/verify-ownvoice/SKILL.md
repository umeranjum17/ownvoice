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

Android: `adb devices` shows only emulators you own; drivers themselves refuse non-`emulator-` serials and verify `OWNVOICE_AVD_NAME`.

## Drive

Host: one JSON request on stdin, one response on stdout — see [features/engine-protocol.md](features/engine-protocol.md) for exact requests. Android: run the documented driver for the feature — see the other files in [features/](features/). Reuse these instruments; do not write a new harness when one exists.

## Evidence

Save under `verify-artifacts/<feature>/<run>/` (gitignored; never committed). Capture the command, stdout, stderr and exit code for CLI proof; screenshots plus driver logs for Android. Use synthetic text only. State the feature ID and entry point with every artifact.

## Cleanup

Host: remove scratch request files; `dist/` is regenerable build output. Android: the drivers restore what they change; kill only emulators this run started. Cleanup never touches `verify-artifacts/` — after cleanup, confirm the evidence still exists there.

## Helpers

None shipped: every drive is a repo one-liner or an existing `mobile/e2e/*.mjs` driver named in the feature map.

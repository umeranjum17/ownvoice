# Ownvoice verification map

The maintained source for verifying user-facing behavior. Read this index, then use the feature file as the recipe. Keep the map honest as features change (`/maintain-verification-skill`).

## Baseline preconditions

- Host runs need only Node 18+ and a built `packages/engine/dist` (see the skill's Launch).
- Android runs additionally need an explicit device allocation, a throwaway emulator (`emulator-NNNN`), `JAVA_HOME`, an Android SDK, and `adb`, `zip`, `tesseract`, `magick` on `PATH`.
- Never drive the BYOKit-owned test phone, a personal app, or an emulator without a current explicit allocation. For a shared allocated serial, use the allocation's device lock and leave emulator lifetime with its owner.

## Proof and skip reporting

- Capture the action and the resulting state (command + stdout + exit code, or screenshot + driver log), not only a final screen.
- Review evidence for a user-visible change goes through the skill's own capture (see the skill's Review evidence): every changed screen before/after × light/dark, phone width (the only form factor this app has), one motion recording per changed interaction, all in the stable `verify-artifacts/<task>/` folder.
- Record the feature ID and entry point with every artifact under `verify-artifacts/<task>/`.
- The host engine surface is a consumer seam, not Android: say which surface a proof drove.
- Report an unreachable path with the attempted command and unmet precondition; never report it verified through another path.

## Feature entry contract

Each file: H1 + one paragraph, then exactly four H2s — `Sub-features`, `How to get to it (user POV)`, `Driving it with <harness>` (starts with `Preconditions:`), `Gotchas`.

## Features

- [Engine protocol](./engine-protocol.md) — host CLI: `check`, `voice.parse`, error envelopes, bounded input.
- [Reply drafts](./reply-drafts.md) — Android: bubble tap offers replies; Insert puts one in the field.
- [First-run setup](./first-run-setup.md) — Android: welcome through writer choice, permission, practice insert.
- [Rewrite a selection](./rewrite-selection.md) — Android: process-text/share hand-over-only rewrite sheet.
- [Local reply outcomes](./reply-outcomes.md) — Android: insert → real local store → read-back, text opt-in and failed append.
- [Fit calibration](./fit-calibration.md) — host: seeded local outcome files → G9 pass, fail or not enough yet; approved calibration-only slice, account-analytics export not verified for his plan, weekly numbers stay manual.
- [Own posts](./own-posts.md) — Android: a blank feed composer asks for the one line, then drafts from it; edit one and insert it.
- [Typing checks](./typing-checks.md) — Android: readable-field counts, honest capped-field disclosure, disabled partial Fix and Insert, fresh-field recovery.

Not yet mapped: Home/settings walk (`mobile/e2e/settings.mjs`), overlay behaviors (`overlay-proof.mjs`), prefill hand-off (`proof-prefill.mjs`).

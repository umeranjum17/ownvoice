# First-run setup

A fresh install opens Welcome, asks **How should Ownvoice write?** (this phone where it can write, or one of the person's accounts — ChatGPT by device code, or Claude by pasting the code its own page shows back — signed in inside the step), explains the permission, runs a practice chat whose first inserted draft ends the practice step, then offers installed apps for **Where should I help?**. Hardware Back finishes; **Not now** skips.

## Sub-features

- `setup-order`: the five steps appear in order and survive process death.
- `setup-writer`: the writer step offers every account the app can sign into (ChatGPT and Claude on a phone that can't write, Claude's card first), each signed in inside the step.
- `setup-writer-chatgpt`: choosing ChatGPT starts the kit's device-code sign-in and shows the code.
- `setup-writer-claude`: choosing Claude opens the Claude page and shows the paste field; the code it shows is pasted back through the kit's `paste('claude', code)` seam — the same shared piece (`src/ui/ClaudeSignIn.tsx`) as How Ownvoice writes, no second copy.
- `setup-permission`: the explained permission step, greyed-switch help included.
- `setup-practice`: the practice chat's inserted draft ends the practice step (setup continues to the app list).
- `setup-plain-words`: no screen shows technical words.

## How to get to it (user POV)

- Open Ownvoice on a fresh install (or after `pm clear`); setup opens by itself, and returns to the front after the service connects (`ownvoice://setup`).

## Driving it on the emulator

Preconditions:

- Explicit emulator allocation (this project uses `emulator-5630`, AVD `ov-grow-f6a`); a release APK built with `EXPO_PUBLIC_E2E_STUB=1` and, for the ChatGPT leg, `EXPO_PUBLIC_E2E_AUTH_BASE=http://10.0.2.2:<port>` pointing at the host `mockOpenAI` stand-in (`@byokit/accounts/testing`), as `mobile/e2e/plan-signin-proof.mjs` does; `ANDROID_SERIAL=emulator-NNNN`. The stand-in is plain HTTP, so the APK must be prebuilt *after* `EXPO_PUBLIC_E2E_AUTH_BASE` is set (`npx expo prebuild --platform android --no-install`; `app.config.js` adds `usesCleartextTraffic` only then), not just bundled with it.

- **Writer step (the changed screen).** On this emulator the phone row reads **Private and free** (its LocalModel reports the one-time download still owed), so the step shows **On this phone**, **With your Claude** (first) and **With your ChatGPT**, with a footer **Continue**; on a phone that cannot write the phone row is dimmed and the footer is **Sign in**/**Not now**. Either way tap the card's row to select it, then tap the footer. Capture light and dark with `.agents/skills/verify-ownvoice/evidence.sh` (`theme` then `shot`), tapping with `adb shell input tap` after `am start -n dev.ownvoice.next/.MainActivity`.
- **Claude leg.** Select **With your Claude**, then tap the footer (**Continue** here): the step shows the paste-back sign-in (open the Claude page, the paste field, **Connect**). No signed-in account or real draft is needed for this leg.
- **ChatGPT leg.** Select **With your ChatGPT**, then tap the footer: the step starts the kit's device-code sign-in and shows **Your code**; with the mockOpenAI stand-in the host issues the code.
- **Known gap (2026-10-10).** `mobile/e2e/first-run.mjs` is stale on the writer sign-in: it taps a `Continue with` control the step no longer has, and its ChatGPT leg expects the offline session mock (`EXPO_PUBLIC_E2E_GPT=1`) that the step does not use (the step drives the kit's own `@byokit/accounts` sign-in), so its connected/practice legs do not run as written. Drive the writer step with `evidence.sh` plus taps until the driver is rebuilt.

## Gotchas

- An emulator's phone row reads as downloadable, not "can't write", so the writer step shows all three cards; the account cards (Claude, ChatGPT) are what this run proves. A phone that cannot write shows the same cards with no usable phone row and a **Sign in** footer.
- The emulator's twilight schedule flips night mode overnight — force each mode before its screenshots (`evidence.sh theme`).
- Shell input and screencap only; UiAutomator would unbind the service.
- Never use `EXPO_PUBLIC_E2E_*`-flagged builds for distributable APKs.

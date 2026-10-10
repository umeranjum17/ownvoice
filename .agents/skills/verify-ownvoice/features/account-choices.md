# Account choices (How Ownvoice writes)

Home's **How Ownvoice writes** screen (`/source`) lists the writer options as cards: **On this phone**, **With your ChatGPT**, **With your Claude**, and **With your OpenRouter**. The chosen card shows how that account is doing; the phone and a signed-in account can be switched between, switching to a cloud account asks first (or signs in inside its card), and the writer and the reply rating both send through the chosen account.

## Sub-features

- `writer-list`: the screen lists this phone, ChatGPT, Claude and OpenRouter, in that order. OpenRouter's card reads **With your OpenRouter** / **Your own key, paid as you use it** (it is billed per use, not a plan).
- `writer-chatgpt`: the ChatGPT card signs in with the device code (copy and open, then Continue) and signing out falls back to the phone where it can write.
- `writer-claude`: the Claude card opens the Claude page and pastes the code it shows back into the field; a signed-in Claude account produces drafts through the writer.
- `writer-openrouter`: the OpenRouter card is a key route, not a plan sign-in — the person pastes their own OpenRouter key into the field and the kit saves it only in this phone's secure store (no page to open, no code to poll). The default writer is DeepSeek V4.1 Flash; a signed-in OpenRouter account produces real drafts through the kit (`Accounts.respondKey`), never a direct provider SDK or hand-rolled HTTP.
- `writer-routing`: with Claude chosen, replies, polish and the reply rating all reach Claude; with ChatGPT they reach ChatGPT; with OpenRouter they reach OpenRouter; the chosen account's own plain lines show on failure.
- `writer-plain-words`: no screen shows technical words.

## How to get to it (user POV)

- Home › **How Ownvoice writes**, or the writer button on Home's readiness card (`/source?start=claude` when Claude is the chosen account and signed out).
- Pick a card; switching back to **On this phone** is immediate, switching to an account asks once, then **Switch to Claude** or **Switch to ChatGPT**.

## Driving it with a release build and the DPAD/tap recipe

Preconditions:

- Explicit emulator allocation; a release APK (a live writer needs a signed-in plan; the on-phone model cannot run on an emulator). For emulator-only acceptance a signed ChatGPT stand-in is enough for the ChatGPT leg.
- `ANDROID_SERIAL=emulator-NNNN`; `adb`, `zip`, `tesseract`, `magick` on `PATH`; use `.agents/skills/verify-ownvoice/evidence.sh` for the before/after and motion capture.

- **List and sign-in.** `am start -n dev.ownvoice.next/.MainActivity`, then open the writer row and capture the four cards. For the ChatGPT leg use the `EXPO_PUBLIC_E2E_GPT=1 EXPO_PUBLIC_E2E_STUB=1` build (in-step code stand-in). For the Claude leg, finish the kit's own paste flow on the person's session, then tap the bubble in a chat field and read the inserted draft back. For the OpenRouter leg, run `mobile/e2e/openrouter-proof.mjs` (same build): it finishes setup with no writer (hardware Back), opens the writer list (`/source`), taps the **With your OpenRouter** card, pastes the key from `OPENROUTER_KEY_FILE` (`~/.config/openrouter/api_key`) into the kit's own field via `adb shell input text` (never printed, logged, committed or screenshotted), connects, then types a real reply into a Chrome text field and taps the bubble for a real DeepSeek polish panel (with a Shorter rewrite), light and dark. It refuses to run if the writer list does not offer OpenRouter, which means the kit reported its key route not ready.
- **Routing.** With each account chosen, tap the bubble over a reply field and confirm a draft lands; the providers must show their own failure lines (Claude's say Claude, ChatGPT's say ChatGPT, OpenRouter's say OpenRouter).
- **Proof.** Copy the writer-choice and draft screenshots into `verify-artifacts/<task>/account-choices/` with the driver/CLI transcript (stable per-task folder — see the skill's Review evidence).

## Gotchas

- Emulators have no phone writer: the ChatGPT stand-in and the allocated Claude credential lead, and the OpenRouter leg reaches the real API; never claim phone-writer behavior from an emulator run.
- The OpenRouter key is a real, billable secret: read it only into the app's paste field, and never print, screenshot, commit or log it; the emulator proof build reaches the real OpenRouter API (no stand-in).
- The `/source` screen is where accounts are switched and added after setup; the first-run writer step (`/setup`) now offers Claude too, with the same paste-back sign-in (`src/ui/ClaudeSignIn.tsx`). OpenRouter is added only from `/source`, not in first-run setup, so the proof reaches it there.
- `pair` force-stops the app and loses the accessibility binding, and a cleared-data setup loses the account: re-run the sign-in and the off/on service toggle inside the launch command.
- Never read or copy another tool's Claude/ChatGPT credentials; the Claude leg uses only the allocated test credential.

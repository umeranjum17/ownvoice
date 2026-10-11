# Polish / output-fix sheets (real cloud writer)

From a Chrome lab composer, tapping the bubble must return the honest polish result for the output-fix
cases: **autosave** is never rewritten to **autoclave**, a sentence the rewrite splits keeps its capital
after the full stop, meaningless text is honestly declined instead of getting invented versions, an empty
box asks for a line first, keyboard mash is declined, and the documented Chrome capture limit renders
honestly with no clipping. Each case runs against the **real cloud writer** (OpenRouter / DeepSeek V4.1
Flash through the kit), never the canned phone stub.

## Sub-features

- `polish-autosave`: "autosave locally and make export easy." keeps `autosave` and offers no `autoclave`.
- `polish-split-capital`: a version that splits the sentence keeps the capital after the new full stop.
- `polish-nonsense`: meaningless input gets the no-clear-message refusal, not invented versions.
- `polish-empty`: an empty box asks for a line first.
- `polish-mash`: keyboard mash is declined honestly.
- `polish-max`: the documented Chrome capture limit shows the partial-check notice with no clipping.
- `polish-real-writer`: the drafts come from the chosen cloud account, not the demo phone stub.

## How to get to it (user POV)

Finish setup, enable Chrome in **Where the bubble shows**, connect **With your OpenRouter** from
**How Ownvoice writes**, then type a line in a Chrome field and tap the bubble.

## Driving it with mobile/e2e/openrouter-polish-sheets.mjs

Preconditions:

- An explicitly allocated throwaway emulator, an approved OpenRouter key, and an APK built with
  `EXPO_PUBLIC_E2E_GPT=1 EXPO_PUBLIC_E2E_STUB=1` (the ChatGPT stand-in and the phone stub; the OpenRouter
  key route still reaches the real OpenRouter API). Env `ANDROID_SERIAL`, `OWNVOICE_AVD_NAME`,
  `OPENROUTER_KEY_FILE`, `JAVA_HOME`, `ANDROID_HOME`. Args: `<apk> <out-dir>`.
- Run the whole boot → install → journey → stop under the allocated device lock. The driver refuses a
  mismatched AVD before changing the device.

`ANDROID_SERIAL=emulator-NNNN OWNVOICE_AVD_NAME=<allocated-avd> OPENROUTER_KEY_FILE=~/.config/openrouter/api_key \
  node mobile/e2e/openrouter-polish-sheets.mjs <apk> <evidence-dir>` walks light then dark, then the five
  cases again on a 720x1280 phone at font scale 1.3, and writes `coverage.json`, per-case panel JSON,
  screenshots and `polish-sheets-run.log`. It connects OpenRouter the way a person does (the writer list,
  not first-run setup) and asserts the drafts are not the E2E phone stub's fixed text, so a canned demo
  result can never pass as the cloud writer's.

## Gotchas

- The OpenRouter key is a real billable secret: read it only into the app's paste field, never print,
  screenshot, log or commit it.
- The E2E phone stub masks a failed cloud call with fixed text; the driver's stub-text provenance guard
  fails the case instead. A no-stub build (no `EXPO_PUBLIC_E2E_STUB`) is the alternative, where the phone
  cannot write and a failure shows its own honest line.
- The maximum-text case is prefilled (9 KB cannot be typed through `adb`); the short cases are typed so
  the field gets a real text-change event.

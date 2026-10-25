# Choose which one writes (React Native app)

Part of the ownvoice verification map. Source: `mobile/app/model.tsx`, `mobile/src/ui/ModelPick.tsx`, `mobile/src/core/model.ts`, `mobile/src/chatgpt/accounts.ts` (`listModels`, `askCloud`).

## How to get to it (user POV)

Sign in to an account (or paste its key) in How Ownvoice writes: the app opens **Which one writes** straight away, the account's own live list, searchable, with nothing chosen. Tap a row and every draft, rewrite and fit rating uses it. Later: How Ownvoice writes › the chosen account's **Which one writes** row. Until one is chosen, Home says **Choose which one writes** with a **Choose** button, and the bubble's panel says to choose first and sends nothing (not even to the phone writer). The vendor's own names show only inside that list.

## Driving it

Harness: an owned Android emulator, no spend with the stub build and the host stand-in; one live generation on the OpenRouter route.

1. Host: `cd mobile && npx jest app/__tests__/ModelPick.test.tsx app/__tests__/Settings.test.tsx src/chatgpt src/core/__tests__/PlainWordsTest.test.tsx` (the list, search, pick, no-pick asks, request carries the pick, plain-words exception limited to the list).
2. Stand-in (no spend): start `node mobile/e2e/pi-writer.mjs serve <port> <log>`, build the release APK with `EXPO_PUBLIC_E2E_GPT=1 EXPO_PUBLIC_E2E_STUB=1 EXPO_PUBLIC_E2E_OPENROUTER_BASE=http://10.0.2.2:<port>/api/v1`, then run `PICK_MODEL=<id the stand-in lists> node mobile/e2e/openrouter-proof.mjs <apk> <out-dir>` with `ANDROID_SERIAL`, `OWNVOICE_AVD_NAME`, `OPENROUTER_KEY_FILE` (a dummy `sk-` file is enough; the stand-in ignores it).
3. Live (one generation): build with `EXPO_PUBLIC_E2E_GPT=1 EXPO_PUBLIC_E2E_STUB=1` and no stand-in base, then `OPENROUTER_SCENARIOS=livepick PICK_MODEL=<explicit :free id> node mobile/e2e/openrouter-proof.mjs <apk> <out-dir>` (key from `~/.config/openrouter/api_key` into the throwaway emulator's paste field only; never `openrouter/auto`, never a paid model) and, on the same emulator, `node mobile/e2e/grow-reply-live.mjs mobile/e2e/grow-reply-cases.json <out-dir> 1 x` for reply cards plus a fit level from the picked model (a card's fit level and an `ownvoice-fit` log line with `level`).
4. Capture: the `pick` scenario (`OPENROUTER_SCENARIOS=pick`, `PICK_BEFORE=1` on a build from before the list) shoots Home (from a fresh process) and the card with nothing chosen at 360, 390 and 445 dp (`wm size`) in light and dark, the pick list at each width in each theme and at font 1.3, and the picked card and Home; names are `<screen>-<theme>-<state>-w<dp>.png`. `RUN_ONLY=<step regex>` re-runs steps, with `RUN_RESUME=1` to continue on the emulator as it was left. The `pick-inapp` step opens the pick from the card and must return to the card (a link entry has no screen behind it and lands on Home).
5. A key the vendor refuses (401) shows a plain line with Try again in the panel and sends nothing else; a build with no stand-in flag and a refused key is how that is captured live.

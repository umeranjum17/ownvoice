# Connect from the kit's own list (React Native app)

Part of the ownvoice verification map. Source: `mobile/src/chatgpt/connect.ts` (the kit's `connectView(routes({ platform: 'rn' }))`), `mobile/src/ui/ConnectList.tsx` (the list drawn as the kit gives it), `mobile/src/chatgpt/cards.ts` (a card is the first four's stored id or a kit route id), `mobile/src/core/accountWords.ts` (plain lines for a route by its kit name), `mobile/app/source.tsx`, `mobile/app/setup.tsx`, `mobile/app/index.tsx`.

## How to get to it (user POV)

Home > How Ownvoice writes (and the first-run Choose step). Under "This phone" the kit's list shows: Plans (ChatGPT, Claude, Kimi, Z.AI, Qwen and Xiaomi plans, OpenCode Go and more), then Pay per use (OpenRouter, OpenCode Zen and more), then the kit's other groups. Each row carries the kit's own words for how it is paid and how to connect. Nothing is selected when the page opens, there is no Auto row and no starting model. A route this phone can't use stays in the list with the kit's reason. Tap a row to connect it (sign in by code or page, or paste the key in the app's own field), then pick which one writes from that account's own list.

## Driving it

Harness: an owned Android emulator, no spend (the host stand-in answers, no provider key).

1. Host: `cd mobile && npx tsc --noEmit && npx jest --runInBand` (`SetupChoose`, `ChatGpt`, `OpenCodeConnect` walk the list).
2. Journey `connect-list` in `.done-done.yaml`: build the release APK with `EXPO_PUBLIC_E2E_GPT=1 EXPO_PUBLIC_E2E_STUB=1 EXPO_PUBLIC_E2E_ROUTE_ID=zai:plan_key EXPO_PUBLIC_E2E_ROUTE_BASE=http://10.0.2.2:18761/api/v4`, then `X_REPLIES_WRITER=pi X_REPLIES_ROUTE=Z.AI X_REPLIES_LEGS=preflight node mobile/e2e/x-replies.mjs <apk> <task>` with `PICK_MODEL` set.
3. Pass means the captures show the list open with no row selected, the pay-per-use group, the Z.AI row, its key field, "Z.AI is connected", and reply cards under an X post whose labels match their wording.

Not proven here: device-code sign-ins of the new vendors (Grok, Copilot, Kimi, MiniMax) beyond the kit's own fixtures; no live vendor call is made.

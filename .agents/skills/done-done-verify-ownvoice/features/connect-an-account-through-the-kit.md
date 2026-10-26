# Connect an account through the kit's account layer (React Native app)

Part of the ownvoice verification map. Source: `mobile/src/chatgpt/cards.ts` (the card layer: kit route and account id, ready on a phone, name), `mobile/src/chatgpt/accounts.ts` (`signOutAccount`, `askCloud`, `listModels`), `mobile/src/chatgpt/session.ts` (`accountSessions`), `mobile/src/core/source.ts` (`cloudOf`).

## How to get to it (user POV)

Unchanged by design: How Ownvoice writes still shows the same four cards in the same order (ChatGPT, Claude, OpenRouter, OpenCode Go). Connect one (page sign-in, or paste its key), pick which one writes, and the bubble's reply cards come from that account. Sign out is the same button. What changed is underneath: the app no longer keeps its own provider list or route names. A card id is only what is stored; the kit's route (`openai:code`, `anthropic:paste`, `openrouter:key`, `opencode:plan_key:opencode-go`), its readiness on a phone and its account id are answered in one place.

## Driving it

Harness: an owned Android emulator, no spend (the host stand-in answers, no provider key).

1. Host: `cd mobile && npx tsc --noEmit && npx jest --runInBand` (every account, sign-in, sign-out, route and card test goes through the layer).
2. Journey `account-layer` in `.done-done.yaml`: build the release APK with `EXPO_PUBLIC_E2E_GPT=1 EXPO_PUBLIC_E2E_STUB=1 EXPO_PUBLIC_E2E_OPENROUTER_BASE=http://10.0.2.2:18761/api/v1`, then with `ANDROID_SERIAL`, `OWNVOICE_AVD_NAME`, `PICK_MODEL=<id the stand-in lists>` and a dummy `sk-` file in `OPENROUTER_KEY_FILE`, `mobile/e2e/x-replies.mjs` (`X_REPLIES_WRITER=pi`, `X_REPLIES_LEGS=preflight`) connects the OpenRouter card through the app's own paste field, picks the model from the card's list and shows grounded, label-true reply cards under an X post, through `cards.ts` → `accounts.ts` → the kit.
3. Pass means the driver log holds the `PREFLIGHT` line and the reply-card screenshots show three cards with their own labels; the card list, words and flows are those of `choose-which-one-writes` and `account-choices`.

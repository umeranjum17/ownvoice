# Ownvoice Expo app

This is still a placeholder screen, not a replacement for the [installed Kotlin app](../README.md). The TypeScript core now includes ChatGPT sign-in, a streamed rewrite writer, phone-writer fallback and a remote off-switch, but these helpers are not connected to the screen. There are no in-app sign-in, per-app ChatGPT controls, status, sign-out or read-log flows yet.

```sh
npm ci
npm run lint
npm run typecheck
npm test -- --ci
```

The Jest cases under `src/core/__tests__/` port the Kotlin writing, privacy and onboarding logic; `src/chatgpt/__tests__/` covers streamed responses. The installed Android app's build and use instructions remain in the root README.

## ChatGPT integration (not yet available in the app)

The sign-in helper uses byokit's device-code flow and Expo SecureStore for credentials; its sign-out helper calls byokit's logout. The streamed Responses writer requests three C2 rewrite versions from `gpt-6-sol`, using the text being rewritten, screen conversation and writing rules. If the writer fails or returns fewer than three drafts, `withPhoneFallback` can ask a supplied phone writer instead. No phone writer is supplied by the current screen.

**Privacy if this integration is connected:** A ChatGPT rewrite sends the text being rewritten, screen context and any writing rules to OpenAI. That differs from the installed Kotlin app, which keeps writing on the phone. Checking the public remote switch makes a plain GET to GitHub without app-added identifiers; the network request still exposes ordinary connection information such as the device's IP address to the host. The switch accepts a signed newer sequence, caches the verified choice for six hours, and keeps the last verified choice when the fetch fails; before any verified flag, it defaults to on. No flag has been published at the switch URL yet. None of these network paths runs from the placeholder screen.

For an opt-in, outside-CI Responses proof using a throwaway copy of an existing Codex sign-in, see [`scripts/live-proof.ts`](scripts/live-proof.ts) and its [recorded result](reports/live-proof.md). Do not pass the installed sign-in file directly or commit credentials.

To produce a switch flag offline, keep a 32-byte private signing key as hex outside this repository and, from `mobile/`, run `SWITCH_SEQ=1 node --experimental-strip-types scripts/sign-switch.ts /path/to/private-key off` (increment the sequence for later flags). This prints the signed JSON; it does not publish it. Never commit the private key.

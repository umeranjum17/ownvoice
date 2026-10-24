# Writer talk, card deadline and native X replies (Android)

Source: `packages/engine/src/drafts.ts` (`talksBack`, `talksToRequester`), `mobile/src/panel/Panel.tsx`
(`CARD_MS`, `STILL_MS`), `packages/engine/src/feed.ts` (`replyPost`). Android surface; the Host CLI
launch alone does not prove it.

## Drive

1. Owned x86_64 emulator, one lane at a time. Build the release APK with `EXPO_PUBLIC_E2E_STUB=1
   EXPO_PUBLIC_E2E_GPT=1` per `mobile/README.md` and run `mobile/e2e/first-run.mjs` once.
2. `ANDROID_SERIAL=emulator-NNNN OWNVOICE_AVD_NAME=<owned> OWN_POST_TALK=1 node mobile/e2e/own-post.mjs
   <apk> "$DONE_DONE_EVIDENCE_ROOT"`. It picks **On this phone** in the app's writer list, types
   "Looks nice" in the blank X-style composer and taps the bubble once. The stub writer replays the
   owner's 1.0.8 run: Shorter answers "I'm not sure what you're asking for…", Main point first lands,
   then the writer never answers.
3. Inspect `talk-still-working.png`: **Polish your post**, the Main point first card, "Still working…
   this phone takes a while.", and no card with the talk text. Then `talk-deadline-collapsed.png`, about
   five minutes later: the same card, **Write new ones**, no placeholder and no talk card.
4. Native X reply context has no real-layout capture yet: its proof is the node-tree replay in
   `mobile/src/panel/__tests__/PanelChromeX.test.tsx` (tappable tweet card above "Replying to", tweet open
   with no box, tweet text with no view of its own). A real-phone proof needs the X app's node dump.

## Evidence

The leg writes the two PNGs, their accessible trees and `steps.json` with the panel texts while writing
and after the deadline. Cite the PNGs. It never inserts, sends or posts.

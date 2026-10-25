# Worth a reply (Android)

Source: `packages/engine/src/feed.ts` (`feedPosts`), `mobile/src/panel/Panel.tsx` (the `worth` mode),
`mobile/src/grow/fit.ts` (`BAR_LEVEL`, `clearsBar`), `mobile/src/core/words.ts` (`worthWords`). This is an
Android surface; the Host CLI launch alone does not prove it.

## Drive

1. Use an owned x86_64 Android emulator, one lane at a time, with the home's crash recipe. Nothing here
   needs the phone writer, a sign-in page or a browser.
2. Build the candidate release APK per `mobile/README.md` with the emulator stand-ins
   `EXPO_PUBLIC_E2E_STUB=1 EXPO_PUBLIC_E2E_GPT=1 EXPO_PUBLIC_E2E_AUTH_BASE=http://10.0.2.2:21455
   EXPO_PUBLIC_E2E_JEV_BASE=http://10.0.2.2:18612`, then run the `worth-a-reply` journey in
   `.done-done.yaml`. It finishes setup with `e2e/first-run.mjs` (the offline ChatGPT stand-in), then
   `node mobile/e2e/worth-reply.mjs <apk> "$DONE_DONE_EVIDENCE_ROOT"`.
   - The driver installs the lab X feed fixture (`mobile/e2e/fixture/Composer.java`, `--ez feed true`):
     three posts, no reply box. X is on by default in Privacy.
   - Jev is connected with a synthetic key through the app's own field and switched on, so the four fit
     levels come from a fixed-answer host stand-in through the real `fitBackends -> jev() -> judgeFit`
     path. The reply cards come from the E2E writer stub; generation is stubbed, the rating is not.
   - One tap on the bubble opens **Posts on screen · X**: every post is rated, the one clearing the bar is
     marked **Worth a reply** with its author (filled card), and the reply for it is written below. A feed has
     no box, so no Insert shows; Copy is the hand-off. A screen showing only one post (an open tweet) keeps the
     reply it always wrote: a set is what one tap rates, so this mode never takes over a single-post screen.
   - The run repeats this at 360, 390 and 445 dp in light and dark, and fails if the stand-in saw a post rating
     without the platform's post rubric or with a parent post invented, or a reply rating that answered any post
     other than the marked one.
3. Inspect every `worth-<theme>-<width>.png`: exactly one post is marked, the other two carry their own
   lower levels, the marked post's reply cards sit below the list, and nothing overlaps or is cut off.

## Evidence

The driver writes real-screen PNGs, `results.jsonl` (levels, marked count, the `ownvoice-worth` line),
`standin-requests.jsonl` (one post rating and one reply rating per round) and `steps.json`. Cite the PNGs.
Nothing is sent, posted or inserted; the tap only reads.

## Not covered here

Reddit uses the same mode (`platform.id === 'reddit'` gate, same rubric); the proof shoots X. A "reply this
one instead" pick per post and any watch/notification path are not built (the owner said no to a background
watch, 24 Oct).

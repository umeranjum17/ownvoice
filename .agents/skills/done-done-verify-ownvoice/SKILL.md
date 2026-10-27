---
name: "done-done-verify-ownvoice"
description: "Prove Ownvoice through its model-free host CLI or the explicitly mapped Android journeys. Host CLI proof uses no device, model or network and does not qualify Android behavior. Use when proving a change, capturing evidence, or keeping the feature map honest."
---

# done-done-verify-ownvoice

The host launch below drives the published ownvoice-engine (`packages/engine`), a model-free stdin/stdout JSON protocol. Android is a separate surface: only the explicitly linked Android features qualify it, through their owned-emulator recipes. Host results are not Android proof. The drive changes no repo file: record findings in the run's report and keep this feature map aligned with its real capture paths.

## Launch

node --experimental-strip-types packages/engine/src/cli.mjs hello

Safe: The engine is a pure stdin-to-stdout protocol with no model, no network and no account. The hello verb only prints the protocol version and reads no user state. The run needs no device, sign-in or stub. Run from the repo root. Node must support --experimental-strip-types, because cli.mjs imports ./protocol.ts directly. The repo's own journeys build packages/engine/dist/cli.mjs with npm run build instead, which is the fallback path if strip-types is unavailable (from `packages/engine/src/cli.mjs`).

Ready: The command prints one JSON line containing \"protocol\":2 and a \"version\" that matches packages/engine/package.json, then exits 0. This is the same hello check the engine-protocol journey in .done-done.yaml makes. Tear down what you started; never kill by process name.
Isolation: The engine keeps no state between calls. Every run writes only to its own $DONE_DONE_EVIDENCE_ROOT folder, one per run, outside the repo. Nothing touches a device, an emulator, an account or the owner's files, so no allocation is needed. The journey's npm ci and npm run build only write inside packages/engine.
When the repo's .done-done.yaml has an instance block, done-done already runs the app at $DONE_DONE_BASE_URL (its own port and HOME): BASE is then that URL, never a hard-coded port.

## Drive

Harness: A shell. Each probe is a one-shot pipe: printf a JSON request into the CLI, then read stdout and the exit code. No browser, tmux or PTY is needed. Drive through the repo's real handles that each feature file names:

- [Check drafts against never-say rules](features/check-drafts-against-never-say-rules.md): A caller (an agent or script) sends one check request to the engine, the same way the mobile writer does before it shows a draft (`packages/engine/src/protocol.ts`)
- [Parse a writing-voice note into rules](features/parse-a-writing-voice-note-into-rules.md): A user saves Your voice (the never-say list and the How-I-write note) in the app. The app sends the same markdown to the engine's voice.parse verb (`packages/engine/src/voice.ts`)
- [Get the platform list and per-platform limits](features/get-the-platform-list-and-per-platform-l.md): A caller asks which platforms the engine knows before it drafts for one of them (`packages/engine/src/platforms.ts`)
- [Read the published protocol schema](features/read-the-published-protocol-schema.md): A caller wants the request and response shapes before it sends anything (`packages/engine/protocol/schema.json`)
- [Use my computer (React Native app)](features/use-my-computer-on-the-react-native-app.md): Pair the app with the computer helper and write drafts through it (`mobile/src/computer/`, Android surface)
- [Show app and helper versions](features/show-app-and-helper-versions.md): Read the app version from the Android build on Home and About; when a computer is paired, About shows the helper's reported version and whether the versions differ
- [Opt-in Jev ratings (Android)](features/jev-rating-consent.md): Default-off consent, separate BYOKit key account, opt-in rating route, off and disconnect in both themes; fixed-answer Jev and writer fixtures, no spend
- [Phone-writer reply quality (Android)](features/phone-reply-quality.md): One real on-phone generation under a native X lab post, only clean distinct replies (bad slots stay empty) and consistent rating rows; with `PHONE_FIT=1`, a typed reply's fit says once that levels need an online writer when the phone gives none; host eval also requires two own-post versions
- [Posts from notes (Android)](features/posts-from-notes.md): Shared or selected raw notes become three distinct X posts on the phone writer through **Posts for X**, each with rating rows, editable, then copied or put in the lab composer by Replace; never posted (`mobile/e2e/notes-posts.mjs`)
- [Worth a reply (Android)](features/worth-a-reply.md): One tap on an X feed with no reply box rates every post on screen, marks the one that clears the bar (Strong fit only) and writes the reply for it, at 360, 390 and 445 dp in light and dark; no Insert without a box, nothing sent (`mobile/e2e/worth-reply.mjs`, `journey worth-a-reply`)
- [Writer talk, card deadline and native X replies (Android)](features/writer-talk-and-card-deadline.md): A typed "Looks nice" never shows a version that talks back, a slow card says "Still working" and collapses at the phone's deadline (`mobile/e2e/own-post-talk.mjs`); native X reply context is proven by node-tree replay only
- [Native Android snapshot readiness (e2e harness)](features/native-snapshot-readiness.md): The observer waits for a readable app window or fails explicitly; empty caches are not accepted as empty screens (`mobile/e2e/probe-readiness.mjs`)
- [First-run writer choice (React Native app)](features/first-run-writer-choice.md): Nothing preselected; an explicit tap enables Continue; Home and a restored practice chat ask when no writer was chosen (`mobile/e2e/first-choice.mjs`, Android surface)
- [Choose which one writes (React Native app)](features/choose-which-one-writes.md): After signing in to an account the person picks which one writes from that account's own live list; nothing is picked for them (`mobile/src/ui/ModelPick.tsx`, Android surface)
- [Connect an account through the kit's account layer](features/connect-an-account-through-the-kit.md): A user connects one of the four cards and gets reply cards from it; the app asks the kit's routes and accounts through one module (`mobile/src/chatgpt/cards.ts`, Android surface)
- [Connect from the kit's own list](features/connect-from-the-kit-list.md): A person opens How Ownvoice writes, sees the kit's connect list (plans, then pay per use, nothing selected, no Auto row), connects a route the app had no card for (Z.AI) with a pasted key and gets reply cards from it (`mobile/src/chatgpt/connect.ts`, `mobile/src/ui/ConnectList.tsx`, `mobile/e2e/x-replies.mjs` with `X_REPLIES_ROUTE`).
- [The note and bubble keep clear of the message box (Android)](features/note-keeps-clear.md): After Copy or Insert, the "Copied." or "Inserted. Send it yourself." note never covers the composer or its Post button, on a small screen at the largest text, light and dark (`note-clear` journey)
- [First-run tour (React Native app)](features/first-run-tour.md): After picking which one writes, the tour opens by itself, polishes one made-up post on that account under the approved ceiling, and a cut network recovers on the same screen with Try again (`mobile/e2e/tour.mjs`, Android surface)
- [First-run welcome promise (React Native app)](features/first-run-welcome-promise.md): A new user opens Ownvoice and reads what it does in which apps (`packages/engine/src/words.ts`, Android surface)
- [Restricted-setting help (React Native app)](features/restricted-setting-help.md): A user who installed from a file on Android 13+ finds Use Ownvoice blocked; setup shows the App info steps, re-checks on each return and moves on once allowed (`mobile/src/ui/RestrictedHelp.tsx`, Android surface)
- [Read the README first screen](features/readme-first-screen.md): A visitor decides from the first screen on the repo page; the outcome line comes first, then a real capture of the app, readable at 390 and 1280, in light and dark (`README.md`, `docs/readme/`)
- [Reject bad requests with a readable error](features/reject-bad-requests-with-a-readable-erro.md): A caller sends a malformed or unknown request by mistake (`packages/engine/src/cli.mjs`)

## Evidence

What to capture: Capture stdout, stderr and the exit code for each verb into the run's $DONE_DONE_EVIDENCE_ROOT/transcript.log, as the engine-protocol journey does. Keep the response bodies as text, and save the schema verb output as $DONE_DONE_EVIDENCE_ROOT/schema.json. Pass means the expected exit code and the expected substring are both present. Error envelopes must return exit 1 with an {"error":{"code":...}} body. Exercise the real user path, not internal setters; done-done's judge checks every capture in the run folder against the outcome, so save only captures of the resulting state there and keep any of earlier steps outside it; verify side effects alongside what is visible. Evidence goes to the run folder `done-done run` prints.

## Cleanup

Stop the instances this run started and remove scratch state. Evidence survives cleanup: never delete the run folder.

# Ownvoice

Ownvoice is a local-first, open-source writing booster for Android. A small bubble sits over your apps. Tap it and Ownvoice reads the conversation on screen and drafts two or three short replies with the language model on your phone (Gemini Nano, through ML Kit GenAI). Tap Insert and the draft goes into the text field you were typing in. You read it over and you send it.

For better drafts, your own computer can write them instead: see [Use my computer](#use-my-computer).

If you've already written something in the field, Ownvoice improves it instead of drafting a reply: see [Compose boost](#compose-boost). Each draft gets three separate scores, and you can rewrite any text you select, in any app, without turning on accessibility.

## Use my computer

The phone's model is quick but plain. If you use Claude on your computer, Ownvoice can have your computer write your reply drafts, with the account you already signed in to there. This phone writes them whenever the computer can't.

1. On your computer, build the helper once (needs [Go](https://go.dev/dl/)): `cd link && go build -o ownvoice-link .`, and put `ownvoice-link` on your PATH. It uses the `claude` command, so [Claude Code](https://code.claude.com) must be installed and signed in there.
2. Run `ownvoice-link pair`. It shows a code.
3. In Ownvoice on your phone, tap **Use my computer** and scan the code. The phone shows two words. Check your computer shows the same two, and answer `y` there. Done.
4. From then on, run `ownvoice-link` whenever you want your computer to write. It runs until you press Ctrl-C. It is never installed as a service.

The phone reaches the computer on your home network or over [Tailscale](https://tailscale.com). If the phone says your computer didn't answer on your home network, your computer's firewall may be blocking port 7441; Tailscale usually works regardless.

What changes on the phone:

- **Who writes your drafts** on the main screen: your computer (this phone fills in when it's off) or this phone only.
- **Apps that may go to your computer**: X, LinkedIn, Reddit and Slack start on. Gmail, WhatsApp and every other app start off, so their screens stay on the phone. In an app that's off, the drafts panel offers **Write this one on my computer**, with the number of characters it would send.
- Every draft says **Written on your computer** or **Written on this phone**. When the phone writes instead, the panel says why in plain words ("Your computer didn't answer, so this phone wrote these.") and offers **Try my computer again**.
- Drafts are always scored on the phone. A draft your computer wrote is scored by a different model from the one that wrote it, and the score details say so.
- **What was read** notes when a read was sent to your computer.
- **Forget this computer** deletes the pairing and this phone's key.

### How the link works, and what it refuses

- **Only text in, drafts out.** The helper answers three requests: pair, hello, and "here is the screen and the writer's rules, give me reply drafts". The prompt, the model (Claude Sonnet) and every flag are the helper's own. The phone sends data, never instructions, and the helper refuses unknown fields, other kinds of request, anything over 16 KB and a second request while one is running.
- **Your own CLI, tool-free, and it never touches your sign-in.** The helper runs your unmodified, signed-in `claude -p` with `--safe-mode` (no CLAUDE.md, hooks, plugins, skills or MCP servers), `--tools ""` (no tools at all), `--no-session-persistence` (no saved session), `--strict-mcp-config` and `--disable-slash-commands`, in an empty temporary folder. The helper never opens `~/.claude`, `~/.codex` or any credential, and never sends one anywhere; tests prove it.
- **Its own words, never yours.** Drafts that claim experience you never mentioned ("we built", "our team", "I shipped") are dropped unless your Your voice note says it. The prompt forbids them too.
- **Pinned mutual TLS.** Each side has one key and pins the other's. The phone's key is made in the Android Keystore and can't be copied off the phone. Outside the pairing window, a key that isn't paired is refused before any request is read. Pairing codes work once, for 5 minutes, and close after 5 wrong tries. The computer asks you to confirm every pairing, and it pairs at most 3 phones.
- **What it keeps.** `~/.config/ownvoice-link/` (0700) holds its key, its certificate and the paired phones' names, key hashes and dates. Its log is one line per request with counts and times, never any text.
- **Who can reach it.** Only while `ownvoice-link` runs, and only on this computer's private home-network and tailnet addresses. Someone on the same Wi-Fi can see the port is open, but without a paired key they can't get past the handshake.
- **Lost phone.** Run `ownvoice-link unpair "<phone name>"`. On the phone, **Forget this computer** deletes its key.
- **Pair only your own phone.** The helper writes with your own Claude account, which is for you alone. Anthropic's terms allow using your own signed-in Claude Code this way; they don't allow sharing your account, so never pair someone else's phone, and never run a helper for other people.

## Scores

Every draft shows three chips. Tap one for its reasons. They are never blended into one number.

- **Slop** says how generic and templated the draft reads: clean, a bit generic, or sloppy. It never guesses whether a model or a person wrote it. Phrase rules written for Ownvoice ([`Slop.kt`](app/src/main/java/dev/ownvoice/app/Slop.kt)) highlight stock phrases, "not X but Y" frames, lists of three, em dashes, flattery openers, closing calls to action, "Here's a reply" preambles, and emoji or hashtag stuffing. The on-device model also rates genericness and specificity. The number out of 100 shows only in the detail.
- **Quality** shows five checks from the on-device model: specific, clear, sounds like you, fits the thread, and claims. The claims check flags facts about you, numbers, plans or products that the conversation doesn't support.
- **Reach** (public posts and threads) has no number yet, only reasons: whether the draft starts a conversation, its "not interested" risk, its hook, links, and its length. It stays in "learning" until a prediction can be checked against your own posts. In chats and email, **Response** takes its place: does the draft answer every question, and is the next step clear?

When the phone writes, the same on-device model writes and judges the drafts, and models tend to like their own writing, so each detail says so. When your computer writes, the phone's model judges a draft it didn't write. Drafts show first, and the scores fill in after.

## Compose boost

Write your post, comment or message first, then tap the bubble. The panel shows your text with its three scores and its template phrases highlighted. Below it are three versions of what you wrote: **Tighter**, **Plainer and more like you**, and **Lead with a specific detail**. Each version has its own scores and a meaning check, which warns when the version adds, drops or changes a claim or a number. **Insert** replaces the text in the field with that version; **Copy** copies it.

Ownvoice never writes a post for you from nothing. If the field is empty and there's nothing on screen to reply to, it asks you to write a line or two first. If the field is empty and a conversation is on screen, it drafts replies as before.

## Rewrite selected text

Select text in any app, open the selection menu (in Chrome it's under ⋮), and choose **Ownvoice**. Or share text to Ownvoice. Pick **Tighten**, **Plainer** or **Fix grammar**. You see the rewrite with its slop chip and a meaning check, which warns when the rewrite adds, drops or changes a claim or a number. **Replace** puts it back into the field if the app allows editing; **Copy** copies it. This needs no accessibility permission.

Replace also copies the rewrite. Chrome drops the page's selection as soon as another screen opens, so it may ignore the rewrite or insert it at the cursor. Then paste it.

## Your voice

**Your voice** on the main screen holds the phrases you never say, one per line, and a few rules: **No em dashes**, **End posts on a statement, not a question** (questions are fine in replies), and a short **How I write** note.

- Your never-say phrases are highlighted in drafts, compose boost and rewrites with the reason "on your never-say list", in any case and as whole words only.
- **Sounds like you** gets a concern whenever a text breaks your rules: a never-say phrase, an em dash with that rule on, or a fresh post that ends on a question. Your own text counts as a fresh post when there's nothing on screen to reply to. Reply drafts are replies, so they can end on a question.
- Reply drafts and compose boost ask the model to follow your rules and your note. The never-say list stays out of the prompt, because on the phone it made drafts slower; the highlights catch those phrases instead. The model on the phone is small and doesn't always follow the rules either, so the highlights check what it wrote.

To import a voice profile, tap **Import a voice profile** and pick a markdown file, or share the file to Ownvoice. Ownvoice takes the bullets under any heading with "Never say" in it. If a bullet quotes phrases, it takes the quoted ones. Otherwise it takes a bullet of five words or fewer. It turns on **No em dashes** when the file bans em dashes, and the statement-endings rule when the file asks for "statements, not questions". It shows what it found and adds nothing until you tap **Add these**. Nothing else in the file is kept.

## Privacy

Ownvoice reads the screen only when you tap its bubble. What it reads stays on this phone unless you pair your own computer to write drafts, and then only from the apps you allow. It never sends a message for you.

- **Reads only on request.** Ownvoice reads the screen only when you tap its bubble, never in the background. It reads the visible text and the field you're typing in, and keeps that in memory only until your next tap.
- **Every read is logged where you can see it.** **What was read** on the main screen, or in the drafts panel, lists each tap: the app, the time, what it did (reply drafts, compose boost or nothing to work on) and how many characters it read, never any of the text. The list stays on the phone and each entry is deleted after 30 days. **Wipe everything** clears the list, whatever the last tap read, and Your voice.
- **Per app.** The bubble works only in apps switched on under **Apps where the bubble works**. X, LinkedIn, Reddit, Slack, Gmail and WhatsApp start on; every other app, Signal included, starts off. In an app that's off, the bubble doesn't show and nothing is read.
- **Pause.** The **Pause** switch on the main screen, or **Pause Ownvoice** in the drafts panel, hides the bubble everywhere until you switch it back.
- **Never sends.** Ownvoice changes a text field only when you tap Insert. It never taps Send, posts or acts for you.
- **Nothing leaves the phone unless you pair your own computer.** Then, when you tap the bubble in an app you allow under **Apps that may go to your computer**, the text on screen and your writing rules go to that computer, and from there to Claude, to write the drafts. Nothing else is ever sent, and Ownvoice has no server of its own. Without a paired computer, drafting runs only on the phone's own model. Like other ML Kit libraries, ML Kit may send Google anonymous usage metrics such as API name and latency. See [ML Kit's data disclosure](https://developers.google.com/ml-kit/android-data-disclosure). Your screen text and drafts are not part of those metrics.

## Use it

1. Install the app, open **Ownvoice**, tap **Turn Ownvoice on or off** and switch Ownvoice on in Accessibility settings.
2. Back in Ownvoice, tap **Check or download the model**. On first use the phone downloads Gemini Nano, and this screen shows when it is ready.
3. Under **Apps where the bubble works**, check the apps you want it in. X, LinkedIn, Reddit, Slack, Gmail and WhatsApp are on to start.
4. In one of those apps, tap into the message box, then tap the blue **OV** bubble at the right edge of the screen, halfway down. The drafts panel opens over the app. If you've already written something in the box, the panel shows better versions of it instead.
5. Tap **Insert** to put a draft in the message box, or **Copy** to copy it. Then send it yourself.

The bubble is an accessibility overlay, so it needs no draw-over-other-apps permission. The drafts panel is a see-through activity instead of an overlay. ML Kit GenAI runs the model only for the app in front of the screen (`BACKGROUND_USE_BLOCKED`), and an accessibility overlay over another app doesn't count.

## Build and install

Needs JDK 17 or newer and the Android SDK (API 36).

```sh
./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Gemini Nano through ML Kit needs a supported phone (for example recent Pixel, Samsung Galaxy S and OnePlus flagships) with AICore installed. On other phones Ownvoice says it can't draft there.

## Test

The phrase rules, the parsing of the judge's answers, the per-app defaults, the 30-day log, and the voice profile import and never-say matching have plain JVM unit tests:

```sh
./gradlew :app:testDebugUnitTest
```

`InsertFlowTest` runs on a real device or emulator. It swaps in a stub engine, so it doesn't need the model. It opens Ownvoice's own test screen (in the debug build only) and taps through bubble → drafts panel → Insert. It checks that a multi-line draft lands exactly in a native `EditText`, a web `textarea` and a web `contenteditable`, and that the scores fill in after the drafts show. It checks compose boost too: your own text is scored, three versions follow with meaning checks, and Insert replaces your text with a multi-line version in a native field and a web `textarea`. It checks the privacy controls: with the app switched off or Ownvoice paused, the bubble hides and a tap reads and logs nothing; a tap is logged with its mode and counts and no message text, and Wipe everything clears the log. It checks Your voice: an imported never-say phrase is highlighted in a draft, and "Sounds like you" says so. It also covers the rewrite screen: Replace returns the rewrite, and a rewrite with a new number gets a warning. The test turns Ownvoice's accessibility service on by itself, and switches the bubble on for Ownvoice's own screens while it runs.

```sh
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument -w dev.ownvoice.app.test/androidx.test.runner.AndroidJUnitRunner
```

`./gradlew connectedDebugAndroidTest` works too, but it uninstalls the app afterwards.

The helper's tests run with a fake `claude` (`link/testdata/bin/claude`) under a throwaway HOME, so they never touch your own sign-ins:

```sh
cd link && go test ./...
```

`ComputerFlowTest` checks the link on a real device against the real helper running that fake `claude`, through `adb reverse`: it pairs with the phone's Keystore key, checks that computer drafts show "Written on your computer" and insert with their newlines, that an app that's off stays on the phone until you ask, and that with the helper stopped the phone writes and says why. Then it deletes the test pairing. Install both APKs as above, then run `link/devicetest.sh`. `LISTEN=<address>:7441 link/devicetest.sh` checks the phone reaches the computer over the network instead.

To try Ownvoice by hand on the debug build's test screen, switch Ownvoice on in its own app list, then run `adb shell am start -n dev.ownvoice.app/.TestScreenActivity`.

## Licence

Apache-2.0. See [LICENSE](LICENSE).

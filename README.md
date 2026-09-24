# Ownvoice

Ownvoice is a local-first, open-source writing booster for Android. A small bubble sits over your apps. Tap it and Ownvoice reads the conversation on screen and drafts two or three short replies with the language model on your phone (Gemini Nano, through ML Kit GenAI). Tap Insert and the draft goes into the text field you were typing in. You read it over and you send it.

Each draft gets three separate scores, and you can rewrite any text you select, in any app, without turning on accessibility.

## Scores

Every draft shows three chips. Tap one for its reasons. They are never blended into one number.

- **Slop** says how generic and templated the draft reads: clean, a bit generic, or sloppy. It never guesses whether a model or a person wrote it. Phrase rules written for Ownvoice ([`Slop.kt`](app/src/main/java/dev/ownvoice/app/Slop.kt)) highlight stock phrases, "not X but Y" frames, lists of three, em dashes, flattery openers, closing calls to action, "Here's a reply" preambles, and emoji or hashtag stuffing. The on-device model also rates genericness and specificity. The number out of 100 shows only in the detail.
- **Quality** shows five checks from the on-device model: specific, clear, sounds like you, fits the thread, and claims. The claims check flags facts about you, numbers, plans or products that the conversation doesn't support.
- **Reach** (public posts and threads) has no number yet, only reasons: whether the draft starts a conversation, its "not interested" risk, its hook, links, and its length. It stays in "learning" until a prediction can be checked against your own posts. In chats and email, **Response** takes its place: does the draft answer every question, and is the next step clear?

The same on-device model writes and judges the drafts, and models tend to like their own writing, so each detail says so. Drafts show first, and the scores fill in after.

## Rewrite selected text

Select text in any app, open the selection menu (in Chrome it's under ⋮), and choose **Ownvoice**. Or share text to Ownvoice. Pick **Tighten**, **Plainer** or **Fix grammar**. You see the rewrite with its slop chip and a meaning check, which warns when the rewrite adds or changes a claim or a number. **Replace** puts it back into the field if the app allows editing; **Copy** copies it. This needs no accessibility permission.

Replace also copies the rewrite. Chrome drops the page's selection as soon as another screen opens, so it may ignore the rewrite or insert it at the cursor. Then paste it.

## Privacy

- **Reads only on request.** Ownvoice reads the screen only when you tap its bubble. It reads the visible text and the field you're typing in. Nothing is saved: what it read stays in memory only until your next tap.
- **Never sends.** Ownvoice changes a text field only when you tap Insert. It never taps Send, posts or acts for you.
- **Nothing you write leaves the phone.** Drafting runs on the phone's own model. Ownvoice has no server and no network code. Like other ML Kit libraries, ML Kit may send Google anonymous usage metrics such as API name and latency. See [ML Kit's data disclosure](https://developers.google.com/ml-kit/android-data-disclosure). Your screen text and drafts are not part of those metrics.

## Use it

1. Install the app, open **Ownvoice**, tap **Turn Ownvoice on or off** and switch Ownvoice on in Accessibility settings.
2. Back in Ownvoice, tap **Check or download the model**. On first use the phone downloads Gemini Nano, and this screen shows when it is ready.
3. In any app, tap into the message box, then tap the blue **OV** bubble at the right edge of the screen, halfway down. The drafts panel opens over the app.
4. Tap **Insert** to put a draft in the message box, or **Copy** to copy it. Then send it yourself.

The bubble is an accessibility overlay, so it needs no draw-over-other-apps permission. The drafts panel is a see-through activity instead of an overlay. ML Kit GenAI runs the model only for the app in front of the screen (`BACKGROUND_USE_BLOCKED`), and an accessibility overlay over another app doesn't count.

## Build and install

Needs JDK 17 or newer and the Android SDK (API 36).

```sh
./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Gemini Nano through ML Kit needs a supported phone (for example recent Pixel, Samsung Galaxy S and OnePlus flagships) with AICore installed. On other phones Ownvoice says it can't draft there.

## Test

The phrase rules and the parsing of the judge's answers have plain JVM unit tests:

```sh
./gradlew :app:testDebugUnitTest
```

`InsertFlowTest` runs on a real device or emulator. It swaps in a stub engine, so it doesn't need the model. It opens Ownvoice's own test screen (in the debug build only) and taps through bubble → drafts panel → Insert. It checks that a multi-line draft lands exactly in a native `EditText`, a web `textarea` and a web `contenteditable`, and that the scores fill in after the drafts show. It also covers the rewrite screen: Replace returns the rewrite, and a rewrite with a new number gets a warning. The test turns Ownvoice's accessibility service on by itself.

```sh
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument -w dev.ownvoice.app.test/androidx.test.runner.AndroidJUnitRunner
```

`./gradlew connectedDebugAndroidTest` works too, but it uninstalls the app afterwards.

To try Ownvoice by hand on the debug build's test screen: `adb shell am start -n dev.ownvoice.app/.TestScreenActivity`.

## Licence

Apache-2.0. See [LICENSE](LICENSE).

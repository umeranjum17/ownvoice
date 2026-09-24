# Ownvoice

Ownvoice is a local-first, open-source writing booster for Android. A small bubble sits over your apps. Tap it and Ownvoice reads the conversation on screen and drafts two or three short replies with the language model on your phone (Gemini Nano, through ML Kit GenAI). Tap Insert and the draft goes into the text field you were typing in. You read it over and you send it.

This is the first thin slice: one engine (the on-device model), one flow (reply drafts), and an on/off switch.

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

`InsertFlowTest` runs on a real device or emulator. It swaps in a stub draft engine, so it doesn't need the model. It opens Ownvoice's own test screen (in the debug build only), taps through bubble → drafts panel → Insert, and checks that a multi-line draft lands exactly in a native `EditText`, a web `textarea` and a web `contenteditable`. The test turns Ownvoice's accessibility service on by itself.

```sh
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument -w dev.ownvoice.app.test/androidx.test.runner.AndroidJUnitRunner
```

`./gradlew connectedDebugAndroidTest` works too, but it uninstalls the app afterwards.

## Licence

Apache-2.0. See [LICENSE](LICENSE).

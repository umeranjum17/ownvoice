# Ownvoice

Ownvoice is a local-first, open-source writing booster for Android. A small bubble sits over your apps. Tap it and Ownvoice reads the conversation on screen and drafts two or three short replies with the language model on your phone (Gemini Nano, through ML Kit GenAI). Tap Insert and the draft goes into the text field you were typing in. You read it over and you send it.

If you've already written something in the field, Ownvoice improves it instead of drafting a reply: see [Compose boost](#compose-boost). Each draft gets one plain sentence about how it reads, and you can rewrite any text you select, in any app, without turning on accessibility.

The app is written for people who don't care how it works: it uses plain Material 3 in the phone's own colours and font, follows light and dark mode, and never shows a model name, a score out of 100 or other technical words. `PlainWordsTest` fails the build if one slips into a user-facing string. The technical details live here instead.

## How a draft reads

Under each draft is one plain sentence with a green or amber dot, such as "Sounds natural and answers Sam", "Could be more specific" or "A bit stock: 2 phrases you could say more simply". **Why?** opens a note with each check in everyday words, a tick or a gentle warning, and the phrases that read as stock. Drafts show first, and the sentence fills in after.

Behind the sentence are three separate scores, never blended into one number:

- **Stock phrasing** (`Slop.kt`) is how generic and templated the draft reads: "Sounds natural", "A bit stock" or "Sounds canned". It never guesses whether a model or a person wrote it. Phrase rules written for Ownvoice highlight phrases people say to anyone, "not this, but that" patterns, three things in a row, long dashes, flattery at the start, "Here's a reply" openers, endings that ask for their thoughts, and lots of hashtags or emoji. The on-device model also rates genericness and specificity from 0 to 10; with the rule hits they make a score out of 100 that the user never sees, only its words. A general draft with no stock phrases reads "A bit general".
- **Quality** is five checks from the on-device model: says something real, one clear point, sounds like you, fits the conversation, and doesn't make anything up. The last flags facts about you, numbers, plans or products that the conversation doesn't support.
- **Response** (chats and email): answers the other person, and is it clear what happens next. When the chat shows one other person as "Name: message", the sentence uses their name. For public posts and threads it is **reach** instead, with no prediction yet, only reasons: invites replies, might put people off, strong first line, links can mean fewer views, and long for a post. Reach reasons show only under **Why?**, never in the sentence.

The same on-device model (Gemini Nano) writes and judges the drafts, and models tend to like their own writing. The app only says "These are quick checks to help you choose", so treat the checks as hints. When the model doesn't answer, the checks it would have made are left out rather than shown as passed.

## Compose boost

Write your post, comment or message first, then tap the bubble. **Polish your message** shows your text with its sentence and its stock phrases highlighted. Below it are three versions of what you wrote: **Shorter**, **More like you**, and **Start with a detail**. Each version has a meaning check: "Same meaning", or "Check this: it leaves out “4”" when the version adds or drops a number, or when the model thinks it changes a claim. **Use this** replaces the text in the field with that version; **Copy** copies it.

Ownvoice never writes a post for you from nothing. If the field is empty and there's nothing on screen to reply to, it asks you to write a line or two first. If the field is empty and a conversation is on screen, it drafts replies as before.

## Rewrite selected text

Select text in any app, open the selection menu (in Chrome it's under ⋮), and choose **Ownvoice**. Or share text to Ownvoice. Pick **Shorter**, **Simpler** or **Fix spelling**. You see the rewrite with "Same meaning as yours" or a "Check this" warning, and its sentence. **Replace** puts it back into the field if the app allows editing; **Copy** copies it. This needs no accessibility permission.

Replace also copies the rewrite. Chrome drops the page's selection as soon as another screen opens, so it may ignore the rewrite or insert it at the cursor. Then paste it.

## Your voice

**Your voice** on the main screen holds the phrases you never say, one per line, and a few rules: **No long dashes (—)**, **End posts on a statement, not a question** (questions are fine in replies), and a short **How I write** note.

- Your never-say phrases are highlighted in drafts, compose boost and rewrites with the reason "on your never-say list", in any case and as whole words only.
- "Sounds like you" becomes "Doesn't sound like you" whenever a text breaks your rules: a never-say phrase, a long dash with that rule on, or a fresh post that ends on a question. Your own text counts as a fresh post when there's nothing on screen to reply to. Reply drafts are replies, so they can end on a question.
- Reply drafts and compose boost ask the model to follow your rules and your note. The never-say list stays out of the prompt, because on the phone it made drafts slower; the highlights catch those phrases instead. The model on the phone is small and doesn't always follow the rules either, so the highlights check what it wrote.

To import a voice profile, tap **Import from a file** and pick a markdown file, or share the file to Ownvoice. Ownvoice takes the bullets under any heading with "Never say" in it. If a bullet quotes phrases, it takes the quoted ones. Otherwise it takes a bullet of five words or fewer. It turns on **No long dashes** when the file bans em dashes, and the statement-endings rule when the file asks for "statements, not questions". It shows what it found and adds nothing until you tap **Add these**. Nothing else in the file is kept.

## Privacy

Ownvoice reads the screen only when you tap its bubble. What it reads stays on this phone, and it never sends anything.

- **Reads only on request.** Ownvoice reads the screen only when you tap its bubble, never in the background. It reads the visible text and the field you're typing in, and keeps that in memory only until your next tap.
- **Every read is logged where you can see it.** **What Ownvoice read** on the main screen lists each tap: the app, the time, what it did ("Suggested replies", "Polished your message" or "Nothing to help with") and what it looked at ("Read the chat on screen and your message"), never any of the text. The list stays on the phone and each entry is deleted after 30 days. **Wipe everything** clears the list, whatever the last tap read, and Your voice.
- **Per app.** The bubble works only in apps switched on under **Where the bubble shows**. Setup's **Where should I help?** switches on the ones picked there from X, LinkedIn, Reddit, Slack, WhatsApp and Gmail. Without it, X, LinkedIn, Gmail and WhatsApp start on; every other app, Signal included, starts off. In an app that's off, the bubble doesn't show and nothing is read.
- **Pause.** **Pause for now** on the main screen hides the bubble everywhere until you switch it back.
- **Never sends.** Ownvoice changes a text field only when you tap Insert. It never taps Send, posts or acts for you.
- **Nothing you write leaves the phone.** Drafting runs on the phone's own model. Ownvoice has no server and no network code. Like other ML Kit libraries, ML Kit may send Google anonymous usage metrics such as API name and latency. See [ML Kit's data disclosure](https://developers.google.com/ml-kit/android-data-disclosure). Your screen text and drafts are not part of those metrics.

## Use it

1. Install the app and open **Ownvoice**. Setup takes four taps and one stop in the phone's settings:
   - **Write replies that sound like you.** → **Continue**. This quietly starts the one-time download of Gemini Nano; the main screen's card says **Ready to help** once it's done, or what went wrong.
   - The accessibility permission and its three promises (reads only when you tap, stays on this phone, you always press Send). It is also the prominent disclosure Google Play asks for. **Turn on** opens the phone's accessibility list with Ownvoice's row highlighted where the phone supports it (Android lets only system apps open a service's own page), and a small copy of the row and its switch shows what to flip. Nothing is switched on until the user does it there. Once the service connects, setup comes back to the front by itself. **Switch greyed out?** covers apps installed from a download, where Android 13 and later grey the switch out until **Allow restricted settings** in App info.
   - **Try it**: a practice chat with the bubble already there and the message box already focused. Tap the bubble, then **Insert**: that's the first inserted draft, 4 taps after opening the app (**Continue**, **Turn on**, the bubble, **Insert**) plus the phone's own settings (tap Ownvoice, flip the switch, **Allow**).
   - **Where should I help?** lists only the apps on the phone from X, LinkedIn, Reddit, Slack, WhatsApp and Gmail, all switched on to start. **Done** saves them. If none of them is on the phone, this step is skipped.

   Setup never asks anything else: the full app list, Your voice and What Ownvoice read live on the main screen.
2. To add or remove apps later, use **Where the bubble shows** on the main screen.
3. In one of those apps, tap into the message box, then tap the round bubble with a pen at the right edge of the screen, halfway down. The drafts panel opens over the app. If you've already written something in the box, the panel shows better versions of it instead.
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

The setup steps and the installed-app list (`OnboardingTest`), the phrase rules, the parsing of the judge's answers and the one-sentence verdict, the per-app defaults, the 30-day log, the voice profile import and never-say matching, and the plain-words check (`PlainWordsTest`, which checks the error messages, check names, verdicts, marked-phrase reasons, read log, the offered app names and string resources for model names, "/100", "judge", "slop", "nano", "AICore", "characters" and similar) have plain JVM unit tests:

```sh
./gradlew :app:testDebugUnitTest
```

`FirstRunTest` runs the whole first run on a device or emulator with a stand-in for the model: welcome, the permission (the test flips the switch the user would), setup coming back to the front by itself, the practice chat ending in an inserted draft in 4 taps, and "Where should I help?" offering only installed apps. It checks every text setup shows for technical words, and puts the phone's own Ownvoice settings back afterwards.

`InsertFlowTest` runs on a real device or emulator. It swaps in a stub engine, so it doesn't need the model. It opens Ownvoice's own test screen (in the debug build only) and taps through bubble → drafts panel → Insert. It checks that a multi-line draft lands exactly in a native `EditText`, a web `textarea` and a web `contenteditable`, and that the one-sentence verdict fills in after the drafts show, with "Why?" giving the reasons in plain words. It checks compose boost too: your own text is scored, three versions follow with meaning checks, and Insert replaces your text with a multi-line version in a native field and a web `textarea`. It checks the privacy controls: with the app switched off or Ownvoice paused, the bubble hides and a tap reads and logs nothing; a tap is logged with what it did and no message text, and Wipe everything clears the log. It checks Your voice: an imported never-say phrase is highlighted in a draft, and the draft reads "Doesn't sound like you". It also covers the rewrite screen: Replace returns the rewrite, and a rewrite with a new number gets a warning. The test turns Ownvoice's accessibility service on by itself, and switches the bubble on for Ownvoice's own screens while it runs.

```sh
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument -w dev.ownvoice.app.test/androidx.test.runner.AndroidJUnitRunner
```

`./gradlew connectedDebugAndroidTest` works too, but it uninstalls the app afterwards.

To try Ownvoice by hand on the debug build's test screen, switch Ownvoice on in its own app list, then run `adb shell am start -n dev.ownvoice.app/.TestScreenActivity`.

## Licence

Apache-2.0. See [LICENSE](LICENSE).

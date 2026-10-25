# First-run tour (React Native app)

Part of the ownvoice verification map. Source: `mobile/app/tour.tsx`, `mobile/src/core/tour.ts`, `mobile/app/index.tsx`, `mobile/app/model.tsx`, `mobile/src/core/words.ts`.

## How to get to it (user POV)

Sign in to an account (or paste its key) in How Ownvoice writes, then on Home tap **Choose which one writes** and pick one. Back on Home the tour opens by itself once: **A quick look at Ownvoice**, the cost said plainly, and one made-up post. Tap **Polish the made-up post** and the versions land on that screen; **Done** returns Home, which keeps a **Take the tour** row so the same example can be tried again. **Skip the tour** closes it and only ever leaves that row. Nothing here is inserted, sent or posted, and the tour never touches the person's own text.

## Driving it

Harness: an owned Android emulator, and the host's own pi served to it as the writer (real DeepSeek Flash, no provider key, no spend). A live vendor account works too (`TOUR_WRITER=live`), but nothing here needs one.

1. Host: `cd mobile && npx jest src/core/__tests__/PlainWordsTest.test.tsx app/__tests__/Settings.test.tsx` (the tour's words and screen stay plain, and Home's Choose button still asks for a writer before anything is sent).
2. Build a release APK with `EXPO_PUBLIC_E2E_OPENROUTER_BASE=http://10.0.2.2:18799/api/v1` (`npx expo prebuild --platform android --no-install`, then `./gradlew assembleRelease --no-daemon` in `mobile/android`). The flag only points the app's own OpenRouter route at the host; nothing else in the app is stubbed.
3. Run `PICK_MODEL=<a row the stand-in lists> node mobile/e2e/tour.mjs <apk> <out-dir>` with `ANDROID_SERIAL`, `OWNVOICE_AVD_NAME` and `OPENROUTER_KEY_FILE` pointing at any `sk-` text file (the stand-in ignores it; never the owner's key). The driver starts and stops the stand-in itself on `PI_WRITER_PORT` (default 18799) and logs its answers to `pi-writer.log` beside the captures. Pass `PI_MODEL` and `PI_FALLBACK_MODEL` naming a model this host's `pi` answers with (here `commandcode/deepseek/deepseek-v4.1-flash`); pi-writer's own defaults (`deepseek/deepseek-flash`, `haiku`) fail on this host. The driver finishes setup with no writer, connects OpenRouter from the writer list, leaves the pick list unpicked, then picks from Home so the tour opens on the way back; it runs the exercise in light and dark, cuts the network for a failed call and restores it for **Try again**.
4. Capture names: `tour-opens-light` (right after the pick), `tour-open-<theme>-w<dp>` at 360, 390 and 445 dp, `tour-writing-<theme>`, `tour-versions-<theme>`, `tour-after-<theme>`, `tour-failed-light` and `tour-recovered-light`, plus one `tour-open-1280x800-light` window. `TOUR_ONLY=<step regex>` re-runs single steps.
5. Failure and recovery: with the network cut the tour keeps the person on its own screen and says so in plain words with **Try again**; restoring the network and tapping it writes the versions on that same screen. Which words appear depends on the cut (an offline line, or **This one took too long** at the 45 s deadline) — both are the plain, retryable line, never a stuck card.

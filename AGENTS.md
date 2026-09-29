# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Build, install and on-device test commands: see `README.md`.
- Build flags are in Metro's cache key via `mobile/metro.config.js`; add any new `EXPO_PUBLIC_*` flag there.
- ML Kit GenAI runs the model only for the app in front (`BACKGROUND_USE_BLOCKED`). An accessibility overlay over another app doesn't count, so model calls happen in an activity (`DraftActivity`), not in `OwnvoiceService`.
- That model dependency also sets the Expo build: it needs `minSdkVersion` 26 (Expo defaults to 24) and `-Xskip-metadata-version-check` for its newer Kotlin metadata, kept in `mobile/app.json` and `mobile/plugins/withOwnvoice.js`. Keep both when changing the build config.
- The bubble shows, and a tap reads, only in apps switched on in `Privacy` (defaults in `Privacy.DEFAULT_ON`; Ownvoice's own package starts off), so on-device checks must switch `dev.ownvoice.app` or the target app on first. Prefs writes use `commit()` because `am instrument` kills the process right after a test.
- Chrome refuses `ACTION_SET_TEXT` while another app's window is on top, and it reports a contenteditable's text without its newlines. `OwnvoiceService.insert` handles both.
- Chrome drops the page selection when any activity comes to the front, so an `ACTION_PROCESS_TEXT` result may be ignored or inserted at the caret. `RewriteActivity.replace` copies it as well.
- This phone (Android 16) cuts a backgrounded app's network within seconds, loopback included, so an in-app browser (Custom Tab) sign-in that hands control back to the app must run a foreground service while the tab is open. The local callback listener also needs a short socket read timeout (about 3 s): Chrome opens idle pre-connect sockets that otherwise block the accept loop.
- `uiautomator dump`, or any UiAutomation opened without `FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES`, unbinds the service and closes its windows. After the app process is killed (force-stop, `am start -S`, `adb install -r` or `am instrument`), Android doesn't rebind the service until `enabled_accessibility_services` changes, so switch it off and on and check `accessibility_enabled` is 1 (uninstalling the test package can leave it 0).
- OnePlus phones show a "Continue installation" screen on every `adb install`, and leave an "Installed" page on top afterwards. Every install must end with Back: while that page is in front, `am instrument` times out launching activities, and the timeout looks like a test failure. On the OnePlus 13, `adb shell input tap 540 1833` taps Continue once its buttons show (about 5 s in); tap only while `dumpsys window` shows `InstallGuideActivity` in focus, or the tap lands on whatever is underneath.
- Editing `shared_prefs` with `run-as` while the app process is alive is undone by its next `commit()` (the process keeps the old values in memory), so `am force-stop dev.ownvoice.app` first. `MainActivity` opens the four-step `SetupActivity` (step order in `Onboarding`) on launch until setup is done (`Privacy.setUp`) or the service is on.
- Release builds of the Expo app (`dev.ownvoice.next`) are not debuggable: `run-as` fails, so switch apps on in "Where the bubble shows" through the app's own UI (Home › Where the bubble shows › tap the app row). After `am force-stop`, re-enable the service by toggling `enabled_accessibility_services` off and on (see the rebind note above).
- RN reads the colour scheme from the process start; a later `cmd uimode night yes/no` may not reach an already-running app process, so for per-mode screenshots force-stop `dev.ownvoice.next` and re-toggle the service after each mode flip. The emulator's twilight schedule (default 22:00–06:00) re-enables night mode over `cmd uimode night no`; `cmd uimode night custom -o off` first.
- The listening bubble mood lasts under a second (read is instant, panel draws fast). Catch it with `adb shell screenrecord` plus ffmpeg frame extraction, not `screencap`.
- The phone writer's one-time download starts only after the person's yes (`src/core/phoneDownload.ts`, key `phone-download-agreed`); call `getReady()` from a place that has just shown the size, never `Native.downloadModel` directly. `EXPO_PUBLIC_E2E_DOWNLOAD=1` fakes it so the ask can be walked on an emulator.
- Over the Mac emulator slot's tunnel, `adb exec-out screencap` returns truncated PNGs; use `adb shell screencap -p /sdcard/x.png` plus `adb pull`.
- No user-facing string may carry technical words (model names, scores, "characters"); `PlainWordsTest` checks the app's messages, check names, verdicts, read log and `strings.xml` for them, so new user-facing text needs a case there, and the technical detail belongs in `README.md`.
- A model or prompt change must pass the writer eval gate (`mobile/eval/README.md`): P01, P13, S05, R01 and R07 all pass, run from `mobile/eval` against llama-server or ollama on the host.
- To hand the app a file on the phone (for example a voice profile for the share import), write it with `adb shell run-as dev.ownvoice.app` into the app's `files/` and share `file:///data/data/dev.ownvoice.app/files/...`. The app can't read a folder `adb shell` creates under `/sdcard/Android/data`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.

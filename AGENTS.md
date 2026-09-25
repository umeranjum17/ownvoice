# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Build, install and on-device test commands: see `README.md`.
- ML Kit GenAI runs the model only for the app in front (`BACKGROUND_USE_BLOCKED`). An accessibility overlay over another app doesn't count, so model calls happen in an activity (`DraftActivity`), not in `OwnvoiceService`.
- The bubble shows, and a tap reads, only in apps switched on in `Privacy` (defaults in `Privacy.DEFAULT_ON`; Ownvoice's own package starts off), so on-device checks must switch `dev.ownvoice.app` or the target app on first. Prefs writes use `commit()` because `am instrument` kills the process right after a test.
- Chrome refuses `ACTION_SET_TEXT` while another app's window is on top, and it reports a contenteditable's text without its newlines. `OwnvoiceService.insert` handles both.
- Chrome drops the page selection when any activity comes to the front, so an `ACTION_PROCESS_TEXT` result may be ignored or inserted at the caret. `RewriteActivity.replace` copies it as well.
- `uiautomator dump`, or any UiAutomation opened without `FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES`, unbinds the service and closes its windows. After the app process is killed (force-stop, `am start -S`, `adb install -r` or `am instrument`), Android doesn't rebind the service until `enabled_accessibility_services` changes, so switch it off and on and check `accessibility_enabled` is 1 (uninstalling the test package can leave it 0).
- OnePlus phones show a "Continue installation" screen on every `adb install`. On the OnePlus 13, `adb shell input tap 540 1833` taps it once its buttons show (about 5 s in); tap only while `dumpsys window` shows `InstallGuideActivity` in focus, or the tap lands on whatever is underneath. The "Installed" page it leaves on top makes `am instrument` time out launching activities, so press Back first.
- Editing `shared_prefs` with `run-as` while the app process is alive is undone by its next `commit()` (the process keeps the old values in memory), so `am force-stop dev.ownvoice.app` first. `MainActivity` opens the three-step `SetupActivity` on launch until setup is done (`Privacy.setUp`) or the service is on.
- No user-facing string may carry technical words (model names, scores, "characters"); `PlainWordsTest` checks the app's messages, check names, verdicts, read log and `strings.xml` for them, so new user-facing text needs a case there, and the technical detail belongs in `README.md`.
- To hand the app a file on the phone (for example a voice profile for the share import), write it with `adb shell run-as dev.ownvoice.app` into the app's `files/` and share `file:///data/data/dev.ownvoice.app/files/...`. The app can't read a folder `adb shell` creates under `/sdcard/Android/data`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.

# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Build, install and on-device test commands: see `README.md`.
- ML Kit GenAI runs the model only for the app in front (`BACKGROUND_USE_BLOCKED`). An accessibility overlay over another app doesn't count, so model calls happen in an activity (`DraftActivity`), not in `OwnvoiceService`.
- Chrome refuses `ACTION_SET_TEXT` while another app's window is on top, and it reports a contenteditable's text without its newlines. `OwnvoiceService.insert` handles both.
- `uiautomator dump`, or any UiAutomation opened without `FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES`, unbinds the service and closes its windows. After the app process is killed (force-stop or `am instrument`), Android doesn't rebind the service until `enabled_accessibility_services` changes, so switch it off and on.
- OnePlus phones show a "Continue installation" screen on every `adb install`, and it must be tapped on the device.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.

# Gmail compose and reply

Tap into a Gmail compose body or a reply box, write a line, then tap the Dot bubble: Ownvoice reads the body, offers the polish panel, and **Use this** writes the cleaned-up text back into the Gmail box and reports **Inserted**. This works on the shipped build (`isAccessibilityTool="false"`); Gmail's compose body is an `android.widget.EditText` the service can read and write on a real phone, even though the old ov-pm-10 report found `rootInActiveWindow` null. The compose/reply body rejects or ignores `ACTION_SET_SELECTION`, so the insert verifier accepts an unchanged caret once the exact read-back text matches, but only on the final retry (or when the action is rejected outright) — otherwise a landed draft is logged `result=failed` and the app falls back to the clipboard.

## Sub-features

- `gmail-compose-read`: the bubble tap reads the Gmail compose body into the panel's **Yours**.
- `gmail-compose-insert`: **Use this** writes the polished text back into the Gmail body; the insert verifier reports `result=verified` even when the body ignores `ACTION_SET_SELECTION` (log `caret=false ignore=true` on the final retry).
- `gmail-reply-insert`: the same through a reply box opened from an inbox thread.
- `gmail-no-false-error`: when the phone writer fails after a card has landed, the panel keeps the usable card and never shows the false **Something went wrong. Try again.**

## How to get to it (user POV)

- In Gmail, tap **Compose** (or **Reply** on a thread), tap the message body, type a line, tap the Dot bubble, then **Use this**.

## Driving it on the signed-in test phone

Preconditions:

- A real phone with a personal Gmail already signed in — never sign in during a proof. Drive the test phone through the tester's own device lock for the whole journey (install through capture), using that phone's serial. No emulator can sign Gmail in.
- Volume left at 0; drafts only, never a send. Discard every proof draft afterwards (the "Discard drafts" toolbar button in the opened draft, then **OK** in "Discard drafts from this conversation?").

- **Compose.** Force-stop Gmail and Ownvoice, re-enable the accessibility service (the off/on `enabled_accessibility_services` toggle), launch Gmail, dismiss any promo ("Got it"), tap the compose FAB (about `807 2052`), tap the body (about `540 1380`), `input text`, then tap the bubble (about `996 1224`). Wait for the panel's **Use this**, tap it, and read the Gmail body back from the accessibility tree.
- **Reply.** Open the **Primary** tab, tap a conversation row, tap **Reply**, then proceed as above.
- **Proof.** Run the compose and reply journeys per theme (light and dark) with a local script that takes the journey and theme as arguments; the repo drivers refuse phone serials, so the script stays local. Keep its panel and body-after screenshots plus the `OwnvoiceNative` `insert verify`/`insert result` log lines with the task evidence.

## Gotchas

- Gmail's promo overlays ("Sort by relevant promotions", "Got it") can sit over the inbox; dismiss them before tapping a row, or the tap lands on the overlay.
- The compose body is a WebView-backed editor: it is not an editable node in a `uiautomator`/probe dump until it is focused, and the compose probe shows the **To** and **Subject** fields first — do not target the first editable node or a fixed `540 900`.
- Gmail's own text-selection toolbar does **not** surface the Ownvoice PROCESS_TEXT entry (it offers only Format/Cut/Copy/Select all and its own AI entries), so the selection-menu Replace route does not work in Gmail on this phone.
- No live typing-check events (`TYPE_VIEW_TEXT_CHANGED`) arrive from Gmail's body, so the amber as-you-type badge does not update there; the bubble tap still reads and checks the text.
- `uiautomator dump` unbinds the service; use the probe that sets `FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES`, and re-toggle the service after any force-stop.

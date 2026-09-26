# Slice 5 emulator evidence: drafts panel and draft quality

Built from the look spec (sections 4–6): the drafts panel for reply, polish and compose; every string from §4.3; Why? as in §4.4; the §5 draft-quality implementation (reply slots, latest-message input, duplicate filtering, kept formatting, the dash decision); the ChatGPT prompt-routing fix; and the plain-error fixes. Emulator UI acceptance is shown below; real-model draft quality remains unverified here. At capture time, `npm test`, `npx tsc --noEmit` and `npm run lint` were green.

Setup: release `dev.ownvoice.next` APK on a worktree-local AVD (`ov-rn5`, Android 16 / API 36.1, x86_64, 1080 × 2400 @ 420 dpi), Chrome, the Ownvoice accessibility service enabled with Chrome and Ownvoice switched on. No physical phone was touched; `a4b93ea2` was never addressed. Status bar cropped from every shot.

Two release builds were used, both from this branch:

- **Stub build** (05-01 … 05-18b): the panel's default writer temporarily pointed at `src/panel/stubWriter.ts` (fixed texts, staged download/writing delays, an `!!` trigger for the no-drafts state), because this emulator has no phone model and no ChatGPT sign-in, so the real writer can only show the unsupported note. The edit is reverted in the committed code; `stubWriter` ships as the Panel tests' fixture. Everything except 05-19 runs the real app code around the stubbed writer.
- **Real build** (05-19): the committed code, unmodified. With no model on the emulator, `modelStatus` resolves `unavailable`, the download fails, and the panel shows the plain line only — the §4.3 "phone cannot write" behaviour.

## What the screenshots show

- `05-01-reply-ready-light` — reply mode: 3 cards, verdict dots with rules-only verdicts, Why? on every card, Insert filled, Copy as text, Write new ones end-aligned, no bottom Close, Dot (ready) in the header.
- `05-02-reply-rewritten-light` — after Write new ones: three fresh cards (the stub's avoid-list run).
- `05-03-polish-list-light` — polish mode on the QA list input: Yours card with the list intact and its rules verdict; the stub's "Cleaned up" version flattened the list and shows the instant number check **Check this: it leaves out "1" and "2"**; Shorter and Main point first keep list lines; Use this / Copy. The real writer's acceptance filter would reject a flattened list; this screenshot only exercises the panel with a stub.
- `05-04-reply-ready-dark` — the same panel in the phone's dynamic dark palette.
- `05-05-compose-light` / `05-07-compose-dark` — compose over a page with no four-word line: title **Polish your post**, Yours + versions.
- `05-06-empty-light` / `05-08-empty-dark` — **Nothing to reply to yet** with the write-first note, Dot in check mood.
- `05-09-placeholders-writing` — Writing… note, Yours already placed, three pulsing placeholders waiting for versions.
- `05-10-reply-no-field` — no focused field: the note becomes the Insert hint and every Insert is disabled (38%).
- `05-11-why-cover-light` / `05-11b-…-dark` — the Why? cover: the draft with marks, How it reads, the rules row, then — this emulator has no model — **Couldn't run the other checks this time.** and the footer, per §4.4.4 (never a spinner that does not end). Back closed the cover and returned to the cards before Insert.
- `05-12-try-again-empty` — no usable drafts: **Couldn't polish that this time. Try again.** with the Try again filled button; only the plain line, no Insert hint.
- `05-13-inserted-done-pill` — after Insert: the draft in the message box and the native **Inserted. Send it yourself.** done pill.
- `05-14-empty-chrome-check-dot` — over Chrome's textless `about:blank` the capture holds no conversation, so the panel shows the empty state with the Dot in check mood. (The literal no-capture line is unit-tested; the native "No text on this screen." pill was captured on the real phone in slice 3.)
- `05-15-palette-1` / `05-16-palette-2` — two wallpaper palettes (`system_palette` 7B4DFF purple, 2E6C3F green): sheet, buttons, labels, verdict dots and marks all follow.
- `05-17-large-text` — font scale 2.0: nothing clipped; the verdict wraps and Why? stays whole; the title ellipsizes.
- `05-18-reduced-motion-bubble-still` / `05-18b-…-panel` — `animator_duration_scale 0`: the resting Dot is the still drawable, and the sheet is fully drawn with placeholders holding (no slide/pulse frames).
- `05-19-unsupported-real` — the real build: the phone cannot write here, so the panel shows **only** "Sorry, Ownvoice doesn't work on this phone yet." with the Dot in check mood — no Insert hint, no drafts, no number.

Checks made without a screenshot: E2's `rg '#[0-9a-fA-F]{6}'` over `mobile/src` and `mobile/app` finds only the scrim, attention and Dot constants; the fallback note ("ChatGPT didn't answer. This phone wrote these instead.") is supplied by `withPhoneFallback` and covered by the Panel plain-words scan, but this disconnected integration was not shown on the emulator; E10 (launcher/themed icon) was captured in slice 4.

## Emulator limits written down

- No phone model and no ChatGPT sign-in: real-model draft quality (P3–P5, P8), the Checking… model-check rows (§4.4.3) and the fallback path from a real ChatGPT failure remain for the real-phone QA that firstmate arranges.
- The Why? model checks show their honest no-model state here; the upgraded-verdict path is unit-tested (`PlainWordsTest`, `DraftsTest`).
- The launcher applies themed icons inconsistently (slice 4 note); nothing in this slice changes the icon.

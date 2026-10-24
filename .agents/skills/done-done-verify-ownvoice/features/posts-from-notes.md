# Posts from notes (Android)

Source: `mobile/src/core/notesPosts.ts` (prompt, admission, three-slot pipeline),
`mobile/src/rewrite/Rewrite.tsx` (the **Posts for X** choice and its cards),
`mobile/src/chatgpt/responses.ts` (`streamNotesPost`). This is an Android surface;
the Host CLI launch alone does not prove it.

## Drive

1. Use an owned x86_64 Android emulator, one lane at a time. For the base build's sheet,
   install it first and run step 4 with `NOTES_LEG=before` (no writer call).
2. Install the candidate release APK (built per `mobile/README.md`, no stub flags), choose
   **On this phone** in setup and tap **Get it ready** where the size shows. Wait for ready.
   No sign-in or browser is needed.
3. Host companion first: from `mobile/eval`, `N01-notes-to-posts` runs the same
   `notesPosts` pipeline on raw notes and replays copies, instructions, invented numbers and
   times through admission; it is part of the writer gate (`score.ts`).
4. From the repo root run `ANDROID_SERIAL=emulator-NNNN OWNVOICE_AVD_NAME=<owned>
   node mobile/e2e/notes-posts.mjs <task-scratch> "$DONE_DONE_EVIDENCE_ROOT"`.
   - `NOTES_LEG=share` (default): Umer's notes arrive as a share, as from a notes app; the
     driver taps **Posts for X**, waits for the phone writer and its fit, scrolls every post,
     edits the first, taps **Copy** and checks the copied text is exactly the edited post.
   - `NOTES_LEG=replace`: the notes sit in the lab X composer and arrive as its selection;
     **Replace** puts the first post in the composer, read back from the fixture. **Post** is
     never tapped.
   - `OWNVOICE_THEME=dark` repeats a leg in dark.
5. Inspect every `*-posts-*.png`: each shown post is a post, not the notes, not instructions,
   no number the notes don't have, under 280 characters, and the posts differ. Fewer than three
   is allowed only when a slot stayed empty after its one retry. Every post has its
   engagement and stock wording rows. With no fit level from the phone, the set shows the one
   line "Fit levels need an online writer…".

## Evidence

The driver writes real-screen PNGs, accessible trees and `steps-<leg>-<theme>.json` with every
post text. Cite the PNGs. Nothing is sent or posted; the sheet's own Copy and Replace are the
only hand-offs.

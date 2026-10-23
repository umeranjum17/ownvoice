# Phone-writer reply quality (Android)

Source: `mobile/src/panel/phoneWriter.ts`, `packages/engine/src/drafts.ts`,
`mobile/src/core/polish.ts`, `mobile/src/ui/Ratings.tsx`. This is an Android
surface; the Host CLI launch alone does not prove it.

## Drive

1. Use an owned x86_64 Android emulator, one lane at a time. Build the release APK
   per `mobile/README.md`, with no stub writer flags. Install that exact candidate.
2. In setup choose **On this phone**, then **Get it ready** where the download size
   is shown. Wait for ready. This is the person's download consent, not a pref write.
   No provider sign-in or browser is needed. Enable accessibility and X in app choices.
3. From the repo root run `ANDROID_SERIAL=emulator-NNNN OWNVOICE_AVD_NAME=<owned>
   node mobile/e2e/phone-reply.mjs <task-scratch> "$DONE_DONE_EVIDENCE_ROOT"`.
   It builds the native X lab with the installed SDK tools, opens a timer post with
   an empty reply, taps the bubble once, waits up to ten minutes for the free phone
   writer, and scrolls the three cards. It never inserts, sends or posts.
4. Inspect the resulting `reply-cards-*.png` screens: **Agree**, **Push back, kindly**
   and **Ask a question** must each be a distinct reply, not a copy of the post or
   instructions such as “Agree, adding that…”. Every card has engagement and stock
   wording rows, including a clean push-back card. The rows are text checks, not a
   reach prediction. Keep only distinct, readable result screens in the sealed run.
5. Host regression companion: from `mobile/eval`, run the documented eight-case
   gate (P01/P13/S05/R01/R07 plus R13/R14/P20) and `score.ts`. R13/R14 replay the
   observed bad outputs through admission as well as generating live replies;
   P20 requires both distinct versions from a one-line own post. A hosted eval
   does not qualify the phone model; the native screens do.

## Evidence

The driver writes real-screen PNGs, accessible trees and `steps.json` containing
all three reply texts. Cite the PNGs, not logs alone. Bind the run and installed
APK to the final committed HEAD. Stop the owned emulator after the journey and
remove its scratch, keeping only evidence. No claim about fit calibration or
real signed-in X layout follows from this native lab.

# Read the README first screen

Part of the ownvoice verification map. Source: `README.md`, `docs/readme/*.webp`, `docs/readme/guide.md`.

## How to get to it (user POV)

Someone who has never heard of Ownvoice lands on the repo page and decides from the first screen whether to read on:
the name, one line saying what they get, and a real capture of the app before anything else.

## Driving it

Harness: A browser on the public repo page, logged out. No device, sign-in or model is involved.

1. Open `https://github.com/umeranjum17/ownvoice/tree/main` (before) and the branch under test (after), and scroll so the top of the README box is at the top of the window.
2. Capture the window at 360x780, 390x844, 445x900, 1280x800 and 1440x900, in light and in dark (`prefers-color-scheme` decides which capture the page serves).
3. Capture: save every frame to `$DONE_DONE_EVIDENCE_ROOT`, and write `steps.json` there with the widths and themes driven, as SKILL.md's Evidence section says.

The drive changes no repo file: note findings in the run's report.

## Passing it

- The first text under the name is the outcome line, and no changelog, caveat or install logistics sits above the hero.
- The hero is a real capture of the app, readable at 390 and at 1280: text on the phone screens can be read at both widths.
- Dark mode serves the dark captures, with no white boxes.
- The badges stay on one row, and the quick start is reachable within two desktop screens.
- Every relative link and anchor resolves: `README.md` and `docs/readme/guide.md` checked against each other.

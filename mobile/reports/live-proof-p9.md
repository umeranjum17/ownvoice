# P9 live proof — one live ChatGPT draft on the emulator (ownvoice-signed)

Date: 2026-09-29/30. Emulator: `ownvoice-signed`, serial `emulator-5554`.
App: `dev.ownvoice.next` release APK built from `origin/main` `ae1d7fb`
(revert of #79, PR https://github.com/umeranjum17/ownvoice/pull/93),
no E2E flags. Isolated env: `HOME`, npm cache, `GRADLE_USER_HOME` under
`/home/umer/lab-tmp/ov-ds-p9`, `GIT_EDITOR=true`, Java 21.
Owner ChatGPT sign-in already present (captain, 2026-09-29); only
`adb install -r` + bubble taps were driven — no sign-out, no wipe,
no credential copies. Captures: `live-proof-p9-01..06-*.png`
(status bar cropped, Ownvoice's own screens only, no personal data).

`~/.pi` hash before: `565bda1e285642b601fea1c55f8ea093b017869f8796daad4fda8a93583b3bcc`
`~/.pi` hash after: `6ccb280dc486e83077ea34be0710799693fda8a846e06ba349bb03175cd2d67c`
The whole-tree hash moved because this host runs several lanes at once:
every changed file is harness session/memory state
(`pi-hermes-memory/sessions.db`, `MEMORY.md` rotations,
`projects-memory/{pockit,crewhouse,…}` from other lanes) — none of it
Ownvoice. Ownvoice has no `~/.pi` reference anywhere in its sources,
all builds ran with an isolated `HOME`, and no profile, token or
credential file was read or copied at any point.

## Build and install

- `npm ci` OK, `expo prebuild` OK, `assembleRelease` OK (163 MB APK).
  Note: the first `./gradlew assembleRelease` invocation failed at the
  tail twice (650 tasks executed, no APK), and an immediate rerun with
  identical inputs succeeded both times — flaky final packaging, not sources.
- `adb install -r` in place; sign-in survived: Home shows
  "Writes with your ChatGPT / Ready to help" (`-01-home.png`).
- Setup was parked at TRY via the kv store (`setup={"step":"TRY"}`,
  `setup-done` removed, app restarted with `kill -9` + `am start`;
  never `am force-stop`). `writer-source="chatgpt"`, Gmail stays
  on this phone. Back keys later finished setup; final state: setup
  complete, source ChatGPT, signed in.

## 1. Practice-screen reply drafts via ChatGPT — PASS

Bubble tap epoch 1790721526233. Panel showed "Writing…" at +5.4 s;
all three labelled cards complete by +10.8 s (`-02-drafts.png`):

- SAY YES: "Saturday works. Bring the tent and I'll bring the stove."
- SAY NO, KINDLY: "Could we do another day? I can bring the stove if you bring the tent."
- ASK FIRST: "I'm not sure yet. Do you need an answer about Saturday now?"

All three answer both of Sam's points (Saturday + tent/stove).
Time to first card: between 5.4 s and 10.8 s (screenshot polling).

## 2. Selection rewrite through ChatGPT — PASS

`ACTION_PROCESS_TEXT` with "Please bring the tent. Pack the stove.
Meet Saturday at noon." → "Make it better" sheet with
Shorter / Simpler / Fix spelling / Friendlier / Firmer.
Chips ignore `adb input tap` on this sheet (taps land, nothing fires;
DPAD + ENTER works — see notes), so the rewrite was picked with
DPAD navigation + ENTER on **Firmer** → result card
"FIRMER: Bring the tent." with "Copy it, then paste it where you like."
(`-03-rewrite.png`). The phone writer is `unavailable` on emulators,
so this result came through ChatGPT; no failure line in logcat.

## 3. Read log says Sent to ChatGPT for a successful request — PASS

"What Ownvoice read" (`-04-readlog.png`, newest first):

- 2:38 AM "Suggested replies in Ownvoice (new) — Read the chat on
  screen. Sent to ChatGPT" — the §1 live draft above.
- 2:03 AM / 2:01 AM / 1:51 AM entries also say Sent to ChatGPT:
  these are transmitted-then-failed attempts (server answered HTTP 200
  with an empty stream, see below) — marked, as designed: an answer
  means the text went out.
- 1:50 AM "Read the chat on screen" with NO "Sent to ChatGPT" —
  the airplane-mode attempt (§4). Nothing went out, nothing marked.

Native `tapFacts` agree field-for-field (`sent=true` for every
attempt except the offline one, `sent=false`).

## 4. Airplane-mode attempt shows the plain offline line — PASS

With the emulator's network cut (airplane mode on, `ping` failing),
bubble tap → panel shows exactly "You're not connected to the
internet. Connect, then try again." (`-05-offline.png`, airplane icon
visible before cropping). No ChatGPT request went out (no new
`Ownvoice ChatGPT` line in logcat) and the read-log entry carries no
send mark (§3). Network restored after (`ping` OK, `airplane_mode_on=0`).

## Regression found mid-run: #79 broke the ChatGPT transport (fixed by #93)

The first five live attempts on build `a045a59` (which included
PR https://github.com/umeranjum17/ownvoice/pull/79, byokit
`accounts.respond` 0.4.1) all failed with "ChatGPT didn't answer this
time." Logcat every time:

```
… I ReactNativeJS: Ownvoice ChatGPT no-answer kind=unknown message=ChatGPT could not answer.
```

i.e. HTTP 200 with an empty SSE stream (`responses.ts`: no `line`).
Same account, same AVD, healthy device network (ping OK), two ~15 min
waits — still failing. A/B on the same emulator:

- Pre-#79 build (`faf2fc2`, byokit 0.3.1), installed in place:
  three live cards in ≤12 s (`-06-pre79-drafts.png`).
- Current-main build reinstalled one minute later: empty stream again.

Verdict reported as `regression in #79`; firstmate routed the fix as
PR https://github.com/umeranjum17/ownvoice/pull/93 (revert, now on
main as `ae1d7fb`). This proof ran on the reverted build, where the
first attempt succeeded. `responses.ts`/`accounts.ts` at `ae1d7fb`
are byte-identical to `faf2fc2`; `@byokit/accounts` is 0.3.1 again.
(`origin/main` also gained #92 prefill hand-off mid-run; it does not
touch the ChatGPT transport.)

## Final AVD state

- APK: release build of `origin/main` `ae1d7fb`, setup complete.
- Signed in to ChatGPT ("ChatGPT is connected" path: Home shows
  "Writes with your ChatGPT / Ready to help").
- Gmail still on this phone; Slack entry in the list is pre-existing.
- Emulator shut down cleanly with `adb emu kill`; no `force-stop` used.

## Notes for later lanes

- `adb input tap` does not activate controls on the translucent
  Panel/Rewrite sheets (taps visibly land nowhere; DPAD + ENTER works).
  Taps work fine on MainActivity and the bubble overlay. Tapping the
  dimmed area dismisses a sheet.
- `am start -a PROCESS_TEXT --es …` needs single-quote wrapping or
  `adb shell` word-splits the text; a redelivered intent does not
  refresh an already-open RewriteActivity — close it with Back first.
- The read-log screen plus `ownvoice-native` `tapFacts` prefs agree;
  prefs are readable with `adb root` (read-only is safe).

# Phone agent experiment (A5): loop vs script

Stand-in pass on `main` plus the A5 harness (`mobile/src/agent/__tests__/AgentExperiment.test.ts`,
task set `mobile/e2e/agent-tasks.json`). The live pass is **owed**: live rows run in a
follow-up on the one signed-in test emulator, which other live checks are using first.
Step 1 (one live tool-call turn) and the live pass of step 2 (P10 timings) run in that
follow-up; exactly what will run is listed under "Owed live rows".

## Method (stand-in)

- Voice rules for all six tasks: never-say `circle back`, `at the end of the day`, no long dash.
- Loop path: the real `chatgptBrain` over per-task scripted SSE (draft, check, revise, check,
  share, final line), split mid-event every 7 bytes, through the real `runAgent` +
  `checkVoice`/`shareNote` tools. The mock fetch sends nothing anywhere.
- Script path: the real `scriptBrain` over a fake text writer returning the same per-task
  drafts, through the same `runAgent` and tools.
- `approve`: tasks 1-5 yes, task 6 no (Not now). Task 5's share card carries the note; the
  loop's final line is the plain limit plus the share offer.
- Harness: `npm test -- --ci` in `mobile/` with a throwaway HOME, 37 suites / 679 tests green.
  Per-task rows print in the `AgentExperiment` test log (steps = model calls, calls = fetch/write
  count, ms = harness wall time, not device time).

## Per-task results (stand-in)

| Task | Mode | Steps | Calls | Stop | P1 meaning | P2 rules | P4 consent | P5 bounded | P6 limits | P7 plain |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 heater, firmer, share | loop | 4 | 4 | done | pass | pass | pass (1 card) | pass | n/a | pass |
| 1 | script | 3 | 1 | done | pass | pass | pass (1 card) | pass | n/a | pass |
| 2 list 12:00/3pm/Priya | loop | 4 | 4 | done | pass | pass | pass (1 card) | pass | n/a | pass |
| 2 | script | 3 | 1 | done | pass | pass | pass (1 card) | pass | n/a | pass |
| 3 reply Sam Sat/Sun | loop | 4 | 4 | done | pass | pass | pass (1 card) | pass | n/a | pass |
| 3 | script | 3 | 1 | done | pass | pass | pass (1 card) | pass | n/a | pass |
| 4 thank Alex, warmer | loop | 4 | 4 | done | pass | pass (checked 2x) | pass (1 card) | pass | n/a | pass |
| 4 | script | 3 | 1 | done | pass | pass | pass (1 card) | pass | n/a | pass |
| 5 email + calendar | loop | 4 | 4 | done | pass | pass | pass (1 card) | pass | pass | pass |
| 5 | script | 3 | 1 | done | pass | pass | recorded, not gated (note only, no limit line) | pass | recorded (script can not say the limit line; the loop owns P6) | pass |
| 6 same as 1, Not now | loop | 3 | 3 | declined | pass | pass | pass (nothing shared, no call after the no) | pass | n/a | pass |
| 6 | script | 2 | 1 | declined | pass | pass | pass (nothing shared, no call after the no) | pass | n/a | pass |

Median steps: loop 4, script 3 (cap 6, target median <= 4: met on both).
Harness ms per row: 0-7 ms (Jest wall time only; device timing is P10, owed live).

Finals (loop and script identical except task 6, where the declined loop keeps the last
checked draft and the declined script keeps the first):

- 1: "Hi, the heater has been broken since Monday. Please send someone to fix it this week."
- 2: "Hi team, quick list: standup moves to 12:00, demo Thursday at 3pm, and Priya owns the deck. Thanks!"
- 3: "Hi Sam, I can not make Saturday, but I could do Sunday after 2. Does that work?"
- 4: "Hi Alex, thank you so much for covering my shift. That meant a lot, and I really appreciate it."
- 5: limit line "I can't send email or change your calendar from here. You can share the note and paste it where you need it." plus "Here is a note to Sam: standup moves to 12:00 and demo is Thursday at 3pm." (share card: the note alone)
- 6: declined; loop latest "Hi, the heater has been broken since Monday. Please send someone to fix it this week.", script first draft kept, nothing shared either way.

## P9: loop vs script (stand-in)

| Criterion | Loop | Script |
|---|---|---|
| P1 (tasks 1-6) | 6/6 | 6/6 |
| P2 (tasks 1-6) | 6/6 | 6/6 |
| P3 (tasks 1, 4 vs one-shot, captain judgment) | owed (side-by-side below) | owed (side-by-side below) |

On the stand-in the loop and the script tie on P1-P2; the loop additionally owns P6 on
task 5 (the script keeps the facts but can not say the limit line). Whether the loop earns
its place is the captain's P3 call plus the live pass.

## P3 side-by-side (tasks 1 and 4, stand-in agent vs one-shot panel output)

Task 1:
- Agent (loop and script): "Hi, the heater has been broken since Monday. Please send someone to fix it this week."
- One-shot: "Hi, the heater is broken since Monday. Please fix it soon."

Task 4:
- Agent (loop and script): "Hi Alex, thank you so much for covering my shift. That meant a lot, and I really appreciate it."
- One-shot: "Hi Alex, thanks for covering my shift."

Captain: the agent versions are ___ (owed judgment; the live side-by-side reruns in the follow-up on the one signed-in test emulator, which other live checks are using first).

## P8: stays out of production

- `sh e2e/flag-cache.sh` in `mobile/` (this branch): **OK** (clean=3 after-fix=3
  mutated=4; lab screen `phone-agent-lab` in normal exports: 0, after a lab export: 0).
  A normal export after a lab export carries no lab screen, the stub count matches clean,
  and the cacheVersion-removed mutation check fails as it should.
- `ownvoice://agent` on an unflagged build opens Home: covered by `app/agent.tsx`
  (`<Redirect href="/" />` when the flag is off) and `SettingsTest` ("Home has no Try a
  writing task row outside lab builds"); emulator deeplink capture PENDING with the builds.
- Emulator captures (flagged lab build on the lane's own AVD `ov-agent-a5`, ANDROID_AVD_HOME
  under `/home/umer/lab-tmp/ov-agent-a5`, serial emulator-5554 verified via `adb emu avd name`;
  APK sha256 `dba0dba7e2647a5e5b2b598252139cb7ba5c226355a25545f69c9d5e0a423b1f`, built with
  `EXPO_PUBLIC_PHONE_AGENT=1 EXPO_PUBLIC_E2E_GPT=1 EXPO_PUBLIC_E2E_STUB=1` after the PR 66
  native fix; throwaway HOME/npm/Gradle home): in `mobile/reports/`
  - `OWNVOICE-AGENT-A5-home-chatgpt.png`: setup done, Home reads "Writes with your ChatGPT".
  - `OWNVOICE-AGENT-A5-home-row.png`: the lab row "Try a writing task" below the fold.
  - `OWNVOICE-AGENT-A5-lab-empty.png`: the task field "What should I write?", Write it disabled.
  - `OWNVOICE-AGENT-A5-lab-working.png`: task 1 running on the stand-in, streaming draft plus
    the one plain line "Checking it against your rules…" (never tool names).
  - `OWNVOICE-AGENT-A5-lab-share.png`: the approval card "Share this note?" with the exact
    text and Share / Not now; no share sheet appeared without a tap (P4 gate as built).
  Setup was walked with `e2e/first-run.mjs` to the practice step; its fixed Insert anchor
  (`width*.2, height*.6`) misses the pill on current main, so practice was finished with the
  on-screen Skip, then Done. Share/Not now reply paths and the done state are covered by
  `AgentScreen.test` RTL (Share to done, Not now to declined, cap, streaming lines).
  Driver: `mobile/e2e/agent-lab.mjs` (lane AVD only, refuses other AVDs, shell input +
  screencap only, never UiAutomator).
- Unflagged deeplink: `ownvoice://agent` on the unflagged release build (sha256
  `62c4cb1d5161bc502500f9527c026e341fb4bd42dca3aa09f52bcf7837f224f5`, fresh HOME for a
  clean Metro) opens the welcome flow ("Write replies that sound like you."), not the lab:
  `OWNVOICE-AGENT-A5-unflagged-deeplink.png`. APK bundle grep: 0 `phone-agent-lab` markers
  unflagged vs 1 flagged. With `SettingsTest` (no lab row unflagged) and the `app/agent.tsx`
  `<Redirect href="/" />`, P8 passes on the stand-in.

## P10: speed (owed live)

Live: first words on screen <= 3 s, finished note <= 25 s on the emulator. Not a gate on
the stand-in (harness rows run in 0-7 ms of Jest wall time).

## Owed live rows (follow-up on the one signed-in test emulator, which other live checks are using first)

1. Step 1: one live ChatGPT tool-call turn through firstmate's isolated signed-in test home
   (the plan section 6 "not measured" proof: function `tools` accepted on
   `chatgpt.com/backend-api/codex/responses` with this sign-in). No credentials are copied;
   the call goes through the isolated test home only.
2. Step 2 live pass: the six tasks in `mobile/e2e/agent-tasks.json`, once as the loop
   (`chatgptBrain`) and once as the fixed script (`scriptBrain` over the live writer),
   approve yes on 1-5 and Not now on 6, recording per task: final text, model call count,
   first-words and finish times (P10), and the P1-P9 verdicts against the same criteria.
3. P3 live side-by-side for tasks 1 and 4 (agent loop, agent script, one-shot) goes to the
   captain in the same text shape as above.
4. If the endpoint refuses function tools, the fallback is the JSON-action text protocol
   (plan section 10), recorded here before any further live running.

## Tool configuration unchanged

No credential was copied or read; `~/.pi`, `~/.codex` and other tools' config were never
touched. Every npm/Expo/Gradle run used a throwaway HOME (`mobile/.lab-home-a5`,
`/home/umer/lab-tmp/ov-agent-a5/home`), npm cache and Gradle home
(`/home/umer/lab-tmp/ov-agent-a5/gradle-home`); the emulator used the lane's own AVD only.
`~/.pi` file-list baseline before: files=39008 list-sha=1aa46fce654dec722c3748ebce9d83fde2b119ae053b9fd071d35a7be57faeeb
(kept at `/home/umer/lab-tmp/ov-agent-a5/pi-baseline.txt`); after: files=39008
list-sha=1aa46fce654dec722c3748ebce9d83fde2b119ae053b9fd071d35a7be57faeeb, zero files
added or removed outside the volatile session/memory/sqlite paths: settings, packages and
extensions unchanged.

# Phone agent experiment (A5): loop vs script

Stand-in pass on `main` plus the A5 harness (`mobile/src/agent/__tests__/AgentExperiment.test.ts`,
task set `mobile/e2e/agent-tasks.json`). The live pass is **owed**: the owner's one-time
ChatGPT sign-in in the dedicated test browser has not happened yet, so no live ChatGPT call
was possible. Step 1 (one live tool-call turn) and the live pass of step 2 (P10 timings)
run after that sign-in; exactly what will run is listed under "Owed live rows".

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

Captain: the agent versions are ___ (owed judgment; the live side-by-side reruns after sign-in).

## P8: stays out of production

- `sh e2e/flag-cache.sh` in `mobile/` (this branch): **OK** (clean=3 after-fix=3
  mutated=4; lab screen `phone-agent-lab` in normal exports: 0, after a lab export: 0).
  A normal export after a lab export carries no lab screen, the stub count matches clean,
  and the cacheVersion-removed mutation check fails as it should.
- `ownvoice://agent` on an unflagged build opens Home: covered by `app/agent.tsx`
  (`<Redirect href="/" />` when the flag is off) and `SettingsTest` ("Home has no Try a
  writing task row outside lab builds"); emulator deeplink capture PENDING with the builds.
- Emulator captures (flagged lab build on the lane's own AVD `ov-agent-a5`, ANDROID_AVD_HOME
  under `/home/umer/lab-tmp/ov-agent-a5`): OWED behind the main native build fix. The flagged
  release build (`:app:assembleRelease` from `mobile/android`, throwaway HOME/npm/Gradle home)
  fails at `:ownvoice-native:compileReleaseKotlin` with the known PR 61 errors (unresolved
  `coroutineContext` in `LocalGemma.kt`/`PhoneModel.kt`, `cancelDownload` overload in
  `OwnvoiceNativeModule.kt`); the ov-native-build fix lane owns that file. No phone install
  was attempted. The lane AVD `ov-agent-a5` stays created and booted for the rerun.

## P10: speed (owed live)

Live: first words on screen <= 3 s, finished note <= 25 s on the emulator. Not a gate on
the stand-in (harness rows run in 0-7 ms of Jest wall time).

## Owed live rows (run after the one-time ChatGPT sign-in)

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

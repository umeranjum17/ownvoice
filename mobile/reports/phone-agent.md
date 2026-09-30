# Phone agent experiment (A5): loop vs script

## Live result — 30 September 2026 UTC

**Recommend the fixed script provisionally.** The loop and script tie on the formal
number/name and writing-rule checks, but the loop missed the required approval card on
all four comparison tasks. Neither path establishes the full P10 speed pass. P3 is
**pending the captain's words**, not graded by the worker; the exact live comparison is
below. The experiment records failures rather than changing prompts or retrying for a
better answer. These are lab results, not a production rollout recommendation.

### Method and reproducible evidence

- Base: current main `2bc4e22` after the signed-switch prerequisite
  [merged change](https://github.com/umeranjum17/ownvoice/pull/114). BYOKit accounts
  0.11.0 `respond()` tools, `parallelToolCalls: false`, same writer/model and consent
  guard for both paths. No credential was read or copied. Sign-in remained valid.
- Only `ownvoice-signed`, verified serial `emulator-5684`, Android 36, 1080×2400,
  light mode. Other serials were listed for isolation but never driven. The emulator
  was stopped after the run. Each app restart used `kill -9` then `am start`, never
  force-stop. Installation used `adb install -r` to preserve the refreshed sign-in;
  this was a newly built APK, **not a data-clearing fresh installation**.
- Scratch/build/TMPDIR: `/home/umer/lab-tmp/ov-agent-a5-live`, isolated HOME/npm/Gradle
  directories there. `EXPO_PUBLIC_PHONE_AGENT=1`; neither E2E sign-in nor writer mock
  enabled. Rebuilt `:app:createBundleReleaseJsAndAssets --rerun` then
  `assembleRelease`. APK SHA256:
  `5ceb856b0a73afe6e45ee782c75d509d5ae2779c60614828db2e993aed4c04ee`.
- Main's screen still selects the stand-in. The **scratch-only**
  [adapter patch](phone-agent-live/live-adapter.patch) selects real `chatgptBrain` or
  real `scriptBrain` over guarded text-only ChatGPT turns, seeds exactly
  `mobile/e2e/agent-tasks.json`, and logs timestamps/returned turns. No product source
  change ships in this report. Both paths use the real loop, local checks and Share UI.
  Voice rules: never `circle back` / `at the end of the day`, no long dash. Stored
  voice was absent before testing, so no additional personal rules applied.
- One retained measurement per task/mode after the disclosed driver exclusions below.
  [Driver](phone-agent-live/run-task.mjs) verifies the AVD, captures the approval,
  taps Share for 1–5 and Not now for 6, and dismisses the Android share sheet without
  selecting a recipient. For the remaining rows it requires two identical approval
  frames with the expected button color. The loop offers no card on tasks 1–5, so
  those runs finish without a tap or sharing. Nobody sent a message or calendar event.
- [Results JSON](phone-agent-live/results.json) contains exact visible draft-card text,
  closing text, model calls, local tool sequence, approvals, timings and verdict inputs.
  Per-row event traces and PNGs are linked below. Final means the last **draft-card**
  text (also the approved share body when a card exists), not the model's closing
  commentary. This distinction matters on loop tasks 1 and 4: their closing revision
  differs from the checked draft retained in the card.
- Replay the formal P1/P2 checks from the checked-in traces with
  `node --experimental-strip-types mobile/reports/phone-agent-live/evaluate.mjs`.
  Pass a capture-root directory as the first argument to replay another copy; by
  default it reads the adjacent `loop-1` through `script-6` evidence and only prints
  results. `modelRequestCount` counts live writer requests; `modelToolNames` lists
  tools returned by those model turns, while `scriptSteps` includes local script work.
- Counts are **actual writer requests**, not `runAgent` steps: script steps include
  local checks/share and therefore cost fewer model calls. Script local tool sequences
  are reconstructed from the fixed script, its number of writes/steps and approval
  event; raw response events log the underlying text writer, which returns no tools.

### Step 1: live tools accepted

[Probe trace](phone-agent-live/step-1/events.json),
[consent/HTTP log](phone-agent-live/step-1/guards.txt),
[device capture](phone-agent-live/step-1/done.png).
The app fetched and verified signed switch sequence 1 ON from the published URL
(HTTP 200), with the genuine shared session (`mocked: false`, signed in, no sign-out,
`beforeSend: true`). The cache had no accepted switch from the earlier refused probes.
The first live response returned `check_voice` with draft/original `Hello Umer.`; the
local tool ran, and its result went into the next request. That continuation returned
`“Hello Umer.” passed the check. I didn’t share it.` Two requests, one function-call
turn, no approval or share. The JSON-action fallback was unnecessary.

### P1–P10 per task (live)

P1 uses the plan's exact gate: `addedNumbers` in both directions plus fixture names.
All twelve return no added/dropped number or missing name. This does **not** prove
all prose facts are grounded: script 1 invents “the unit is getting cold”; loop 4 says
“It took a lot off my plate.” Both need human scrutiny despite the formal P1 pass.
P2 replays the final text through the unchanged `hits`/`broken` rule check (no problems,
therefore `check_voice(final)` is OK). Loop task 4 actually called `check_voice` once.
P7 passes by review of every measured final capture/closing text: no tool/model name,
step-count jargon or raw error appears. The static technical-word regex flags ordinary
“prompt repair”, “prompt update” and “promptly”; these mean timely repairs, not a
model instruction, so the P7 verdict uses contextual review. No UI string was added
by this report.

| Task | Mode | P1 facts gate | P2 rules | P3 tone | P4 consent | P5 bounds | P6 limits | P7 plain | P8 flag | P9 comparison | P10 speed |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | loop | pass | pass | pending captain | FAIL (0 cards) | pass | n/a | pass | prior pass¹ | tie P1–P2; P3 pending | FAIL first; finish pass |
| 1 | script | pass | pass | pending captain | pass (1 card) | pass | n/a | pass | prior pass¹ | tie P1–P2; P3 pending | FAIL first; finish pass |
| 2 | loop | pass | pass | n/a | FAIL (0 cards) | pass | n/a | pass | prior pass¹ | tie P1–P2; P3 pending | FAIL first; finish pass |
| 2 | script | pass | pass | n/a | pass (1 card) | pass | n/a | pass | prior pass¹ | tie P1–P2; P3 pending | FAIL first; finish pass |
| 3 | loop | pass | pass | n/a | FAIL (0 cards) | pass | n/a | pass | prior pass¹ | tie P1–P2; P3 pending | FAIL first; finish pass |
| 3 | script | pass | pass | n/a | pass (1 card) | pass | n/a | pass | prior pass¹ | tie P1–P2; P3 pending | FAIL first; finish pass |
| 4 | loop | pass | pass | pending captain | FAIL (0 cards) | pass | n/a | pass | prior pass¹ | tie P1–P2; P3 pending | FAIL first; finish pass |
| 4 | script | pass | pass | pending captain | pass (1 card) | pass | n/a | pass | prior pass¹ | tie P1–P2; P3 pending | FAIL first; finish pass |
| 5 | loop | pass | pass | n/a | n/a (0 cards) | pass | pass | pass | prior pass¹ | n/a | FAIL first; finish pass |
| 5 | script | pass | pass | n/a | n/a (1 card) | pass | pass | pass | prior pass¹ | n/a | unverified first; finish pass |
| 6 | loop | pass | pass | n/a | pass (declined) | pass | n/a | pass | prior pass¹ | n/a | FAIL first; finish pass |
| 6 | script | pass | pass | n/a | pass (declined) | pass | n/a | pass | prior pass¹ | n/a | FAIL first; finish pass |

¹ P8 reuses the historical flagged/unflagged export and emulator evidence below;
this report ships no app change and did not rerun an unflagged installation on the
signed-in AVD. P8 is common to all rows, not twelve new device observations.
P3 only applies to tasks 1/4; P4's prescribed card count applies to 1–4 and decline to 6;
task 5 card counts are recorded without extending that gate. P6 only applies to task 5.
P9 is the aggregate comparison below, not an independent task test.

### Calls, consent, stop and captures

The loop's missing cards on tasks 1–4 fail P4's completion requirement, although
nothing was shared without consent. On task 5 both paths say they cannot email or
change a calendar and offer the note. The loop only calls checks and does not open
Share; the script's limit sentence is inside the note it offers to share. Both task 6
runs show exactly one card, receive Not now, stop `declined`, open no share sheet,
and make no model request after the no.

| Task | Mode | Model calls | Loop steps | Check calls | Cards | Reply | Stop | Evidence |
|---|---|---:|---:|---:|---:|---|---|---|
| 1 | loop | 2 | 2 | 1 | 0 | none | done | [trace](phone-agent-live/loop-1/events.json), [final](phone-agent-live/loop-1/done.png) |
| 1 | script | 1 | 3 | 1 | 1 | Share, sheet closed | done | [trace](phone-agent-live/script-1/events.json), [final](phone-agent-live/script-1/done.png), [approval](phone-agent-live/script-1/share.png), [sheet](phone-agent-live/script-1/sheet.png) |
| 2 | loop | 2 | 2 | 1 | 0 | none | done | [trace](phone-agent-live/loop-2/events.json), [final](phone-agent-live/loop-2/done.png) |
| 2 | script | 1 | 3 | 1 | 1 | Share, sheet closed | done | [trace](phone-agent-live/script-2/events.json), [final](phone-agent-live/script-2/done.png), [approval](phone-agent-live/script-2/share.png), [sheet](phone-agent-live/script-2/sheet.png) |
| 3 | loop | 2 | 2 | 1 | 0 | none | done | [trace](phone-agent-live/loop-3/events.json), [final](phone-agent-live/loop-3/done.png) |
| 3 | script | 1 | 3 | 1 | 1 | Share, sheet closed | done | [trace](phone-agent-live/script-3/events.json), [final](phone-agent-live/script-3/done.png), [approval](phone-agent-live/script-3/share.png), [sheet](phone-agent-live/script-3/sheet.png) |
| 4 | loop | 2 | 2 | 1 | 0 | none | done | [trace](phone-agent-live/loop-4/events.json), [final](phone-agent-live/loop-4/done.png) |
| 4 | script | 1 | 3 | 1 | 1 | Share, sheet closed | done | [trace](phone-agent-live/script-4/events.json), [final](phone-agent-live/script-4/done.png), [approval](phone-agent-live/script-4/share.png), [sheet](phone-agent-live/script-4/sheet.png) |
| 5 | loop | 3 | 3 | 2 | 0 | none | done | [trace](phone-agent-live/loop-5/events.json), [final](phone-agent-live/loop-5/done.png) |
| 5 | script | 2 | 4 | 2 | 1 | Share, sheet closed | done | [trace](phone-agent-live/script-5/events.json), [final](phone-agent-live/script-5/done.png), [approval](phone-agent-live/script-5/share.png), [sheet](phone-agent-live/script-5/sheet.png) |
| 6 | loop | 2 | 2 | 1 | 1 | Not now | declined | [trace](phone-agent-live/loop-6/events.json), [final](phone-agent-live/loop-6/done.png), [approval](phone-agent-live/loop-6/share.png) |
| 6 | script | 1 | 2 | 1 | 1 | Not now | declined | [trace](phone-agent-live/script-6/events.json), [final](phone-agent-live/script-6/done.png), [approval](phone-agent-live/script-6/share.png) |

Total measured model calls: **loop 13, script 7**. Medians: **2 vs 1**; maxima **3 vs 2**.
All meet ≤6 per task / median ≤4. No live run hit the cap; its plain-line behavior
remains covered by the stand-in/RTL evidence rather than a new live cap trial.

### P10: speed and measurement limits

`start` is the Write handler timestamp. “First update” is the earliest nonempty streamed
text callback or draft-card update; “note ready” is the first update equal to the final
card; “run end” includes any approval/share-sheet wait and closing model turn. These are
**UI-update timestamps, not frame presentation times**. “Captured by” is the final PNG's
local creation time minus start: the captured note was already on screen by that bound.
Host/device clocks aligned (no negative/impossible deltas), but this is one run, not a
benchmark or a claim about other phones/networks.

The recordings failed `ffprobe` with `moov atom not found`, so they are not usable frame
proof and are not shipped. Do not infer an on-screen ≤3 s pass from a callback. Eleven
first-update times already exceed 3 s, hence fail; script 5's 2.962 s leaves only 38 ms
for rendering and is **unverified**, not passed. All final PNGs show the completed note
within 25 s (largest bound 18.614 s), so the finished-note half passes. Full P10 passes
**0/12 established**; 11 failures and 1 unverified first-words row. No model retry was
made to repair the timing evidence.

| Task | Mode | First update s | Note ready s | Run end s | Captured by s | First ≤3 s | Finished ≤25 s |
|---|---|---:|---:|---:|---:|---|---|
| 1 | loop | 5.309 | 5.309 | 8.552 | 10.490 | FAIL | pass |
| 1 | script | 4.621 | 4.621 | 5.778 | 9.768 | FAIL | pass |
| 2 | loop | 13.861 | 13.861 | 16.555 | 18.614 | FAIL | pass |
| 2 | script | 4.464 | 4.464 | 5.729 | 9.641 | FAIL | pass |
| 3 | loop | 3.960 | 3.960 | 6.641 | 8.416 | FAIL | pass |
| 3 | script | 3.740 | 3.740 | 4.771 | 8.668 | FAIL | pass |
| 4 | loop | 4.022 | 4.022 | 6.876 | 8.397 | FAIL | pass |
| 4 | script | 3.965 | 3.965 | 6.495 | 10.984 | FAIL | pass |
| 5 | loop | 5.362 | 8.603 | 11.457 | 13.906 | FAIL | pass |
| 5 | script | 2.962 | 5.570 | 7.511 | 11.877 | unverified | pass |
| 6 | loop | 5.021 | 5.021 | 9.420 | 12.516 | FAIL | pass |
| 6 | script | 5.312 | 5.312 | 7.517 | 10.570 | FAIL | pass |

### P9: loop vs script (live tasks 1–4)

| Criterion | Loop | Script |
|---|---|---|
| P1 numbers/names | 4/4 | 4/4 |
| P2 writing rules | 4/4 | 4/4 |
| P3 as good as/better than one-shot | pending captain on 1/4 | pending captain on 1/4 |
| P1–P3 proven passes | 8; P3 unresolved | 8; P3 unresolved |
| P4 required share card | 0/4 | 4/4 |
| Model calls, median (tasks 1–4) | 2 | 1 |

The loop has not earned retention: it ties the proven P1/P2 gates and there is no captain
preference on P3. Under the approved P9 rule the provisional recommendation is **script**.
Do not record a captain preference or an overall experiment pass until their words arrive.

### P3: exact live text for the captain

The comparison uses the **visible final draft card**, not a later alternate version in
status text. The actual one-shot panel was opened through Ownvoice's practice bubble on
this same signed-in APK. A minimal draft supplied the task's facts, with a demo voice note
asking for firmer/warmer wording. The stock practice conversation (Sam's camping chat)
remained context only. This compares end results; panel input is a draft, agent input is
the fixture instruction, so it is not an identical-prompt blind trial. All data is invented;
the person is Umer. Panel demo voice/setup state was restored afterward.

Task 1 — heater, firmer:

- **Loop:** “Hi, the heater has been broken since Monday. Please arrange a repair as soon as possible and let me know when someone can come by. Thank you.”
- **Script:** “Hi [Landlord’s Name],

The heater in my unit has been broken since Monday. Please let me know when it will be repaired. I’d appreciate an update today and a prompt repair, as the unit is getting cold.

Thank you,
[Your Name]”
- **One-shot panel, Shorter:** “Hi, the heater has been broken since Monday. Please fix it as soon as possible.”
- **One-shot panel, Main point first:** “The heater has been broken since Monday. Please fix it as soon as possible.”

[Panel input](phone-agent-live/panel-1/input.png),
[panel result](phone-agent-live/panel-1/result.png),
[input and tone note](phone-agent-live/panel-1/input.json).
Loop's closing text additionally prints first/firmer versions, but the card still holds
the quoted checked note and no share card appears. The full closing text is in results JSON.
The script's extra cold-unit claim is not in the fixture.

Task 4 — Alex, warmer:

- **Loop:** “Alex, thanks for covering my shift. I really appreciate you stepping in. It took a lot off my plate, and I’m grateful I could count on you.”
- **Script:** “Hi Alex,

Thank you so much for covering my shift. I really appreciate you stepping in. It meant a lot to me, and I’m grateful I could count on you.

Thanks again!”
- **One-shot panel, Shorter:** “Hi Alex, thanks for covering my shift!”
- **One-shot panel, Main point first:** “Hi Alex, I really appreciate you covering my shift.”

[Panel input](phone-agent-live/panel-4/input.png),
[panel result](phone-agent-live/panel-4/result.png),
[input and tone note](phone-agent-live/panel-4/input.json).
Loop's closing text is “Alex, thank you so much for covering my shift. It meant a lot
that you stepped in, and I really appreciate you.” It appears separately above the retained
checked card; no share card appears. Judge the quoted visible card and note that discrepancy.

**Captain's words:** pending. Task 1 loop vs panel ___; script vs panel ___;
task 4 loop vs panel ___; script vs panel ___; loop vs script preference ___.

### Excluded and retried attempts

No attempt was excluded for writing quality, rule failure or speed. All exclusions are
operational and preserved separately from the twelve measured rows:

1. Four pre-publication tool diagnostics (distinct starts `1790800156673`,
   `1790800364823`, `1790800851540`, `1790801155100`) stopped at the unknown-switch
   consent veto, before any model dispatch. The switch URL was 404 then; publishing the
   real signed ON switch resolved it. [Sanitized traces](phone-agent-live/excluded-switch-probes.json).
   Duplicate diagnostic log views are not extra attempts. Zero model calls in these four.
2. One bundled Sam camping practice-panel tap during sign-in diagnosis produced three
   live replies; it was not a fixture or P3 comparison and is excluded. Its purpose was
   to distinguish valid panel sign-in from the stricter agent switch veto. No per-request
   instrumentation was present, so its model-call count is not claimed.
3. First loop task 1 driver trial: two model requests (check then share), approval reached,
   OCR selected the Share **heading**, not the button; Back navigated away. No approval
   reply or share occurred. [Trace](phone-agent-live/excluded-loop-1/events.json),
   [frame](phone-agent-live/excluded-loop-1/approval.png). The replacement loop 1 measurement
   is included even though it produced no share card. Its directory previously held a stale
   trial Share PNG; that stale file is deliberately absent from the measured evidence.
4. First script task 4: one model request, stopped at its approval frame during a button
   fade (different color); no reply/share. [Trace](phone-agent-live/excluded-script-4/events.json),
   [frame](phone-agent-live/excluded-script-4/approval.png). Firstmate explicitly authorized
   restarting task 4 with the stable-frame driver; the successful retry is the measured row.
5. Task 4 panel's first result capture still showed input/keyboard and no panel. After
   dismissing the keyboard and rebinding the service, the bubble opened the one live panel
   result. This was a navigation correction, not an additional writing-result retry.

Measured calls total 20; the two failed fixture driver trials add 3, and step 1 adds 2.
Pre-switch probes add zero; the separate camping-panel diagnostic's count is unmeasured.
The [manifest](phone-agent-live/manifest.json) identifies the base, APK and excluded trials.

### Tool configuration unchanged

The worker did not edit `~/.pi` settings, packages or extensions. Before/after names,
sizes and modification times for 376 nonvolatile configuration files match exactly;
metadata snapshot SHA256 `246156ee1933ae5e2869af9d158754e87d98f462f84a4cd85010ec70756a1a9f`.
Volatile session/memory/sqlite/history/log/cache paths and `auth.json` were excluded.
This is a **metadata comparison**, not a claim that credential/config contents were read
or cryptographically compared. No copied credentials, second login, external tool config
changes or other emulator interaction were used. Demo SQLite writes were limited to
`setup`, `setup-done`, and `voice`, restored after the panel comparisons.

## Historical stand-in evidence

The following describes the earlier stand-in run. Its "owed live" references are
superseded by the live observations above; its P3 placeholders are not captain judgments.

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

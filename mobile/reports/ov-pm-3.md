# J1 qualification checkpoint — live proof pending

2026-10-01. Branch: `fm/ov-pm-3`, based on main `c319f30`.
Streaming implementation commit: `fd789aa`.
This is a partial implementation checkpoint, not J1 acceptance or a ready PR.

## Established work and reproduced defect

Read `accounts-090-live-ab.md` and `first-card-stream.md` before implementation.
The former observed all three ChatGPT practice replies arriving together at
9,235 ms; that historical practice run does not qualify as a real-app J1 trial.
The latter repairs the phone writer, not ChatGPT reply streaming.

On current main, the ChatGPT reply writer awaited the whole BYOKit response
before calling `landed`. A controlled SSE regression through the real writer
and installed kit failed with `No finished card before stream completion`.
After installing pinned BYOKit 0.13.0, the original main writer was temporarily
restored for that isolated regression: it failed with the same error. Restoring
the candidate byte-for-byte made it pass. Both pinned-kit logs are retained as
`current-kit-{baseline,candidate}-regression.log`.
After the repair, that same regression passes: completed JSON strings pass
through existing cleanup and duplicate checks, retain their slots, and arrive
while the response remains open. A rejected middle slot is retried into its
original position. An incomplete initial response clears provisional cards.
The model, prompt, provider integration, layouts and styling are unchanged.

## Local verification and its limits

- Response suite: 57 tests passed on the pinned kit, including the new failing-before/passing-after
  streaming regression and existing consent, refusal, retry and incomplete checks.
- Two writer-routing suites add 44 passing tests. The panel-actions suite passes
  both tests in isolation; the first combined run hit an existing five-second
  timeout in its first test. Both the initial failure and passing rerun are retained.
- TypeScript, ESLint and `git diff --check` passed with pinned dependencies.
- The initial installed kit was stale 0.7.1. The queued foreground `npm ci`
  completed and installed the pinned 0.13.0; no unrelated type workaround was made.
- Unflagged prebuild passed. Unflagged `assembleRelease` passed in 5m 51s with
  x86_64 selected and the release JS bundle explicitly rerun. No E2E or lab flag
  was set. Build evidence is `evidence/prebuild.log` and `evidence/release-build.log`.
- APK SHA-256:
  `a74d71af1f8c37aa8da7a99fee6ffcc2e9dd2cc508e66e34052d625c0da8ff74`.
  The APK installed successfully with `adb install -r` on the retained emulator;
  no app data was cleared. This is installation proof, not generated-reply proof.
- No no-mistakes run was started; that handoff requires firstmate's instruction
  after completed implementation.

## Live acceptance still owed

The original lock waiter (session 5429) acquired both locks at 10:11 UTC.
Available RAM was 17,264,140,288 bytes, above 15 GiB, immediately before boot.
The owned retained AVD identified as `ownvoice-signed` at `emulator-5684` and
booted successfully. The physical phone was never driven. Initial RAM had been
below the minimum; no boot was attempted then. No emulator lock was retained
while waiting for heavy work.

Bounded inspection found Gmail and Ownvoice installed; Slack and X absent.
Google Play's package existed but `resolve-activity` returned `No activity found`.
The officially downloaded WhatsApp APK installed successfully under the direct
heavy lock. Its fresh setup reached **Enter your phone number**, with the notice
**WhatsApp will verify your account**. No number was entered or verification
requested. Gmail's fresh setup reached **Add an email address**, with no account
configured. Screenshots `whatsapp-phone-gate.png` and `gmail-account-gate.png`
contain setup screens only, no personal account or messages. No external demo
messages were sent or published, and no subscription generation was run.

After message 007, the original accessibility-service setting was restored.
The owned emulator PID 766574 exited and session 5429 exited, releasing both
lifetime locks at 10:18 UTC before waiting on account decisions. Ownvoice app
prefs/data were never cleared or manually edited. The candidate APK had already
replaced the prior APK before message 007 requested restoration; no prior APK
backup/path is available in this lane, so **prior APK restoration is outstanding**.
The retained sign-in was preserved by `install -r`; no secret files were read,
credentials copied or sign-in repeated.

| Acceptance | Evidence in this checkpoint |
| --- | --- |
| At least 10 threads across WhatsApp, Slack, X DMs and Gmail | Not run |
| Actual subscription output, each point answered and labels matched | Not run; no generated product replies |
| First card within 3 s, all within 6 s from recording frames | Unmeasured |
| First finished card inserted while others load | Unverified live; panel source permits Insert during writing |
| One recording per app, quoted replies and per-card timings | Missing |
| Umer sends 8 of 10 unedited | Requires Umer's review; no worker judgment supplied |
| Current-kit qualification and unflagged release build | Passed; live device qualification still owed |

Firstmate evidence directory:
`/home/umer/.treehouse/firstmate-8bf1b0/4/firstmate/data/ov-pm-3/evidence/`.
The checkpoint records absent production data explicitly, rather than treating
test fixtures as subscription output. Scratch is `/home/umer/lab-tmp/ov-pm-3`.
No credentials or secret-file contents were read or copied, and no `.pi` edits
were performed. Accessible-tree metadata did change during the check (memory
database WAL/shared-memory files and session metadata); this does not prove an
unchanged `.pi` tree or attribute those writes to a particular process. An existing
protected quarantine directory could not be inspected. Both metadata inventories
are retained in the evidence directory without reading any file contents.
Per firstmate's clarification, the non-secret `~/.pi/agent/settings.json` surface
was separately hashed before dependency installation and matches afterward.
No global-tree invariance is claimed.

Firstmate inbox `001.msg` was read and acknowledged. It names the retained
`ownvoice-signed` AVD at port 5684, with
`ANDROID_AVD_HOME=/home/umer/.local/share/ownvoice-test/avd` and
`ANDROID_EMULATOR_HOME=/home/umer/.android`. Its referenced
`data/ov-proof-real/report.md` was inspected for replay guidance. That scout uses
local Chrome fixtures, so it supplies operating guidance but no qualifying J1
real-app evidence. Any resumed emulator window must wait in the foreground for
both emulator and signed locks; it must preserve sign-in and not stop another lane.

Firstmate inbox messages 002–007 were also read and acknowledged. The heavy-slot
blocker was reclassified as an authorized external wait and explicitly resolved
with key `j1-heavy-slot`; its foreground job was reattached through completion.
Message 005 reports native X and a dedicated demo login missing in ov-pm-2 and
authorizes bounded setup, with verified evidence shared through firstmate.
X's [official download page](https://help.x.com/en/using-x/download-the-x-app)
routes Android installs through Google Play. The exact WhatsApp phone-number and Gmail add-account gates were subsequently
observed by this lane; no owner credentials were used.

WhatsApp's [official download page](https://www.whatsapp.com/download/android)
provides a direct APK link hosted on `scontent.whatsapp.net`. That artifact is
staged at `/home/umer/lab-tmp/ov-pm-3/WhatsApp.apk`, identifies as `com.whatsapp`
2.26.39.70 and includes x86_64. Signature verification passed with certificate
DN `CN=WhatsApp LLC, O=WhatsApp LLC`; the actual downloaded APK SHA-256 is
`989a0b1e7cc88cd1fab30281e252c8c07461e64f4c535435bfd376c9e810aca1`.
The page's advertised version differed from the APK's actual version, so the
package metadata above is used. Provenance, package metadata and signature
output are retained in the evidence directory and shared through firstmate.
Installation and bounded fresh-account setup ran; verification stopped at the
blank phone-number gate. Slack's
[official Android page](https://slack.com/downloads/android) also routes installs
through Google Play; no store authentication workaround was attempted.

Message 006 confirms that ov-pm-2 owns both locks and is provisioning an
official Play-capable task-local demo environment because the retained AVD’s
Play package lacked an Activity. That observation belongs to ov-pm-2; this lane
has not inspected it. The existing foreground session 5429 subsequently acquired the retained window;
no alternate emulator or duplicate queue was started.

Next requires firstmate to provide the dedicated demo-account setup path and
the prior APK restoration artifact, then authorize a new exclusive proof window.
Native four-app proof remains unrun. New frontend work remains held.

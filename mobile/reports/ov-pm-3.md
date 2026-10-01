# J1 qualification checkpoint — blocked

2026-10-01. Branch: `fm/ov-pm-3`, based on main `c319f30`.
This is a partial implementation checkpoint, not J1 acceptance or a ready PR.

## Established work and reproduced defect

Read `accounts-090-live-ab.md` and `first-card-stream.md` before implementation.
The former observed all three ChatGPT practice replies arriving together at
9,235 ms; that historical practice run does not qualify as a real-app J1 trial.
The latter repairs the phone writer, not ChatGPT reply streaming.

On current main, the ChatGPT reply writer awaited the whole BYOKit response
before calling `landed`. A controlled SSE regression through the real writer
and installed kit failed with `No finished card before stream completion`.
After the repair, that same regression passes: completed JSON strings pass
through existing cleanup and duplicate checks, retain their slots, and arrive
while the response remains open. A rejected middle slot is retried into its
original position. An incomplete initial response clears provisional cards.
The model, prompt, provider integration, layouts and styling are unchanged.

## Local verification and its limits

- Response suite: 57 tests passed, including the new failing-before/passing-after
  streaming regression and existing consent, refusal, retry and incomplete checks.
- ESLint and `git diff --check` passed.
- **Dependency mismatch:** installed `@byokit/accounts` is 0.7.1; the committed
  package pins 0.13.0. The test result therefore does not qualify the current kit.
- Typecheck fails in unchanged `src/agent/chatgptBrain.ts:50`: the installed kit's
  overload does not accept `parallelToolCalls`. No unrelated workaround was made.
- `npm ci` and prebuild could not start: `/tmp/fm-ownvoice-heavy.lock` was busy
  on two actual heavy-command attempts. Per the worker brief, escalation stops work.
- No release APK was built, installed or hashed. No no-mistakes run was started;
  that handoff requires firstmate's instruction after completed implementation.

## Live acceptance still owed

The emulator/signed lock acquisition failed. No emulator was driven or booted,
no account was inspected, and the physical phone was never driven. Initial
available RAM was 14,585,151,488 bytes, below the 15 GiB boot minimum; a later
read showed 22,369,722,368 bytes. No lock was retained while waiting.
Existing app installs and demo-account availability remain **uninspected**.

| Acceptance | Evidence in this checkpoint |
| --- | --- |
| At least 10 threads across WhatsApp, Slack, X DMs and Gmail | Not run |
| Actual subscription output, each point answered and labels matched | Not run; no generated product replies |
| First card within 3 s, all within 6 s from recording frames | Unmeasured |
| First finished card inserted while others load | Unverified live; panel source permits Insert during writing |
| One recording per app, quoted replies and per-card timings | Missing |
| Umer sends 8 of 10 unedited | Requires Umer's review; no worker judgment supplied |
| Current-kit qualification and unflagged release build | Blocked by heavy lock |

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

Firstmate inbox `001.msg` was read and acknowledged. It names the retained
`ownvoice-signed` AVD at port 5684, with
`ANDROID_AVD_HOME=/home/umer/.local/share/ownvoice-test/avd` and
`ANDROID_EMULATOR_HOME=/home/umer/.android`. Its referenced
`data/ov-proof-real/report.md` was inspected for replay guidance. That scout uses
local Chrome fixtures, so it supplies operating guidance but no qualifying J1
real-app evidence. Any resumed emulator window must wait in the foreground for
both emulator and signed locks; it must preserve sign-in and not stop another lane.

Resume needs a serialized heavy-command slot for `npm ci`, current-kit checks,
prebuild and unflagged release, followed by exclusive emulator and signed-environment
access to inspect existing demo-account setup. New frontend work remains held.

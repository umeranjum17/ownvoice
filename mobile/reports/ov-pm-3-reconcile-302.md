# J1 source reconciliation, release proof deferred

2026-10-03. Preserving replacement for https://github.com/umeranjum17/ownvoice/pull/122.
Main302/303 authorize one fresh full validation of the accepted deltas on current main.
Real-app output proof is now a release gate, not a source-merge gate (Main298).
No live proof is claimed by this reconciliation.

## Preservation and containment before validation

Original branch `fm/ov-pm-3` remains at
`cfd145c55fc3c3e0db565408984e67505524bd4b`, also retained as
`archive/ov-pm-3-original-302`. Original run
`01M3VG1K4B037XHNAZ3YD4F3YD` and its CI monitor are untouched.
The accepted range is `c319f30..cfd145c`, containing:

| Original commit | Accepted change | Mapping to current main |
| --- | --- | --- |
| `fd789aa3418d66c9eee3068b64eb5ee467b25eba` | Stream completed ChatGPT reply slots; executable SSE regression; original qualification report | Not landed; all changes reapplied |
| `6b4c1d2df7bc94e0884161834f52b0d8806c8cde` | Pinned-kit validation and native demo-account blockers | Original report retained byte-for-byte |
| `cfd145c55fc3c3e0db565408984e67505524bd4b` | Pipeline documentation of streaming, insertion and incomplete cleanup | Both README deltas reapplied |

Freshly fetched `origin/main` is
`2e9acc58d7170d90727f7aa4fd899e5c88252356`.
The new branch is `fm/ov-pm-3-reconcile-302`, assembled from that base using
only the accepted range plus this reconciliation receipt. None of the original
five changed-file deltas was already present on this main; nothing was replayed
from other lanes. Three-way application was clean with zero conflicts.
Every added and removed line in each original file delta equals the corresponding
candidate delta. The original report blob is unchanged. File blobs differ elsewhere
because current-main content is retained, including fitBackend/consent/abort handling,
its two fit regression tests, withheld draft approval, voice samples, and release docs.
No product adaptation or conflict repair was necessary. Whole-file replacement was
not used; all changes outside those deltas are inherited from current main.

Task evidence `data/ov-pm-3/evidence/reconcile-302/` retains a verified complete
Git bundle of both original refs, original source tar, binary accepted-range patch,
full commit metadata, per-file containment/blob mapping, original stock run response,
and SHA-256 hashes of the archives. No original evidence was removed.
`ov-pm-3.md` is historical evidence for its stated original base and APK, not a
current-main build or live validation result.

## Validation and remaining release gates

Exactly one fresh full stock no-mistakes run is authorized for this replacement.
No model/effort pin, automatic gate approval, step skip, shared settings/tool changes,
or original-monitor cancellation is authorized. Pipeline agents inherit the existing
trusted headless validation contract; Android/device/live execution is prohibited in
this source phase. Current-base CI must validate the actual replacement head.
Ask-user findings return to Firstmate. The supervisor owns merging and original-PR
closure after the replacement is green.

The original unflagged APK and tests cannot qualify this new source head.
There are still zero qualifying four-app recordings, no ten-thread generated-reply
table, no measured first-card/all-card frame timings, no demonstrated early insertion,
and no Umer send-rate judgment. Real ChatGPT/demo-account output, reply factuality,
label matching, timing, insertion, and the single combined current-main lab pass remain
release work under existing scoped allocation/privacy/resource safeguards. No emulator,
physical phone, credential runtime, or live provider was driven for reconciliation.

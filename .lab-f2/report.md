# F2 fit judge output proof

Four selected real answers on `ownvoice-signed` / `emulator-5684`, 2026-10-01, through Ownvoice's signed-in BYOKit accounts transport and production fit consent checks. Baseline calls had three candidates; the final harder calls had four. Demo text only, no real social apps/accounts, posting or physical phone use. One decide/answerer call per platform per run. This was a temporary route-driven proof, not a wired bubble journey. Latencies surround `judgeFit()` and exclude launch.

The raw probability objects, questions, levels and ordering are in [live-answers.json](live-answers.json). Final hard-call APK and fit-source SHA-256 values are recorded there. Both final answers were valid requested JSON, and all four levels plus each best pick cleared the 0.6 floor. These are self-reported probabilities, not calibrated reach.

**X baseline:** Shipping a tiny app every week this year. Week 12: a timer that only counts focused minutes.

**Reddit baseline:** r/androidapps: I made a timer that counts focused minutes. It pauses when you leave the app. How should I handle reading a PDF in another app? No promotion or vote requests please.

**X harder case:** I made a focus timer that pauses whenever I leave the app. Great for avoiding feeds, awkward when the task is reading a PDF. Would you allow a list of work apps or manual exceptions?

**Reddit harder case:** r/androidapps: My focus timer pauses any time I leave it. I want it to count reading a PDF as work but still stop when I open a feed. Is an allow-list or a one-off exception less annoying? Please explain trade-offs; no promotion.

| Post | Candidate text | Level | Best pick | Call latency |
| --- | --- | --- | --- | --- |
| X: focused timer | Love this! Keep crushing it! | Likely to be skipped | No | 6.245 s |
| X: focused timer | Does it pause when you switch apps? That is where my focus timers quietly turn into lunch timers. | Strong fit here | Yes | 6.245 s |
| X: focused timer | Most productivity apps are a scam. Agree? | Likely to be skipped | No | 6.245 s |
| Reddit: focused timer | Great app, thanks for sharing! | Likely to be skipped | No | 3.968 s |
| Reddit: focused timer | Let people pick a small list of allowed apps, like their PDF reader. Keep the pause on for everything else so opening a feed still stops the timer. | Strong fit here | Yes | 3.968 s |
| Reddit: focused timer | Upvote this if you hate productivity apps! | Likely to be skipped | No | 3.968 s |
| X: harder allow-list trade-off | contenteditable multiline draft | Likely to be skipped | No | 6.517 s |
| X: harder allow-list trade-off | I keep trying focus timers because I get pulled into feeds, but then I need to check a document, and I end up arguing with the timer, so maybe some way to say this app is work would help, though I worry I would add too many apps. | Might get a reply | No | 6.517 s |
| X: harder allow-list trade-off | An allow-list sounds like the better default. Manual exceptions would be easy to forget. | Good fit here | No | 6.517 s |
| X: harder allow-list trade-off | Let me pick a PDF reader once, then pause on every other app. Manual exceptions would make me babysit the timer instead of the task. | Strong fit here | Yes | 6.517 s |
| Reddit: harder allow-list trade-off | contenteditable multiline draft | Likely to be skipped | No | 5.132 s |
| Reddit: harder allow-list trade-off | I have tried a few timers and I do like the idea of pausing when I get distracted, but I also switch between a bunch of things for work, and sometimes I am reading a document and sometimes I am just avoiding a hard task, so I am not sure how the timer would know. I guess a list might help, but then I would probably put too many things on it, and I would still need to think about whether I was actually working. | Might get a reply | No | 5.132 s |
| Reddit: harder allow-list trade-off | I would start with an allow-list. It seems easier than choosing an exception every time I leave the app. | Good fit here | No | 5.132 s |
| Reddit: harder allow-list trade-off | Let the user add just their PDF reader and editor to a work-app list, and pause on anything else. Show the list in settings so they can remove apps they added too casually. A one-off exception would fit rare tasks, but I would keep that optional. | Strong fit here | Yes | 5.132 s |

## Human output judgment and rubric correction

The baseline concrete replies beat generic praise and bait. The harder sets test nonsense, a sincere rambling draft and two useful replies. In the final X result, picking a PDF reader once with pause on every other app is more specific than a general allow-list preference; its reason explains avoiding repeated timer babysitting. In Reddit, the strongest reply specifies the work-app list, removal of casually added apps and the optional one-off exception trade-off. The simpler replies are useful but add less detail. Both final orders are `[3,2,1,0]`, with levels `[0,1,2,3]` in original candidate order. Nonsense is bottom, never Good or Strong. These distinctions agree with a careful human reading.

The first harder attempt answered X in 7.718 s, but Reddit timed out at 20.009 s and returned only unsure cards. One retry answered both: X 9.193 s and Reddit 6.003 s. The retry exposed an X ordering failure: the backend selected candidate 3 as best (0.81) but split its level probability between Good (0.39) and Strong (0.54). The 0.6 floor correctly abstained, which put that concrete reply below the simpler Good reply. The floor and rank rules were retained. The rubric was corrected with explicit level anchors: nonsense/praise/bait, vague or rambling, a useful point with limited new detail, and a specific contribution with a mechanism or reason. Final rerun: X **6.517 s**, Reddit **5.132 s**, both correctly ordered with accepted levels. All three earlier returned raw answers are preserved as `preAnchorAttempts` in the JSON; they are not presented as passing final output. This is bounded output evidence, not broad engagement calibration.

## Consent evidence


`FitConsent.test.ts` exercises the real settings guard, judge, response helper
and accounts response transport with a stand-in response fetch. The count
below is content response fetches; the public remote-switch GET remains its
existing separate operation. Rejected cases return rules only (an unflagged
candidate is unsure; the never-say candidate is bottom level).

| State | Response fetches | Result |
| --- | ---: | --- |
| ChatGPT chosen, signed in, visible app, switch on | 1 | Rated |
| Phone-listed app, switch on | 0 | Rules only |
| Switch off | 0 | Rules only |
| Unknown switch | 0 | Rules only |
| Phone chosen | 0 | Rules only |
| Bubble paused | 0 | Rules only |
| Bubble off for this app | 0 | Rules only |
| Signed out | 0 | Rules only |
| Signing out | 0 | Rules only |

Flagged text and question names are absent from the captured emitted prompt
and content request. Long dashes, length and upper-case links are also checked
without calling a backend. Tests cover low-confidence best abstention,
malformed answers, timeout, unsupported platforms, X level drops, stable rank,
backend fallback and cache isolation between taps. Recorded answers replay
through both `resolve()` and `judgeFit()` in `Fit.test.ts` without network calls.


## Runtime corrections and verification

The initial transport probes abstained because a pre-dispatch failure was masked as a veto. Replacing `AbortSignal.throwIfAborted()` with an explicit aborted check allowed the production path to answer; regression coverage uses a signal without that helper. Pre-dispatch failures retain their original cause. Review added bare-domain/Markdown-link flags and common trailing X asks. A further regression proved an earlier “Thoughts?” question must not lower a reply ending with a concrete question; the current bounded rule is documented in the [reply fit judge reference](../mobile/README.md#reply-fit-judge-growth-foundation).

Lint and typecheck passed on the revised rubric. Full Jest passed **53 suites, 939 tests, 46 snapshots**, before adding the two final hard-recording replay cases. The x86_64 corrected-rubric release proof build passed in 1m54s. The final replay suite passed **15 tests**. Its recordings replay through both `resolve()` and `judgeFit()` without network calls, with explicit hard-case ordering/nonsense checks. The proof route is removed from the delivered app. Each emulator session restored the previously installed APK; no sign-out or wipe occurred. Emulator shutdown and lock release are checked after restoration. Panel wiring and UI remain later packages.


## PR notes: bounded request rule and international domains

The current request vocabulary, context exclusions and heuristic limits live
in the [reply fit judge reference](../mobile/README.md#reply-fit-judge-growth-foundation).

Per the approved review disposition, a later finding requesting only another
phrasing should retain its text and return for non-fix disposition with this
bounded-rule reason. Substantive-question false positives and consent or
hard-flag defects still require correction.

Fit.test.ts covers international
links omitted from shared state/questions, equivalent emails remaining
eligible, all previously reported request phrases, comma-containing topics,
labels and rank. These notes are ready for the outer executor's PR description;
this review phase does not publish or modify the PR.

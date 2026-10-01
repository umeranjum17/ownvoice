# F2 fit judge output proof

Two real calls on `ownvoice-signed` / `emulator-5684`, 2026-10-01, through
Ownvoice's signed-in BYOKit accounts transport and the production fit consent
checks. Demo text only; no X or Reddit apps, accounts, posting or phone use.
One decide/answerer call per platform, three candidates each. Timings surround
`judgeFit()` in the temporary route: they include guards and the response, but
exclude app launch. This was a route-driven proof, not a wired bubble journey. The recorded
Raw probability objects and questions are in [live-answers.json](live-answers.json).
Both replies parsed as the requested JSON and answered every question above
the 0.6 floor. These are self-reported probabilities, not calibrated reach.

X post: “Shipping a tiny app every week this year. Week 12: a timer that only counts focused minutes.”

Reddit post: “r/androidapps: I made a timer that counts focused minutes. It pauses when you leave the app. How should I handle reading a PDF in another app? No promotion or vote requests please.”

| Post | Candidate text | Level | Best pick | Call latency |
| --- | --- | --- | --- | --- |
| X: focused-minutes timer | Love this! Keep crushing it! | Likely to be skipped | No | 6.245 s |
| X: focused-minutes timer | Does it pause when you switch apps? That is where my focus timers quietly turn into lunch timers. | Strong fit here | Yes | 6.245 s |
| X: focused-minutes timer | Most productivity apps are a scam. Agree? | Likely to be skipped | No | 6.245 s |
| Reddit: PDF reader pause rule | Great app, thanks for sharing! | Likely to be skipped | No | 3.968 s |
| Reddit: PDF reader pause rule | Let people pick a small list of allowed apps, like their PDF reader. Keep the pause on for everything else so opening a feed still stops the timer. | Strong fit here | Yes | 3.968 s |
| Reddit: PDF reader pause rule | Upvote this if you hate productivity apps! | Likely to be skipped | No | 3.968 s |

Human judgment: the X question names the actual timer behaviour and adds a
natural lunch-timer observation. The Reddit suggestion gives a concrete
allow-list solution while keeping the feed-pause behaviour. Both deserve to
outrank empty praise and bait. Each was the top pick; the other two were at
the bottom level. No rubric correction was needed after this run.

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

## Runtime correction and limits

The first two probes abstained because a pre-dispatch failure was masked as a
veto. Replacing `AbortSignal.throwIfAborted()` with an explicit aborted check
allowed the same production route to answer. A regression test uses a signal
with no helper method through the real accounts transport. Pre-dispatch
failures now retain the original cause and log it in debug builds.

Local lint, typecheck and the full Jest suite passed (53 suites, 935 tests,
46 snapshots), before adding the two recorded-answer replay cases; replay
suite then passed all 11 tests, including both recordings; final lint and
typecheck also passed. The x86_64 release proof build passed.
A temporary app route ran these calls and is removed from the delivery.
The previously installed APK was restored, the emulator stopped, and its
exclusive lock released after recording. No sign-out or data wipe occurred.
This is a two-example output check, not broad engagement calibration. Panel
wiring and UI remain later packages.

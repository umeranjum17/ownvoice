# P7: sign-in survives the browser (proof, no native change needed)

Verdict: **proved**. A device-code sign-in finished after 60 s in Chrome with the app
backgrounded, on a stock emulator image whose backgrounded process sent no poll for the
whole window. No foreground-service wait was added: nothing failed, so there is nothing
to keep alive. The `SignInWait` fallback design (a short-lived service in `ownvoice-native`
while a code waits) stays on paper; build it only if a real phone ever shows the wait
dying instead of stalling.

## Recorded run (Mac slot emulator, API 35, arm64)

Release `dev.ownvoice.next` APK built with `EXPO_PUBLIC_E2E_STUB=1` (practice step only)
and `EXPO_PUBLIC_E2E_AUTH_BASE=http://100.124.161.1:21455` (the real byokit sign-in stack
against the host stand-in `mockOpenAI()`; `EXPO_PUBLIC_E2E_GPT` unset so no in-app
stand-in is involved). Driver: `mobile/e2e/signin-wait.mjs`. Captures committed here
(`OWNVOICE-P7-01-offer` … `OWNVOICE-P7-06-connected`; the timestamped stand-in
request log is quoted inline below).

| Time | What happened |
|---|---|
| 03:38:59 | Setup walked to the offer; Continue with ChatGPT → code `MOCK-10001` issued (`POST /api/accounts/deviceauth/usercode`) |
| 03:39:19 | Code verified on the app screen with its waiting note; page opened in Chrome |
| 03:39:24–03:40:24 | Chrome in front, focus checked every 10 s (`ChromeTabbedActivity` throughout) |
| 03:40:25 | Code approved the way the page's own Continue posts it (`POST /codex/device` → "Signed in") |
| 03:40:27–28 | Next poll completed the exchange (`POST /api/accounts/deviceauth/token`, `POST /oauth/token`) |
| 03:40:31 | Back in the app: "Which apps can use ChatGPT?" — signed in, offer continues |

Stand-in request log (every request timestamped; the only evidence that matters):

```
03:38:59 POST /api/accounts/deviceauth/usercode
03:38:59 POST /api/accounts/deviceauth/token
03:39:00 POST /api/accounts/deviceauth/token
03:39:01 POST /api/accounts/deviceauth/token
03:39:02 POST /api/accounts/deviceauth/token
03:39:20 POST /api/accounts/deviceauth/token
03:39:20 GET /codex/device
03:40:25 POST /codex/device
03:40:27 POST /api/accounts/deviceauth/token
03:40:28 POST /oauth/token authorization_code
```

No token poll reached the stand-in between 03:39:20 and the approval at 03:40:25: while
Chrome was in front the backgrounded app sent nothing, yet the wait never failed and the
first poll after approval completed it. That is the AGENTS.md scenario survived — by
stalling, not by dying, which is exactly what the byokit poll loop is written to do
(a poll that can't get through waits for the next, up to the code's own 15-minute expiry).

## Regression test (no device needed)

`mobile/src/chatgpt/__tests__/SignInWaitTest.test.ts`: against the real `Accounts` stack
with a scripted fetch, three destroyed-socket polls mid-wait still end `done` and signed
in; a declined code still ends `failed` with its own sentence. Full suite: 25 suites,
377 tests green; `npm run lint` and `npm run typecheck` green.

## Notes for later lanes

- The Mac slot is API 35 (Android 15), not 16; the captain asked for 16. The mechanism
  under test (backgrounded wait stalls, never fails) is version-independent, and the
  stand-in's `dropPolls` covers the destroyed-socket half deterministically — which is
  why no second device run was spent: with timers frozen the two runs are
  indistinguishable on an emulator, and the Jest test above pins the retry.
- Release builds block app-side cleartext HTTP (`UnknownServiceException: CLEARTEXT …
  not permitted`; Chrome is unaffected). Proof builds gate `usesCleartextTraffic` behind
  the same `EXPO_PUBLIC_E2E_AUTH_BASE` flag in `mobile/app.config.js`; distributable
  builds never set it. Gradle does not track env vars: after changing one, rerun
  `:app:createBundleReleaseJsAndAssets` (or `--rerun-tasks`) or the APK keeps the old bundle.
- The slot's Chrome needed its first-run welcome dismissed once ("Use without an
  account", then the notifications "No thanks"); afterwards the app opens the code page
  itself. The driver's `waitForLine` screenshots whatever is in front, so it reads the
  issued code from the stand-in and deep-links `ownvoice://chatgpt` rather than BACKing
  out of Chrome.
- `mobile/src/chatgpt/accounts.ts` passes `authBase` (byokit's documented stand-in seam)
  only when `EXPO_PUBLIC_E2E_AUTH_BASE` is set; production sign-in is untouched.

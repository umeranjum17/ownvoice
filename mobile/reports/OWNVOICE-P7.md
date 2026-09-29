# P7: sign-in survives the browser (proof, no native change needed)

Verdict: **proved on Android 16**. A device-code sign-in finished after 60 s in Chrome
with the app backgrounded, on API 36 (pixel_7, x86_64, google_apis). No
foreground-service wait was added: nothing failed, so there is nothing to keep alive.
The `SignInWait` fallback design (a short-lived service in `ownvoice-native` while a
code waits) stays on paper; build it only if a real phone ever shows the wait dying
instead of stalling.

## Recorded run (lane-owned AVD `ovp7api36`, API 36)

Release `dev.ownvoice.next` APK built with `EXPO_PUBLIC_E2E_STUB=1`
and `EXPO_PUBLIC_E2E_AUTH_BASE=http://10.0.2.2:21455` (the real byokit sign-in stack
against the host stand-in `mockOpenAI()`; `EXPO_PUBLIC_E2E_GPT` unset so no in-app
stand-in is involved). Driver: `mobile/e2e/signin-wait.mjs`
(`ANDROID_SERIAL=emulator-5556`, `OWNVOICE_AVD_NAME=ovp7api36`). Captures and both logs
committed here (`OWNVOICE-P7-API36-01-choose` … `OWNVOICE-P7-API36-06-connected`,
`OWNVOICE-P7-API36-signin-run.log`, `OWNVOICE-P7-API36-signin-mock.log`).

| Time | What happened |
|---|---|
| 06:03:05 | Stand-in OpenAI up on the host; fresh install on the booted API 36 AVD |
| 06:03:41 | Setup walked to the ChatGPT choice; Continue with ChatGPT → code `MOCK-10001` issued (`POST /api/accounts/deviceauth/usercode`) |
| 06:03:48 | Code verified on the app screen with its waiting note; page opened in Chrome |
| 06:04:02–06:04:55 | Chrome in front, focus checked every 10 s (`ChromeTabbedActivity` throughout) |
| 06:04:56 | Code approved the way the page's own Continue posts it (`POST /codex/device` → "Signed in") |
| 06:04:59 | Next poll completed the exchange (`POST /api/accounts/deviceauth/token`, `POST /oauth/token`) |
| 06:05:04 | Back in the app: "ChatGPT is connected" — signed in, setup continues |

Stand-in request log (every request timestamped; the only evidence that matters):

```
06:03:41 POST /api/accounts/deviceauth/usercode
06:03:41 POST /api/accounts/deviceauth/token
06:03:48 POST /api/accounts/deviceauth/token
06:04:56 POST /codex/device
06:04:59 POST /api/accounts/deviceauth/token
06:04:59 POST /oauth/token authorization_code
```

No token poll reached the stand-in between 06:03:48 and the approval at 06:04:56: while
Chrome was in front the backgrounded app sent nothing for over a minute, yet the wait
never failed and the first poll after approval completed it. That is the AGENTS.md
scenario survived — by stalling, not by dying, which is exactly what the byokit poll
loop is written to do (a poll that can't get through waits for the next, up to the
code's own 15-minute expiry).

## Supporting run (Mac slot emulator, API 35, arm64)

The earlier API 35 run showed the same signature (no poll during the 60 s browser
window, completion on the first poll after approval) and is kept as supporting
evidence; its captures (`OWNVOICE-P7-01-offer` … `OWNVOICE-P7-06-connected`) show the
pre-P5 offer flow. `OWNVOICE-P7-05-page-signed-in.png` is gone: it was byte-identical
to `04-browser-end` (the approval bypasses the page UI, so that snap could never show
a signed-in page), and the driver no longer takes it.

## Regression test (no device needed)

`mobile/src/chatgpt/__tests__/SignInWaitTest.test.ts`: against the real `Accounts` stack
with a scripted fetch, three destroyed-socket polls mid-wait still end `done` and signed
in; a declined code still ends `failed` with its own sentence. Full suite: 25 suites,
377 tests green; `npm run lint` and `npm run typecheck` green.

## Notes for later lanes

- A fresh AVD's Chrome needs its first-run welcome dismissed once ("Use without an
  account", then the notifications "No thanks"); afterwards the driver opens the code
  page itself.
- Proof builds gate `usesCleartextTraffic` behind `EXPO_PUBLIC_E2E_AUTH_BASE` in
  `mobile/app.config.js`, and that manifest value is baked at **prebuild** time: rerun
  `npx expo prebuild` with the flag set, not just the Gradle build, or the APK keeps
  cleartext off and sign-in fails with "Couldn't reach ChatGPT". Gradle does not track
  env vars either: after changing one, rerun `:app:createBundleReleaseJsAndAssets`
  (or `--rerun-tasks`) or the APK keeps the old bundle.
- `mobile/src/chatgpt/accounts.ts` passes `authBase` (byokit's documented stand-in seam)
  only when `EXPO_PUBLIC_E2E_AUTH_BASE` is set; production sign-in is untouched. All
  `EXPO_PUBLIC_*` flags, this one included, are in Metro's `cacheVersion`
  (`mobile/metro.config.js`); `sh e2e/flag-cache.sh` proves a normal export after a
  flagged one carries no stub code.

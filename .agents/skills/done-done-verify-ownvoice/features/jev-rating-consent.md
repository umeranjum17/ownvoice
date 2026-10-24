# Opt-in Jev ratings (Android)

Source: `mobile/app/ratings.tsx`, `mobile/src/chatgpt/settings.ts`,
`mobile/src/chatgpt/accounts.ts`. Host CLI proof alone does not qualify this screen.

## Drive

1. Finish host checks first: from `mobile`, run `npm run typecheck`, `npm run lint`
   and `npm test -- --ci`. `FitConsent.test.ts` drives the real BYOKit `typesafe`
   account with synthetic secure storage and HTTP answers: default off, all four
   writer routes when off, opt-in, withdrawal, disconnection, privacy vetoes and
   refused/limited/unavailable Jev responses. No actual Jev call is made.
2. Use an owned 1080x2400 x86_64 emulator, through the memory gate, one lane at a
   time. Build per `mobile/README.md` with `EXPO_PUBLIC_E2E_STUB=1`,
   `EXPO_PUBLIC_E2E_GPT=1`, `EXPO_PUBLIC_E2E_AUTH_BASE=http://10.0.2.2:21455` and
   `EXPO_PUBLIC_E2E_JEV_BASE=http://10.0.2.2:18612`. Do not embed a Jev key.
   These are proof-only flags, never a distributable build. No local model runs.
3. Install and run `ANDROID_SERIAL=emulator-NNNN OWNVOICE_AVD_NAME=<owned>
   node mobile/e2e/first-run.mjs <apk> <setup-output>` from the repository root.
   This uses the app's existing offline ChatGPT session and fixed-draft seam;
   no real sign-in, paid writer, send or post occurs.
4. Run `ANDROID_SERIAL=emulator-NNNN OWNVOICE_AVD_NAME=<owned> JAVA_HOME=<jdk>
   node mobile/e2e/own-post-fit.mjs <apk> <capture-output>`. The driver captures
   the new Home row and **Ratings with Jev** in light and dark. It must begin off
   and disconnected, show Jev/TypeSafe, the post/drafts/writing examples sent, and
   per-use billing outside the writing plan. It pastes `fixture-jev-key` into the
   real key field and presses **Agree and connect Jev**. Saving the key must leave
   ratings off. Then it turns **Use Jev for ratings** on.
5. The driver opens native X and Reddit lab composers, writes Umer's demo posts,
   and taps the bubble. The fixed-answer Jev HTTP fixture refuses any request
   that lacks the synthetic BYOKit key. Result cards show fit levels, then the
   driver turns Jev off and disconnects it in each theme. It captures all those
   result screens plus one `jev-consent.mp4` of connection and opting in.
6. Inspect every retained PNG. The complete consent/cost text and switch must be
   readable without overlap or clipping. Confirm no secret is visible. Keep
   `steps.json` with a non-empty result and the request record beside the shots.
   Use a published base APK on the same owned emulator for before Home captures;
   the ratings screen is new, so there is no before version of that screen.

## Evidence and limits

Cite real-screen PNGs (`home-*-after.png`, `jev-*-after.png`, `x-post-*-after.png`
for example), never text rendered as an image. Preserve the recording and request
log but do not cite them as screenshots. Bind captures and installed APK hash to
final committed HEAD. Seal them through a successful `done-done run -- <copy>`
in done-done's default evidence root, with the copy step disclosed.

The generation and Jev answers are fixtures. This proves the UI, separate saved
BYOKit account, opt-in routing and rating presentation, not real Jev quality,
pricing amounts, reach, real provider sign-in or the layout of signed-in social
apps. A phone writer or phone-only app still sends no drafts to Jev. Stop the
owned emulator and remove its scratch when finished.

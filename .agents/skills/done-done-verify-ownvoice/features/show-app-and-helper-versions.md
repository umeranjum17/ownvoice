# Show app and helper versions

Target: Ownvoice Android app, Home and About.

Drive a fresh install on a task-owned emulator. Switching the accessibility service on before the launch makes the app open Home instead of setup. On Home, scroll to the bottom: the footer names the version once, with one marker — **1.0.10-dev** on a build that is not a tagged release, the plain **1.0.10** on a tagged one — and no second pre-release marker after it. Open About with the app's own `ownvoice://about` route and check its app version, build number, and release status. If testing a paired helper, pair it through Home → **Use my computer** first; About should show the helper's reported version and explain when the two versions differ.

Capture Home's footer and About at 360, 390 and 445 dp in light and dark, with 1.3 system font scale; add 1280×800 light/dark captures when the app is tested in a large-screen window. Check the real screenshots for readable text, clipping, overlap and exactly one version marker. The app version comes from the installed build, not from a typed-in expected label.

`node mobile/e2e/version-label.mjs <apk> <out-dir>` with `ANDROID_SERIAL` and `OWNVOICE_AVD_NAME` set (or the `app-version-label` journey) captures and checks the footer at 360, 390 and 445 dp in light and dark, and fails on a missing `-dev` marker or a second one.

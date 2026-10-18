#!/bin/sh
# Regression for the silent no-writer APK: llama.rn's native libraries come from its
# postinstall download, and its CMake step skips a missing set without failing, so the APK
# installs but the phone writer fails at once ("Something went wrong" in the rewrite sheet).
# Proves the Android build stops before compiling when they are missing, and runs when present.
# Run from mobile/ after npm ci: sh e2e/native-libs.sh. Emulator-free; needs JDK 17 and the Android SDK.
set -eu
cd "$(dirname "$0")/.."
LIBS=node_modules/llama.rn/android/src/main/jniLibs
[ -f "$LIBS/arm64-v8a/librnllama.so" ] || { echo "FAIL: $LIBS missing before the check; run npm ci"; exit 1; }
EXPO_NO_TELEMETRY=1 npx expo prebuild --platform android --no-install >/dev/null
gradle() { (cd android && ./gradlew -q --no-daemon :app:preBuild "$@"); }

gradle || { echo "FAIL: preBuild fails with the native libraries present"; exit 1; }
mv "$LIBS" "$LIBS.native-libs.bak"
trap 'mv "$LIBS.native-libs.bak" "$LIBS"' EXIT
if gradle >.native-libs.log 2>&1; then echo "FAIL: preBuild passed without the native libraries"; rm -f .native-libs.log; exit 1; fi
grep -q 'Missing llama.rn native libraries' .native-libs.log || { tail -20 .native-libs.log; rm -f .native-libs.log; echo "FAIL: preBuild failed for another reason"; exit 1; }
rm -f .native-libs.log
echo "PASS: the Android build stops without llama.rn's native libraries and runs with them"

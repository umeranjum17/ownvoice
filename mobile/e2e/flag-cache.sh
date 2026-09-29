#!/bin/sh
# Regression for the Metro transform-cache flag hazard (ov-phone-agent-plan §5):
# Metro's transform cache is not keyed on EXPO_PUBLIC_* values, so a normal export
# made after a flagged export reuses the flagged code. metro.config.js puts the flags
# in cacheVersion; this script proves a normal export after a stub export matches a
# clean export, and (mutation check) that removing cacheVersion brings the hazard back.
# Run from mobile/: sh e2e/flag-cache.sh. Emulator-free, network-free.
set -eu
cd "$(dirname "$0")/.."

MARK='bring the stove' # fixed stub draft: stubWriter.ts always bundles one copy, phoneWriter.ts only when a stale flagged transform is reused
count() { grep -o "$MARK" "$1"/_expo/static/js/android/*.js | wc -l; }

LAB=.lab-flag-cache
export HOME="$PWD/$LAB/home" npm_config_cache="$PWD/$LAB/home/npm" EXPO_NO_TELEMETRY=1
mkdir -p "$HOME"
cp metro.config.js "metro.config.js.flag-cache.bak"
restore() { mv "metro.config.js.flag-cache.bak" metro.config.js; rm -rf "$LAB"; }
trap restore EXIT

export_dir() { # export_dir <name> <stub 0|1> [extra expo args...]
  name=$1; stub=$2; shift 2
  if [ "$stub" = 1 ]; then
    EXPO_PUBLIC_E2E_STUB=1 npx expo export --platform android --output-dir "$LAB/$name" --no-bytecode "$@" >"$LAB/$name.log" 2>&1 || { tail -5 "$LAB/$name.log"; return 1; }
  else
    npx expo export --platform android --output-dir "$LAB/$name" --no-bytecode "$@" >"$LAB/$name.log" 2>&1 || { tail -5 "$LAB/$name.log"; return 1; }
  fi
}

fail() { echo "flag-cache: FAIL: $1" >&2; exit 1; }

export_dir clean 0 --clear
CLEAN=$(count "$LAB/clean")
[ "$CLEAN" -ge 1 ] || fail "marker '$MARK' absent even from a clean export; the check is blind"

export_dir stub 1 --clear
export_dir plain 0 # no --clear: must not reuse the stub export's transforms
NOW=$(count "$LAB/plain")
[ "$NOW" -eq "$CLEAN" ] || fail "normal export after a stub export has $NOW copies vs clean $CLEAN — stale flagged transform reused; is cacheVersion set in metro.config.js?"

# Mutation check: prove the regression has teeth by removing the fix.
sed '/config.cacheVersion/d' metro.config.js >"$LAB/mutated.js" && mv "$LAB/mutated.js" metro.config.js
export_dir mutated-stub 1 --clear
export_dir mutated-plain 0
MUT=$(count "$LAB/mutated-plain")
[ "$MUT" -ne "$CLEAN" ] || fail "mutation check: with cacheVersion removed the export still matched clean — this test would not catch the regression"

echo "flag-cache: OK (clean=$CLEAN after-fix=$NOW mutated=$MUT)"

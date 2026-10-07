#!/bin/sh
# Regression for the Metro transform-cache flag hazard (ov-phone-agent-plan §5):
# Metro's transform cache is not keyed on EXPO_PUBLIC_* values, so a normal export
# made after a flagged export reuses the flagged code. metro.config.js puts the flags
# in cacheVersion; this script proves a normal export after a stub export matches a
# clean export, and (mutation check) that removing cacheVersion brings the hazard back.
# It also proves the phone-agent lab screen (EXPO_PUBLIC_PHONE_AGENT=1) stays out of normal bundles,
# even one exported right after a lab export; app/agent.tsx then only redirects ownvoice://agent Home.
# Run from mobile/: sh e2e/flag-cache.sh. Emulator-free, network-free.
set -eu
cd "$(dirname "$0")/.."

MARK='bring the stove' # fixed stub draft: stubWriter.ts always bundles one copy, phoneWriter.ts only when a stale flagged transform is reused
count() { grep -o "$MARK" "$1"/_expo/static/js/android/*.js | wc -l; }
LAB_MARK='phone-agent-lab' # src/agent/Screen.tsx's testID: only a lab bundle carries the screen
lab() { grep -o "$LAB_MARK" "$1"/_expo/static/js/android/*.js | wc -l; }
DEMO_MARK='demo_maker_example' # demoStubs.ts fixture handle: only a demo-flagged bundle carries the demo drafts
demo() { grep -o "$DEMO_MARK" "$1"/_expo/static/js/android/*.js | wc -l; }

LAB=.lab-flag-cache
export HOME="$PWD/$LAB/home" npm_config_cache="$PWD/$LAB/home/npm" EXPO_NO_TELEMETRY=1
mkdir -p "$HOME"
cp metro.config.js "metro.config.js.flag-cache.bak"
restore() { mv "metro.config.js.flag-cache.bak" metro.config.js; rm -rf "$LAB"; }
trap restore EXIT

export_dir() { # export_dir <name> <flags, e.g. EXPO_PUBLIC_E2E_STUB=1, or ""> [extra expo args...]
  name=$1; flags=$2; shift 2
  env $flags npx expo export --platform android --output-dir "$LAB/$name" --no-bytecode "$@" >"$LAB/$name.log" 2>&1 || { tail -5 "$LAB/$name.log"; return 1; }
}

fail() { echo "flag-cache: FAIL: $1" >&2; exit 1; }

export_dir clean "" --clear
CLEAN=$(count "$LAB/clean")
[ "$CLEAN" -ge 1 ] || fail "marker '$MARK' absent even from a clean export; the check is blind"
[ "$(lab "$LAB/clean")" -eq 0 ] || fail "a normal export carries the phone-agent lab screen"
[ "$(demo "$LAB/clean")" -eq 0 ] || fail "a normal export carries the grow-demo drafts"

export_dir agent EXPO_PUBLIC_PHONE_AGENT=1 --clear
[ "$(lab "$LAB/agent")" -ge 1 ] || fail "marker '$LAB_MARK' absent from a lab export; the check is blind"
export_dir after-agent "" # no --clear: must not reuse the lab export's transforms
AFTER=$(lab "$LAB/after-agent")
[ "$AFTER" -eq 0 ] || fail "normal export after a lab export carries the lab screen ($AFTER copies)"

export_dir stub EXPO_PUBLIC_E2E_STUB=1 --clear
export_dir plain "" # no --clear: must not reuse the stub export's transforms
NOW=$(count "$LAB/plain")
[ "$NOW" -eq "$CLEAN" ] || fail "normal export after a stub export has $NOW copies vs clean $CLEAN — stale flagged transform reused; is cacheVersion set in metro.config.js?"

# Mutation check: prove the regression has teeth by removing the fix.
# Demo-flagged exports carry the fixture drafts; a normal export right after must not reuse them.
export_dir demo "EXPO_PUBLIC_E2E_STUB=1 EXPO_PUBLIC_DEMO_PLATFORM=1" --clear
[ "$(demo "$LAB/demo")" -ge 1 ] || fail "marker '$DEMO_MARK' absent from a demo export; the check is blind"
export_dir after-demo "" # no --clear: must not reuse the demo export's transforms
[ "$(demo "$LAB/after-demo")" -eq 0 ] || fail "normal export after a demo export carries the demo drafts — stale flagged transform reused; is EXPO_PUBLIC_DEMO_PLATFORM in metro.config.js cacheVersion?"
sed '/config.cacheVersion/d' metro.config.js >"$LAB/mutated.js" && mv "$LAB/mutated.js" metro.config.js
export_dir mutated-stub EXPO_PUBLIC_E2E_STUB=1 --clear
export_dir mutated-plain ""
MUT=$(count "$LAB/mutated-plain")
[ "$MUT" -ne "$CLEAN" ] || fail "mutation check: with cacheVersion removed the export still matched clean — this test would not catch the regression"

echo "flag-cache: OK (clean=$CLEAN after-fix=$NOW mutated=$MUT; lab screen in normal exports: 0, after a lab export: $AFTER)"

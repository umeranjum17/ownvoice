#!/usr/bin/env bash
# Review-evidence capture for Ownvoice (fleet standard). Run from the repo root.
# Everything lands in verify-artifacts/<task>/ — one stable folder per task,
# reused across runs (before and after side by side), gitignored, never committed.
#
#   evidence.sh theme <light|dark>                              flip the emulator theme (verified)
#   evidence.sh shot <task> <screen> <label> <theme>            one host-side screenshot
#   evidence.sh pair <task> <screen> <label> -- <launch cmd…>   the matrix in one call:
#                                                               force-stop, theme, launch, settle, shot × (light, dark)
#   evidence.sh motion-start <task> <interaction>               begin an mp4 recording
#   evidence.sh motion-stop                                     finalize and pull it
#
# Screenshots and recordings never write device storage (/sdcard/Download is EACCES on
# real phones): captures stream host-side via adb exec-out, recordings via /data/local/tmp.
# Keep recorded takes ≥ 3 s — screenrecord needs a moment to write frames.
# Controls on the translucent sheets swallow `input tap` — drive them with
# `adb shell input keyevent 19/20/21/22` + `keyevent 66` (DPAD + ENTER), not taps.
set -euo pipefail

ADB=(adb)
[ -n "${ANDROID_SERIAL:-}" ] && ADB=(adb -s "$ANDROID_SERIAL")
PKG=dev.ownvoice.next
SETTLE=${OWNVOICE_EVIDENCE_SETTLE:-5}   # ponytail: fixed settle, no idle signal; raise for slow cold starts
REC_LIMIT=180                            # Android screenrecord cap; restart the recording for longer takes

theme() {
  local mode want
  case "$1" in
    dark) mode=yes; want=true ;;
    light) mode=no; want=false ;;
    *) echo "usage: evidence.sh theme light|dark" >&2; exit 2 ;;
  esac
  # Same sequence as mobile/e2e/first-run.mjs: kill the twilight schedule, flip, verify.
  "${ADB[@]}" shell settings put secure ui_night_mode_custom_type -1
  "${ADB[@]}" shell cmd uimode night "$mode"
  "${ADB[@]}" shell dumpsys uimode | tr -d '\r' | grep -q "mComputedNightMode=$want" \
    || { echo "theme flip to $1 failed" >&2; exit 1; }
}

shot() { # <task> <screen> <label> <theme> -> verify-artifacts/<task>/<screen>-<label>-<theme>.png
  [ $# -eq 4 ] || { echo "usage: evidence.sh shot <task> <screen> <label> <light|dark>" >&2; exit 2; }
  local out="verify-artifacts/$1/$2-$3-$4.png"
  mkdir -p "verify-artifacts/$1"
  "${ADB[@]}" exec-out screencap -p > "$out"
  head -c 8 "$out" | grep -q PNG || { echo "capture is not a PNG: $out" >&2; exit 1; }
  echo "$out"
}

pair() { # <task> <screen> <label> -- <launch cmd…>
  [ $# -ge 5 ] || { echo "usage: evidence.sh pair <task> <screen> <label> -- <launch cmd…>" >&2; exit 2; }
  local task=$1 screen=$2 label=$3
  shift 4
  local t
  for t in light dark; do
    "${ADB[@]}" shell am force-stop "$PKG"   # RN reads the colour scheme at process start
    theme "$t"
    "$@" >/dev/null
    sleep "$SETTLE"
    shot "$task" "$screen" "$label" "$t"
  done
}

case "${1:-}" in
  theme)
    [ $# -eq 2 ] || { echo "usage: evidence.sh theme light|dark" >&2; exit 2; }
    theme "$2" ;;
  shot)
    shift
    shot "$@" ;;
  pair)
    shift
    pair "$@" ;;
  motion-start)
    [ $# -eq 3 ] || { echo "usage: evidence.sh motion-start <task> <interaction>" >&2; exit 2; }
    dir="verify-artifacts/$2"; out="$dir/$3.mp4"; pidf="$dir/.motion.pid"; outf="$dir/.motion.out"
    [ -e "$pidf" ] && { echo "a recording is already running (pid $(cat "$pidf"))" >&2; exit 1; }
    mkdir -p "$dir"
    "${ADB[@]}" shell rm -f /data/local/tmp/ov-motion.mp4
    "${ADB[@]}" shell screenrecord --time-limit "$REC_LIMIT" /data/local/tmp/ov-motion.mp4 >"$dir/.motion-recorder.log" 2>&1 &
    echo $! > "$pidf"; printf '%s' "$out" > "$outf"
    echo "recording to $out (cap ${REC_LIMIT}s — motion-stop when the interaction is done)" ;;
  motion-stop)
    dirpid=$(ls verify-artifacts/*/.motion.pid 2>/dev/null | head -1 || true)
    [ -n "$dirpid" ] || { echo "no recording running" >&2; exit 1; }
    dir=$(dirname "$dirpid"); pid=$(cat "$dirpid"); out=$(cat "$dir/.motion.out")
    kill -TERM "$pid" 2>/dev/null || true   # TERM through the adb client finalizes the device-side mp4
    for _ in $(seq 1 40); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
    kill -0 "$pid" 2>/dev/null && { echo "recorder did not stop; retry motion-stop" >&2; exit 1; }
    for _ in $(seq 1 20); do   # wait for the device-side recorder to finalize (~1 s)
      n=$("${ADB[@]}" shell 'pgrep -c screenrecord || true' | tr -d '\r')
      [ "${n:-0}" = 0 ] && break
      sleep 0.25
    done
    "${ADB[@]}" pull /data/local/tmp/ov-motion.mp4 "$out" >/dev/null
    "${ADB[@]}" shell rm -f /data/local/tmp/ov-motion.mp4
    rm -f "$dirpid" "$dir/.motion.out"
    [ -s "$out" ] || { echo "empty recording: $out" >&2; exit 1; }
    if command -v ffprobe >/dev/null; then
      ffprobe -v error -show_entries format=duration -of csv=p=0 "$out" >/dev/null \
        || { echo "recording is not a valid mp4 (truncated?): $out — rerun with a shorter take" >&2; exit 1; }
    fi
    echo "$out" ;;
  *)
    sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//' >&2
    exit 2 ;;
esac

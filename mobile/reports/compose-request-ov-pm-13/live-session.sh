#!/bin/bash
set -euo pipefail
root=/home/umer/lab-tmp/ov-pm-13
serial=emulator-5684
pkg=dev.ownvoice.next
exec 8>/tmp/fm-ownvoice-emu.lock
flock 8
exec 9>/tmp/fm-ownvoice-signed.lock
flock 9
available=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
if ((available < 15728640)); then echo "Insufficient memory before boot: $available KiB"; exit 72; fi
# Previous owner may release its shell locks just before emulator shutdown finishes.
# Wait at most two minutes; never kill or take over that owner.
previous_present() {
 adb devices | awk '{print $1}' | rg -q "^$serial$" && return 0
 pgrep -f '[q]emu-system.*-avd ownvoice-signed -port 5684' >/dev/null
}
for grace in $(seq 1 60); do
 if ! previous_present; then break; fi
 if [ "$grace" = 1 ]; then echo 'Both locks acquired; waiting bounded previous-owner shutdown grace'; fi
 sleep 2
done
if previous_present; then echo 'Retained emulator still present after 120s shutdown grace; refusing takeover'; exit 73; fi
available=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
if ((available < 15728640)); then echo "Insufficient memory immediately before boot: $available KiB"; exit 72; fi
export ANDROID_AVD_HOME=/home/umer/.local/share/ownvoice-test/avd
export ANDROID_EMULATOR_HOME=/home/umer/.android
export TMPDIR=$root/tmp
emulator -avd ownvoice-signed -port 5684 -no-window -no-audio -gpu swiftshader_indirect -no-snapshot-load -no-snapshot-save > "$root/emulator.log" 2>&1 &
emu_pid=$!
installed=0
cleanup() {
 set +e
 if ((installed)); then
  flock /tmp/fm-ownvoice-heavy.lock adb -s "$serial" install -r "$root/prior-signed.apk" > "$root/restore.log" 2>&1
  echo $? > "$root/restore.exit"
  if [ -f "$root/prior-services.txt" ] && rg -q 'dev.ownvoice.next' "$root/prior-services.txt"; then
   adb -s "$serial" shell settings put secure enabled_accessibility_services ''
   adb -s "$serial" shell settings put secure enabled_accessibility_services "$(cat "$root/prior-services.txt")"
   adb -s "$serial" shell settings put secure accessibility_enabled "$(cat "$root/prior-accessibility.txt")"
  fi
 fi
 adb -s "$serial" emu kill >> "$root/emulator-stop.log" 2>&1
 wait "$emu_pid"
}
trap cleanup EXIT
printf '%s\n' "$available" > "$root/boot-memory-kib.txt"
timeout 90 adb -s "$serial" wait-for-device
for attempt in $(seq 1 120); do
 if [ "$(adb -s "$serial" shell getprop sys.boot_completed | tr -d '\r')" = 1 ]; then break; fi
 sleep 2
done
avd=$(adb -s "$serial" emu avd name | head -1 | tr -d '\r')
[ "$avd" = ownvoice-signed ]
prior=$(adb -s "$serial" shell pm path "$pkg" | head -1 | sed 's/^package://' | tr -d '\r')
[ -n "$prior" ]
adb -s "$serial" pull "$prior" "$root/prior-signed.apk"
sha256sum "$root/prior-signed.apk" > "$root/prior-signed.sha256"
adb -s "$serial" shell settings get secure enabled_accessibility_services | tr -d '\r' > "$root/prior-services.txt"
adb -s "$serial" shell settings get secure accessibility_enabled | tr -d '\r' > "$root/prior-accessibility.txt"
flock /tmp/fm-ownvoice-heavy.lock adb -s "$serial" install -r "$root/lab-release.apk"
installed=1
for mode in loop script; do
 for task in $(seq 1 6); do
  node "$root/run-task.mjs" "$mode" "$task" > "$root/$mode-$task.log" 2>&1
  adb -s "$serial" logcat -d -s ReactNativeJS:I | rg 'A5GUARD ' > "$root/captures/$mode-$task/guards.txt"
 done
done

flock /tmp/fm-ownvoice-heavy.lock adb -s "$serial" install -r "$root/unflagged-release.apk"
pid=$(adb -s "$serial" shell pidof "$pkg" || true)
if [ -n "$pid" ]; then adb -s "$serial" shell su 0 kill -9 $pid; fi
adb -s "$serial" shell am start -a android.intent.action.VIEW -d 'ownvoice://agent'
sleep 4
adb -s "$serial" shell screencap -p /sdcard/ov-pm-13-unflagged.png
adb -s "$serial" pull /sdcard/ov-pm-13-unflagged.png "$root/unflagged-gating.png"

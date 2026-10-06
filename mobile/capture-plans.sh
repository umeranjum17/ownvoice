#!/bin/bash
set -e

SERIAL="${ANDROID_SERIAL:-$1}"
if [ -z "$SERIAL" ]; then
  echo "Error: No device serial specified"
  exit 1
fi

APK="/home/umer/.treehouse/ownvoice-92cfa5/2/ownvoice/mobile/android/app/build/outputs/apk/release/app-release.apk"
PKG="dev.ownvoice.next"
EVIDENCE="/home/umer/.treehouse/firstmate-8bf1b0/4/firstmate/data/ov-byokit-plan-offering/evidence"

echo "==> Capturing plan screens on device $SERIAL"

# Clean install
adb -s "$SERIAL" shell am force-stop "$PKG" 2>/dev/null || true
adb -s "$SERIAL" uninstall "$PKG" 2>/dev/null || true
adb -s "$SERIAL" install -r "$APK"
sleep 6
adb -s "$SERIAL" shell input tap 540 1833  # OnePlus Continue
sleep 2

# Enable service
CURRENT=$(adb -s "$SERIAL" shell settings get secure enabled_accessibility_services 2>/dev/null | tr -d '\r' || echo "")
if [ -n "$CURRENT" ] && [ "$CURRENT" != "null" ]; then
  adb -s "$SERIAL" shell settings put secure enabled_accessibility_services ""
  sleep 1
  adb -s "$SERIAL" shell settings put secure enabled_accessibility_services "$CURRENT"
else
  adb -s "$SERIAL" shell settings put secure enabled_accessibility_services "dev.ownvoice.next/dev.ownvoice.bridge.OwnvoiceService"
fi
adb -s "$SERIAL" shell settings put secure accessibility_enabled 1

# Launch in light mode
echo "==> Launching in light mode"
adb -s "$SERIAL" shell cmd uimode night no
sleep 1
adb -s "$SERIAL" shell am start -W -n "$PKG/.MainActivity"  # -W waits for launch
sleep 5

# Check if we're on welcome screen by looking for "Continue" button
# Skip welcome if present
adb -s "$SERIAL" shell input tap 540 2100
sleep 4

# Now should be on CHOOSE screen
# Verify by checking window
WINDOW=$(adb -s "$SERIAL" shell dumpsys window | grep -i "mCurrentFocus")
echo "Current window: $WINDOW"

# Take screenshot
echo "==> Capturing CHOOSE screen - light mode"
adb -s "$SERIAL" shell screencap -p /sdcard/choose-light-new.png
adb -s "$SERIAL" pull /sdcard/choose-light-new.png "$EVIDENCE/choose-light-new.png"
adb -s "$SERIAL" shell rm /sdcard/choose-light-new.png

# Switch to dark mode
echo "==> Switching to dark mode"
adb -s "$SERIAL" shell cmd uimode night yes
sleep 2

# Restart app to reload theme
adb -s "$SERIAL" shell am force-stop "$PKG"
sleep 1
if [ -n "$CURRENT" ] && [ "$CURRENT" != "null" ]; then
  adb -s "$SERIAL" shell settings put secure enabled_accessibility_services ""
  sleep 1
  adb -s "$SERIAL" shell settings put secure enabled_accessibility_services "$CURRENT"
else
  adb -s "$SERIAL" shell settings put secure enabled_accessibility_services "dev.ownvoice.next/dev.ownvoice.bridge.OwnvoiceService"
fi
adb -s "$SERIAL" shell settings put secure accessibility_enabled 1

adb -s "$SERIAL" shell am start -W -n "$PKG/.MainActivity"
sleep 5
adb -s "$SERIAL" shell input tap 540 2100  # Skip welcome
sleep 4

# Verify window again
WINDOW=$(adb -s "$SERIAL" shell dumpsys window | grep -i "mCurrentFocus")
echo "Current window: $WINDOW"

echo "==> Capturing CHOOSE screen - dark mode"
adb -s "$SERIAL" shell screencap -p /sdcard/choose-dark-new.png
adb -s "$SERIAL" pull /sdcard/choose-dark-new.png "$EVIDENCE/choose-dark-new.png"
adb -s "$SERIAL" shell rm /sdcard/choose-dark-new.png

# Verify pixel difference
echo "==> Verifying captures are different"
DIFF=$(cmp "$EVIDENCE/choose-light-new.png" "$EVIDENCE/choose-dark-new.png" 2>&1 || echo "differ")
if echo "$DIFF" | grep -q "differ"; then
  echo "✓ Light and dark captures differ (different themes)"
else
  echo "✗ WARNING: Captures are identical"
fi

echo "==> Evidence captured:"
ls -lh "$EVIDENCE"/*.png

# Clean up
adb -s "$SERIAL" shell cmd uimode night no
adb -s "$SERIAL" shell am force-stop "$PKG"
adb -s "$SERIAL" uninstall "$PKG"

echo "==> Done!"

#!/bin/bash
set -e

SERIAL="${ANDROID_SERIAL:-$1}"
if [ -z "$SERIAL" ]; then
  echo "Error: No device serial"
  exit 1
fi

APK="/home/umer/.treehouse/ownvoice-92cfa5/2/ownvoice/mobile/android/app/build/outputs/apk/release/app-release.apk"
PKG="dev.ownvoice.next"
ACTIVITY="dev.ownvoice.next.MainActivity"
EVIDENCE="/home/umer/.treehouse/firstmate-8bf1b0/4/firstmate/data/ov-byokit-plan-offering/evidence"

echo "==> Corrected capture on $SERIAL"

# Clean install
adb -s "$SERIAL" shell am force-stop "$PKG" 2>/dev/null || true
adb -s "$SERIAL" uninstall "$PKG" 2>/dev/null || true
adb -s "$SERIAL" install -r "$APK"
sleep 6
adb -s "$SERIAL" shell input tap 540 1833  # OnePlus
sleep 3

# Enable service
adb -s "$SERIAL" shell settings put secure enabled_accessibility_services "$PKG/dev.ownvoice.bridge.OwnvoiceService"
adb -s "$SERIAL" shell settings put secure accessibility_enabled 1
sleep 2

# === LIGHT MODE ===
echo "==> Light mode"
adb -s "$SERIAL" shell cmd uimode night no
sleep 2

# Launch with correct activity path
echo "==> Launching: $PKG/$ACTIVITY"
adb -s "$SERIAL" shell am start -S -W -n "$PKG/$ACTIVITY"
sleep 10

# Verify app is in foreground
echo "==> Checking window focus..."
FOCUS=$(adb -s "$SERIAL" shell dumpsys window | grep mCurrentFocus)
echo "Focus: $FOCUS"

if ! echo "$FOCUS" | grep -q "$PKG"; then
  echo "✗ ERROR: App not in foreground!"
  echo "Focused window: $FOCUS"
  exit 1
fi
echo "✓ App is in foreground"

# Tap Continue
echo "==> Tapping Continue"
sleep 3
adb -s "$SERIAL" shell input tap 540 2100
sleep 8

# Verify we're still focused and have UI text
echo "==> Verifying screen after navigation..."
FOCUS=$(adb -s "$SERIAL" shell dumpsys window | grep mCurrentFocus)
echo "Focus: $FOCUS"

adb -s "$SERIAL" shell uiautomator dump /sdcard/ui-check.xml 2>/dev/null
TEXT_COUNT=$(adb -s "$SERIAL" shell cat /sdcard/ui-check.xml | grep -o 'text="[^"]*"' | grep -v 'text=""' | wc -l)
echo "UI text fields found: $TEXT_COUNT"

if [ "$TEXT_COUNT" -lt 5 ]; then
  echo "✗ ERROR: No UI text found (app not rendering or not focused)"
  exit 1
fi
echo "✓ UI is rendering"

# Capture
echo "==> Capturing chooser (light)"
adb -s "$SERIAL" shell screencap -p /sdcard/final-light.png
adb -s "$SERIAL" pull /sdcard/final-light.png "$EVIDENCE/final-light.png"
adb -s "$SERIAL" shell rm /sdcard/final-light.png

# === DARK MODE ===
echo ""
echo "==> Dark mode"
adb -s "$SERIAL" shell cmd uimode night yes
sleep 2

# Restart
adb -s "$SERIAL" shell am force-stop "$PKG"
sleep 2
adb -s "$SERIAL" shell settings put secure enabled_accessibility_services "$PKG/dev.ownvoice.bridge.OwnvoiceService"
adb -s "$SERIAL" shell settings put secure accessibility_enabled 1
sleep 2

echo "==> Launching: $PKG/$ACTIVITY"
adb -s "$SERIAL" shell am start -S -W -n "$PKG/$ACTIVITY"
sleep 10

# Verify focus
FOCUS=$(adb -s "$SERIAL" shell dumpsys window | grep mCurrentFocus)
echo "Focus: $FOCUS"

if ! echo "$FOCUS" | grep -q "$PKG"; then
  echo "✗ ERROR: App not in foreground (dark)!"
  exit 1
fi
echo "✓ App is in foreground (dark)"

# Navigate
echo "==> Tapping Continue"
sleep 3
adb -s "$SERIAL" shell input tap 540 2100
sleep 8

# Verify UI
adb -s "$SERIAL" shell uiautomator dump /sdcard/ui-check-dark.xml 2>/dev/null
TEXT_COUNT=$(adb -s "$SERIAL" shell cat /sdcard/ui-check-dark.xml | grep -o 'text="[^"]*"' | grep -v 'text=""' | wc -l)
echo "UI text fields found (dark): $TEXT_COUNT"

if [ "$TEXT_COUNT" -lt 5 ]; then
  echo "✗ ERROR: No UI text in dark mode"
  exit 1
fi
echo "✓ UI is rendering (dark)"

# Capture
echo "==> Capturing chooser (dark)"
adb -s "$SERIAL" shell screencap -p /sdcard/final-dark.png
adb -s "$SERIAL" pull /sdcard/final-dark.png "$EVIDENCE/final-dark.png"
adb -s "$SERIAL" shell rm /sdcard/final-dark.png

# Verify difference
echo ""
echo "==> Verifying captures differ..."
if cmp -s "$EVIDENCE/final-light.png" "$EVIDENCE/final-dark.png"; then
  echo "✗ WARNING: Identical files!"
else
  echo "✓ Files differ"
fi

# Cleanup
echo "==> Cleanup"
adb -s "$SERIAL" shell cmd uimode night no
adb -s "$SERIAL" shell am force-stop "$PKG"
adb -s "$SERIAL" uninstall "$PKG"

echo ""
echo "==> Captured:"
ls -lh "$EVIDENCE"/final-*.png

echo ""
echo "==> SUCCESS: Captures taken with app verified in foreground and UI rendering"

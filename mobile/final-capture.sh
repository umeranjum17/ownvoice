#!/bin/bash
set -e

SERIAL="${ANDROID_SERIAL:-$1}"
if [ -z "$SERIAL" ]; then
  echo "Error: No device serial"
  exit 1
fi

APK="/home/umer/.treehouse/ownvoice-92cfa5/2/ownvoice/mobile/android/app/build/outputs/apk/release/app-release.apk"
PKG="dev.ownvoice.next"
EVIDENCE="/home/umer/.treehouse/firstmate-8bf1b0/4/firstmate/data/ov-byokit-plan-offering/evidence"

echo "==> Final capture attempt on $SERIAL"

# Clean state
adb -s "$SERIAL" shell am force-stop "$PKG" 2>/dev/null || true
adb -s "$SERIAL" uninstall "$PKG" 2>/dev/null || true

# Install
echo "==> Installing APK"
adb -s "$SERIAL" install -r "$APK"
sleep 6
adb -s "$SERIAL" shell input tap 540 1833  # OnePlus Continue
sleep 3

# Enable service
echo "==> Enabling accessibility service"
adb -s "$SERIAL" shell settings put secure enabled_accessibility_services "dev.ownvoice.next/dev.ownvoice.bridge.OwnvoiceService"
adb -s "$SERIAL" shell settings put secure accessibility_enabled 1
sleep 2

# === LIGHT MODE ===
echo "==> Light mode setup"
adb -s "$SERIAL" shell cmd uimode night no
sleep 2

# Launch and give it time to load
echo "==> Launching app (light mode)"
adb -s "$SERIAL" shell am start -S -W -n "$PKG/.MainActivity"
sleep 10  # Long wait for RN to initialize

# Tap Continue - but wait to make sure button is rendered
echo "==> Tapping Continue"
sleep 3
adb -s "$SERIAL" shell input tap 540 2100
sleep 8  # Long wait for transition to CHOOSE screen

# Verify we're on the right screen
echo "==> Verifying screen content"
adb -s "$SERIAL" shell uiautomator dump /sdcard/ui-light.xml 2>/dev/null
SCREEN_CONTENT=$(adb -s "$SERIAL" shell cat /sdcard/ui-light.xml 2>/dev/null || echo "")

if echo "$SCREEN_CONTENT" | grep -q "How should Ownvoice write"; then
  echo "✓ CHOOSE screen detected"
elif echo "$SCREEN_CONTENT" | grep -q "On this phone"; then
  echo "✓ Plan options detected"
else
  echo "! Warning: Expected text not found, capturing anyway"
  echo "  Screen text sample:"
  echo "$SCREEN_CONTENT" | grep -o 'text="[^"]*"' | head -10
fi

# Capture
echo "==> Capturing chooser (light mode)"
adb -s "$SERIAL" shell screencap -p /sdcard/chooser-light.png
adb -s "$SERIAL" pull /sdcard/chooser-light.png "$EVIDENCE/chooser-light.png"
adb -s "$SERIAL" shell rm /sdcard/chooser-light.png

# === DARK MODE ===
echo ""
echo "==> Dark mode setup"
adb -s "$SERIAL" shell cmd uimode night yes
sleep 2

# Restart app
adb -s "$SERIAL" shell am force-stop "$PKG"
sleep 2
adb -s "$SERIAL" shell settings put secure enabled_accessibility_services "dev.ownvoice.next/dev.ownvoice.bridge.OwnvoiceService"
adb -s "$SERIAL" shell settings put secure accessibility_enabled 1
sleep 2

echo "==> Launching app (dark mode)"
adb -s "$SERIAL" shell am start -S -W -n "$PKG/.MainActivity"
sleep 10

echo "==> Tapping Continue"
sleep 3
adb -s "$SERIAL" shell input tap 540 2100
sleep 8

# Verify dark mode
adb -s "$SERIAL" shell uiautomator dump /sdcard/ui-dark.xml 2>/dev/null
SCREEN_CONTENT=$(adb -s "$SERIAL" shell cat /sdcard/ui-dark.xml 2>/dev/null || echo "")

if echo "$SCREEN_CONTENT" | grep -q "On this phone"; then
  echo "✓ Plan options detected (dark)"
else
  echo "! Warning: Expected text not found in dark mode"
fi

# Capture
echo "==> Capturing chooser (dark mode)"
adb -s "$SERIAL" shell screencap -p /sdcard/chooser-dark.png
adb -s "$SERIAL" pull /sdcard/chooser-dark.png "$EVIDENCE/chooser-dark.png"
adb -s "$SERIAL" shell rm /sdcard/chooser-dark.png

# Verify they're different
echo ""
echo "==> Verifying captures"
LIGHT_SIZE=$(stat -c%s "$EVIDENCE/chooser-light.png")
DARK_SIZE=$(stat -c%s "$EVIDENCE/chooser-dark.png")
echo "Light: $LIGHT_SIZE bytes"
echo "Dark: $DARK_SIZE bytes"

if cmp -s "$EVIDENCE/chooser-light.png" "$EVIDENCE/chooser-dark.png"; then
  echo "✗ WARNING: Files are identical!"
else
  echo "✓ Files differ (different themes)"
fi

# Cleanup
echo ""
echo "==> Cleaning up"
adb -s "$SERIAL" shell cmd uimode night no
adb -s "$SERIAL" shell am force-stop "$PKG"
adb -s "$SERIAL" uninstall "$PKG"

echo ""
echo "==> Captures saved to:"
ls -lh "$EVIDENCE"/chooser-*.png

echo ""
echo "==> IMPORTANT: Manually verify these files show the plan chooser before reporting done"

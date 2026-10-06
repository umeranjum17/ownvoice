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

echo "==> Installing and launching on $SERIAL"

# Clean install
adb -s "$SERIAL" shell am force-stop "$PKG" 2>/dev/null || true
adb -s "$SERIAL" uninstall "$PKG" 2>/dev/null || true
adb -s "$SERIAL" install -r "$APK"
sleep 6
adb -s "$SERIAL" shell input tap 540 1833  # OnePlus
sleep 2

# Enable service
adb -s "$SERIAL" shell settings put secure enabled_accessibility_services "dev.ownvoice.next/dev.ownvoice.bridge.OwnvoiceService"
adb -s "$SERIAL" shell settings put secure accessibility_enabled 1

# Light mode first
adb -s "$SERIAL" shell cmd uimode night no
sleep 1

# Launch and wait
echo "==> Launching app (light mode)..."
adb -s "$SERIAL" shell am start -n "$PKG/.MainActivity"
sleep 8  # Longer wait for app to fully load

# Try to find and tap Continue button using UI Automator
echo "==> Looking for Continue button..."
adb -s "$SERIAL" shell uiautomator dump /sdcard/ui.xml
CONTINUE=$(adb -s "$SERIAL" shell cat /sdcard/ui.xml | grep -o 'text="Continue"' || echo "")

if [ -n "$CONTINUE" ]; then
  echo "✓ Found Continue button, tapping..."
  adb -s "$SERIAL" shell input text "" && adb -s "$SERIAL" shell input keyevent 66  # Alternative: try pressing Enter
  sleep 2
  # Or try finding button bounds and tapping center
  adb -s "$SERIAL" shell uiautomator dump /sdcard/ui2.xml
  # For now, just use fixed coordinates but with longer wait
  adb -s "$SERIAL" shell input tap 540 2100
  sleep 6
else
  echo "! Continue button not found, trying direct tap anyway..."
  adb -s "$SERIAL" shell input tap 540 2100
  sleep 6
fi

# Check what's on screen now
echo "==> Checking current screen..."
adb -s "$SERIAL" shell uiautomator dump /sdcard/ui-after.xml
CHOOSE_TEXT=$(adb -s "$SERIAL" shell cat /sdcard/ui-after.xml | grep -o 'How should Ownvoice write' || echo "")

if [ -z "$CHOOSE_TEXT" ]; then
  echo "! CHOOSE screen text not found. Dumping screen hierarchy:"
  adb -s "$SERIAL" shell cat /sdcard/ui-after.xml | grep -o 'text="[^"]*"' | head -20
  echo ""
  echo "! Taking screenshot anyway to see what's on screen..."
fi

# Take screenshot regardless
echo "==> Capturing light mode..."
adb -s "$SERIAL" shell screencap -p /sdcard/verify-light.png
adb -s "$SERIAL" pull /sdcard/verify-light.png "$EVIDENCE/verify-light.png"

# Dark mode
echo "==> Switching to dark mode..."
adb -s "$SERIAL" shell cmd uimode night yes
sleep 1
adb -s "$SERIAL" shell am force-stop "$PKG"
sleep 1
adb -s "$SERIAL" shell settings put secure enabled_accessibility_services "dev.ownvoice.next/dev.ownvoice.bridge.OwnvoiceService"
adb -s "$SERIAL" shell settings put secure accessibility_enabled 1
adb -s "$SERIAL" shell am start -n "$PKG/.MainActivity"
sleep 8

# Navigate again
adb -s "$SERIAL" shell input tap 540 2100
sleep 6

# Capture dark
echo "==> Capturing dark mode..."
adb -s "$SERIAL" shell screencap -p /sdcard/verify-dark.png
adb -s "$SERIAL" pull /sdcard/verify-dark.png "$EVIDENCE/verify-dark.png"

echo "==> Evidence:"
ls -lh "$EVIDENCE"/verify-*.png

# Cleanup
adb -s "$SERIAL" shell cmd uimode night no
adb -s "$SERIAL" shell am force-stop "$PKG"
adb -s "$SERIAL" uninstall "$PKG"

echo "==> Done - please verify the images show the plan chooser"

#!/bin/bash
set -e

# The device lock passes the serial as first arg when calling: fm-device-lock.sh <serial> script.sh <serial>
SERIAL="$1"
if [ -z "$SERIAL" ]; then
  echo "Error: No device serial specified"
  echo "Usage: $0 <serial>"
  exit 1
fi

APK="/home/umer/.treehouse/ownvoice-92cfa5/2/ownvoice/mobile/android/app/build/outputs/apk/release/app-release.apk"
PKG="dev.ownvoice.next"
EVIDENCE="/home/umer/.treehouse/firstmate-8bf1b0/4/firstmate/data/ov-byokit-plan-offering/evidence"

echo "==> Testing plan offering on device $SERIAL"

# Force stop and uninstall existing app
adb -s "$SERIAL" shell am force-stop "$PKG" 2>/dev/null || true
adb -s "$SERIAL" uninstall "$PKG" 2>/dev/null || true

# Install new APK
echo "==> Installing APK"
adb -s "$SERIAL" install -r "$APK"

# Wait for install to complete (OnePlus Continue screen issue)
sleep 6
adb -s "$SERIAL" shell input tap 540 1833  # Tap Continue if present
sleep 2

# Toggle accessibility service off and on (required after install per AGENTS.md)
echo "==> Toggling accessibility service"
CURRENT=$(adb -s "$SERIAL" shell settings get secure enabled_accessibility_services 2>/dev/null | tr -d '\r' || echo "")
if [ -n "$CURRENT" ] && [ "$CURRENT" != "null" ]; then
  adb -s "$SERIAL" shell settings put secure enabled_accessibility_services ""
  sleep 1
  adb -s "$SERIAL" shell settings put secure enabled_accessibility_services "$CURRENT"
else
  # Enable Ownvoice service directly
  adb -s "$SERIAL" shell settings put secure enabled_accessibility_services "dev.ownvoice.next/dev.ownvoice.bridge.OwnvoiceService"
fi
adb -s "$SERIAL" shell settings put secure accessibility_enabled 1

# Launch app
echo "==> Launching app"
adb -s "$SERIAL" shell am start -n "$PKG/.MainActivity"
sleep 3

# Skip welcome screen (tap Continue)
echo "==> Skipping welcome"
adb -s "$SERIAL" shell input tap 540 2100
sleep 2

# Now on CHOOSE screen - capture plan options in light mode
echo "==> Capturing plan chooser - light mode"
adb -s "$SERIAL" shell screencap -p /sdcard/choose-light.png
adb -s "$SERIAL" pull /sdcard/choose-light.png "$EVIDENCE/choose-light.png"
adb -s "$SERIAL" shell rm /sdcard/choose-light.png

# Switch to dark mode
echo "==> Switching to dark mode"
adb -s "$SERIAL" shell cmd uimode night yes
sleep 2

# Force-stop and restart to reload theme
adb -s "$SERIAL" shell am force-stop "$PKG"
sleep 1
# Re-toggle service
if [ -n "$CURRENT" ] && [ "$CURRENT" != "null" ]; then
  adb -s "$SERIAL" shell settings put secure enabled_accessibility_services ""
  sleep 1
  adb -s "$SERIAL" shell settings put secure enabled_accessibility_services "$CURRENT"
else
  adb -s "$SERIAL" shell settings put secure enabled_accessibility_services "dev.ownvoice.next/dev.ownvoice.bridge.OwnvoiceService"
fi
adb -s "$SERIAL" shell settings put secure accessibility_enabled 1

adb -s "$SERIAL" shell am start -n "$PKG/.MainActivity"
sleep 3
adb -s "$SERIAL" shell input tap 540 2100  # Skip welcome again
sleep 2

# Capture plan chooser in dark mode
echo "==> Capturing plan chooser - dark mode"
adb -s "$SERIAL" shell screencap -p /sdcard/choose-dark.png
adb -s "$SERIAL" pull /sdcard/choose-dark.png "$EVIDENCE/choose-dark.png"
adb -s "$SERIAL" shell rm /sdcard/choose-dark.png

# Switch back to light mode for sign-in
adb -s "$SERIAL" shell cmd uimode night no
sleep 1
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
adb -s "$SERIAL" shell am start -n "$PKG/.MainActivity"
sleep 3
adb -s "$SERIAL" shell input tap 540 2100  # Skip welcome
sleep 2

# Select Claude plan (first plan option after phone)
# Phone option is at ~y=1000, Claude should be at ~y=1300
echo "==> Selecting Claude plan"
adb -s "$SERIAL" shell input tap 540 1300
sleep 1

# Tap Continue to start sign-in
adb -s "$SERIAL" shell input tap 540 2100
sleep 3

# Capture sign-in code screen
echo "==> Capturing sign-in code screen"
adb -s "$SERIAL" shell screencap -p /sdcard/signin-code.png
adb -s "$SERIAL" pull /sdcard/signin-code.png "$EVIDENCE/signin-code.png"
adb -s "$SERIAL" shell rm /sdcard/signin-code.png

echo "==> Test complete! Evidence captured:"
ls -lh "$EVIDENCE"

echo ""
echo "==> Evidence file sizes:"
cd "$EVIDENCE"
for f in *.png; do
  SIZE=$(stat -c%s "$f")
  echo "$f: $SIZE bytes"
done

# Clean up - uninstall app
echo "==> Uninstalling app"
adb -s "$SERIAL" shell am force-stop "$PKG"
adb -s "$SERIAL" uninstall "$PKG"

echo "==> Done!"

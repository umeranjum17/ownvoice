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

echo "==> Manual capture guide for device $SERIAL"
echo ""
echo "This script will:"
echo "1. Install the app"
echo "2. Enable the service"
echo "3. Launch the app"
echo "4. PAUSE for you to manually navigate to CHOOSE screen"
echo "5. Take screenshot when you press Enter"
echo ""

# Clean install
echo "==> Installing app..."
adb -s "$SERIAL" shell am force-stop "$PKG" 2>/dev/null || true
adb -s "$SERIAL" uninstall "$PKG" 2>/dev/null || true
adb -s "$SERIAL" install -r "$APK"
sleep 6
adb -s "$SERIAL" shell input tap 540 1833
sleep 2

# Enable service
echo "==> Enabling accessibility service..."
adb -s "$SERIAL" shell settings put secure enabled_accessibility_services "dev.ownvoice.next/dev.ownvoice.bridge.OwnvoiceService"
adb -s "$SERIAL" shell settings put secure accessibility_enabled 1

# Light mode
echo "==> Setting light mode..."
adb -s "$SERIAL" shell cmd uimode night no
sleep 1

# Launch
echo "==> Launching app..."
adb -s "$SERIAL" shell am start -n "$PKG/.MainActivity"
sleep 3

echo ""
echo "==> APP SHOULD NOW BE RUNNING"
echo "==> Please manually:"
echo "    1. Tap Continue on Welcome screen"
echo "    2. Wait for CHOOSE screen to appear"
echo "    3. Verify you see 'On this phone' and plan options (Claude, ChatGPT)"
echo ""
read -p "Press Enter when CHOOSE screen is visible in LIGHT mode..."

# Capture light
adb -s "$SERIAL" shell screencap -p /sdcard/manual-light.png
adb -s "$SERIAL" pull /sdcard/manual-light.png "$EVIDENCE/manual-light.png"
adb -s "$SERIAL" shell rm /sdcard/manual-light.png
echo "✓ Light mode captured"

# Switch to dark
echo ""
echo "==> Switching to dark mode..."
adb -s "$SERIAL" shell cmd uimode night yes
sleep 1
adb -s "$SERIAL" shell am force-stop "$PKG"
sleep 1
adb -s "$SERIAL" shell settings put secure enabled_accessibility_services "dev.ownvoice.next/dev.ownvoice.bridge.OwnvoiceService"
adb -s "$SERIAL" shell settings put secure accessibility_enabled 1
adb -s "$SERIAL" shell am start -n "$PKG/.MainActivity"
sleep 3

echo ""
echo "==> Please manually navigate to CHOOSE screen again (dark theme)"
read -p "Press Enter when CHOOSE screen is visible in DARK mode..."

# Capture dark
adb -s "$SERIAL" shell screencap -p /sdcard/manual-dark.png
adb -s "$SERIAL" pull /sdcard/manual-dark.png "$EVIDENCE/manual-dark.png"
adb -s "$SERIAL" shell rm /sdcard/manual-dark.png
echo "✓ Dark mode captured"

# Verify difference
echo ""
echo "==> Verifying captures differ..."
if cmp -s "$EVIDENCE/manual-light.png" "$EVIDENCE/manual-dark.png"; then
  echo "✗ WARNING: Captures are identical!"
else
  echo "✓ Captures differ"
fi

echo ""
echo "==> Evidence files:"
ls -lh "$EVIDENCE"/manual-*.png

# Cleanup
adb -s "$SERIAL" shell cmd uimode night no
adb -s "$SERIAL" shell am force-stop "$PKG"
adb -s "$SERIAL" uninstall "$PKG"

echo ""
echo "==> Done! Check the evidence files to verify they show the plan chooser."

#!/usr/bin/env bash
# Build the AklatOne phone app (members + librarian mode) and install it on a USB-connected Android phone.
# Usage: npm run android   (from the project root)  or  bash frontend/scripts/run-android.sh
# Keeps the app's data on the phone (adb install -r). Does not touch the database.
set -euo pipefail
cd "$(dirname "$0")/.."

echo ""
echo "  AklatOne · phone app (Android) for students, teachers and the librarian"
echo "  Builds the app, installs it on the USB-connected phone and opens it."
echo ""
command -v adb >/dev/null || { echo "adb not found. Add ~/Android/Sdk/platform-tools to PATH."; exit 1; }

DEVICES=$(adb devices | awk 'NR>1 && $2=="device"' | wc -l)
if [ "$DEVICES" -eq 0 ]; then
  echo "No phone detected. Connect the USB cable, enable Developer options > USB debugging,"
  echo "and tap 'Allow' on the phone's 'Allow USB debugging?' prompt. Then run this again."
  adb devices
  exit 1
fi
[ "$DEVICES" -gt 1 ] && { echo "More than one device connected. Set ANDROID_SERIAL to choose one (see 'adb devices')."; exit 1; }

if ! curl -sf --max-time 3 http://127.0.0.1:3000/health >/dev/null; then
  echo "WARNING: the backend is not answering on port 3000."
  echo "         Start it in another terminal (project root): npm run dev"
  echo "         The app will install, but sign-in and the catalog will show 'Can't reach the server'."
fi

echo "==> [1/5] Building the app"
npm run build
echo "==> [2/5] Copying it into the Android project"
npx cap sync android
echo "==> [3/5] Building the debug APK (first time takes a few minutes)"
(cd mobile-capacitor/android && ./gradlew assembleDebug)
echo "==> [4/5] Letting the phone reach this computer's API (port 3000 over USB)"
adb reverse tcp:3000 tcp:3000
echo "==> [5/5] Installing (keeps existing app data) and opening AklatOne"
adb install -r mobile-capacitor/android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.aklatone.app/.MainActivity >/dev/null
echo ""
echo "Done. AklatOne is open on your phone."
echo "  · Choose Member or Librarian on the sign-in screen. The app asks to sign in each time it is opened."
echo "  · New members: Create an account (activation code by email; [DEV OTP] in the API terminal without email)."
echo "  · Camera: the first QR scan downloads Google's scanner to the phone once (needs internet)."
echo "  · Unplugged and replugged the cable? Run: adb reverse tcp:3000 tcp:3000"

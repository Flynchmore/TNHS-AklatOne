#!/usr/bin/env bash
# Build the AklatOne Member Mobile app and install it on a USB-connected Android phone.
# Usage (from anywhere):  bash frontend/scripts/run-android.sh
# Keeps the app's data on the phone (adb install -r). Does not touch the database.
set -euo pipefail
cd "$(dirname "$0")/.."

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
  echo "         Start it in another terminal: cd backend && npm run dev"
  echo "         The app will install, but sign-in and the catalog will show 'Can't reach the server'."
fi

echo ""
echo "  AklatOne · Member Mobile app (Android, for students and teachers)"
echo "  Builds the app, installs it on the connected phone and opens it."
echo ""
echo "==> Building web assets"
npm run build
echo "==> Syncing into the Android project"
npx cap sync android
echo "==> Building debug APK"
(cd mobile-capacitor/android && ./gradlew assembleDebug)
echo "==> Forwarding phone port 3000 to this computer's backend"
adb reverse tcp:3000 tcp:3000
echo "==> Installing (keeps existing app data)"
adb install -r mobile-capacitor/android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.aklatone.app/.MainActivity >/dev/null
echo "Done. AklatOne is open on your phone."
echo "If you unplug and replug the cable, re-run: adb reverse tcp:3000 tcp:3000"

#!/usr/bin/env bash
# AklatOne phone app for a LAN setup (before the school has a domain with HTTPS): the backend runs on this laptop
# and the phones reach it over the same Wi-Fi.
#
#   bash scripts/lan-apk.sh build         build the APK that talks to http://<this laptop's Wi-Fi IP>:3000
#   bash scripts/lan-apk.sh install-all   install it on EVERY phone plugged into the USB hub (adb, USB debugging on)
#   bash scripts/lan-apk.sh share         show a QR code; phones on the same Wi-Fi scan it and download the APK
#
# Optional: API_URL=http://192.168.1.10:3000 to choose the address yourself.
# Debug build on purpose: it may use plain HTTP on the LAN. Once the server has a domain with HTTPS, use the signed
# release APK instead (docs/DEPLOYMENT.md, section 4).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=release/AklatOne-LAN.apk
IP=$(ip -4 route get 1.1.1.1 2>/dev/null | grep -oP 'src \K[0-9.]+' || hostname -I | awk '{print $1}')
API_URL=${API_URL:-http://$IP:3000}

build() {
  echo "==> Building the app for $API_URL"
  VITE_API_BASE_URL="$API_URL" npm run build
  npx cap sync android
  (cd mobile-capacitor/android && ./gradlew assembleDebug -q)
  mkdir -p release
  cp mobile-capacitor/android/app/build/outputs/apk/debug/app-debug.apk "$OUT"
  echo "==> $OUT is ready (server address inside: $API_URL)"
}

check_server() {
  if ! curl -sf --max-time 3 "$API_URL/health" >/dev/null; then
    echo "WARNING: $API_URL/health does not answer."
    echo "  - Start the backend:  npm run dev   (from the project folder)"
    echo "  - Open port 3000 in this laptop's firewall once:  sudo firewall-cmd --add-port=3000/tcp --permanent && sudo firewall-cmd --reload"
  fi
}

case "${1:-}" in
  build) build; check_server ;;
  install-all)
    [ -f "$OUT" ] || build
    command -v adb >/dev/null || { echo "adb not found. Add ~/Android/Sdk/platform-tools to PATH."; exit 1; }
    mapfile -t PHONES < <(adb devices | awk 'NR>1 && $2=="device" {print $1}')
    [ "${#PHONES[@]}" -gt 0 ] || { echo "No phone found. Plug them in, turn on USB debugging and tap Allow on each phone."; adb devices; exit 1; }
    echo "==> Installing on ${#PHONES[@]} phone(s) at the same time"
    for s in "${PHONES[@]}"; do
      ( adb -s "$s" install -r "$OUT" >/dev/null 2>&1 && echo "   ok      $s" || echo "   FAILED  $s (unlock the phone, allow USB debugging, try again)" ) &
    done
    wait
    check_server
    echo "Done. Unplug the phones; they reach the library server over the Wi-Fi."
    ;;
  share)
    [ -f "$OUT" ] || build
    check_server
    exec node scripts/share-apk.mjs "$OUT" "$IP"
    ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac

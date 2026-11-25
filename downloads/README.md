# Phone app downloads (server only)

Put the **signed release** Android app here as `AklatOne.apk` (from the GitHub Release, or
`frontend/mobile-capacitor/android/app/build/outputs/apk/release/app-release.apk` renamed). The web container
serves it at `https://<your domain>/download/AklatOne.apk`, the default link of **Printing > Mobile app QR**.
APK files are never committed to Git (`.gitignore`).

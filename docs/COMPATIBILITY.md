# AklatOne: OS and device compatibility

One React codebase (`frontend/src`) runs in three shells. This page lists what each platform needs, what was
verified, and what is still open. Updated 2026-11-24.

| App | Platforms | Status |
|---|---|---|
| Staff Web (PWA) | Chrome, Edge, Firefox on Windows / Linux / macOS | Verified in Chrome on Linux (headless screenshots, light + dark). |
| Staff Desktop (Tauri 2) | Windows 10/11, Linux | Linux: built and run on the dev PC (Fedora). Windows: built by CI (`desktop` job, `windows-latest`); not yet run on a school computer. |
| Member Mobile (Capacitor 8) | Android 7.0+ (API 24), target API 36 | Debug APK builds (CI `android` job and dev PC). Physical-device test still pending. |
| Member Mobile on iOS | iOS / iPadOS 15+ (Capacitor 8), camera in the web view | Xcode project added (`frontend/mobile-capacitor/ios`, Swift Package Manager). Compiled by CI (`ios` job, macos-latest, simulator, no signing). Installing on an iPhone needs a Mac with Xcode and an Apple account. |

## Desktop (Windows and Linux)
- WebView: Windows uses Microsoft Edge WebView2 (preinstalled on Windows 11; the installer adds it on Windows 10).
  Linux uses WebKitGTK 4.1 (`libwebkit2gtk-4.1`).
- Credential store (sign-in token, offline member passwords): Windows Credential Manager; Linux Secret Service
  (GNOME Keyring / KWallet). Without a store the app falls back to local storage (see `desktop-tauri/src/lib.rs`).
- Newspaper links open in the computer's browser: `cmd /C start` on Windows, `xdg-open` on Linux, `open` on macOS.
- Camera scanning: works in WebView2 (Windows). WebKitGTK on Linux may refuse the camera; a USB scanner or typing
  still works everywhere.
- Build: `cd frontend && npx tauri build` (installers: `.msi` / `.exe` on Windows, `.deb` / `.rpm` / `.AppImage` on
  Linux). Installers must be built on that OS. Windows releases should be code-signed (certificate not yet bought).

## Mobile (Android and iOS)
- Android: `npm run android` (or `bash frontend/scripts/run-android.sh`). Camera permission is asked only when
  scanning. Token kept in the Android keystore (`capacitor-secure-storage-plugin`).
- iOS readiness of the code: native detection already covers the iOS bridge (`detectNative` in `src/App.tsx`,
  `Capacitor.isNativePlatform`), and `capacitor-secure-storage-plugin` uses the iOS Keychain. No Android-only APIs
  are used by the member or librarian screens.
- One folder, two native projects: `frontend/mobile-capacitor/android` and `frontend/mobile-capacitor/ios`
  (`capacitor.config.ts`). `npx cap sync` updates both from the same `dist/`. The app knows its OS at run time
  (`Capacitor.getPlatform()` = "android" or "ios"); no separate code. Android installs an `.apk` / `.aab`, iOS an
  `.ipa` built on a Mac, so each OS still gets its own installer.
- iOS details: `NSCameraUsageDescription` in `ios/App/App/Info.plist`; AklatOne icon (1024 px, upscaled from the
  589 px reference logo; supply a 1024 px original for a sharper icon) and white splash with the logo.
- Build on a Mac: `cd frontend && npm run build && npx cap sync ios && npx cap open ios`, choose the signing team,
  then Run (phone) or Archive (TestFlight / App Store).

## Not checked yet
- Real phones (Android camera scanning, offline mode in airplane mode, kiosk 6-digit code by hand); iOS has only been compiled by CI, never run on an iPhone.
- The Desktop app on an actual Windows school computer (WebView2 camera, Credential Manager, Downloads folder).
- Screen readers beyond the automated label/contrast tests.

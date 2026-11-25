# Mobile Deployment Report

> **Superseded (2026-11-19 audit):** Parts of this report are out of date. See `docs/PROJECT_CONTEXT.md` for current status.

## Root cause of missing UI update
The installed Android app was rendering the **web/desktop** route tree instead of the mobile one.
`App.tsx` decided between web and mobile routes using `!!(window as any).Capacitor`, which is unreliable in a Capacitor WebView:
- On native, `window.Capacitor` may not be injected yet when the (deferred) ES module first evaluates, so `isNative` was `false` and the app fell through to the staff web UI and `/login`.
- The app icon was still the default Capacitor teal grid icon (no TNHS branding).
- Splash screen was the default Capacitor splash.

## Files inspected
- `frontend/capacitor.config.ts` (webDir: "dist", appId: com.aklatone.app)
- `frontend/android/app/src/main/AndroidManifest.xml`, `build.gradle`, `res/values/strings.xml`
- `frontend/android/app/src/main/res/mipmap-*/` (default Capacitor icons)
- `frontend/src/App.tsx`
- `frontend/src/features/mobile/*`
- `frontend/dist` vs `frontend/android/app/src/main/assets/public` (sync verified)

## Files modified
- `frontend/src/App.tsx` — robust native detection (`window.androidBridge`, webkit bridge, `Capacitor.isNativePlatform()`, WebView user-agent), moved detection into `App()` render; added `/m/register` route.
- `frontend/src/components/mobile/MobileLayout.tsx` — polished bottom nav.
- `frontend/src/features/mobile/MobileLogin.tsx` — TNHS logo, design tokens, show/hide password, register link.
- `frontend/src/features/mobile/MobileRegister.tsx` — polished form.
- `frontend/src/features/mobile/MobileHome.tsx` — greeting avatar, search, quick menu, featured books.
- `frontend/src/features/mobile/MobileCatalog.tsx`, `MobileHistory.tsx`, `MobileProfile.tsx` — design tokens.
- `frontend/public/tnhs-logo.png` — added (from docs/reference).
- `frontend/android/app/src/main/res/mipmap-*/ic_launcher*.png` — regenerated from TNHS logo.
- `frontend/android/app/src/main/res/drawable/ic_launcher_background.xml` — TNHS Royal Blue.
- `frontend/android/app/src/main/res/drawable*/splash.png` — regenerated.

## Capacitor configuration findings
- Config correct: `webDir: "dist"`, appId `com.aklatone.app`.
- `npx cap sync android` succeeds and updates `android/app/src/main/assets/public`.
- Bundled assets verified to contain mobile UI strings ("Confirm Password", "Hello, Member").

## Build and synchronization results
- `npm run build` — success.
- `npx cap sync android` — success.
- `./gradlew assembleDebug` — BUILD SUCCESSFUL.
- `tsc --noEmit` — no errors.

## Android installation results
- `adb install -r app-debug.apk` — Success.
- App launched; UI hierarchy dump confirms MobileLogin screen renders ("AklatOne", "Library Management System", "Username", "Password", "Sign in", "Register", "Demo: member / member").
- App icon regenerated from TNHS logo; splash regenerated.

## Remaining issues and limitations
- Mobile features remain prototype (in-memory auth, demo credentials member/member; no backend integration).
- Registration is client-side only (no API call, no policy enforcement).
- No real catalog/history data; empty states shown.
- Login does not call backend; will need integration later.
- Could not visually verify screenshot (model has no image input); verified via UI hierarchy text dump.
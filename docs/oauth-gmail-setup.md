# Gmail OAuth Setup Guide for AklatOne

This guide explains how to enable "Sign in with Google" for the AklatOne mobile app.

## 1. Create a Google Cloud Project

1. Go to https://console.cloud.google.com/
2. Create a new project (e.g., "AklatOne").
3. Enable the **Google+ API** (or "People API") for the project.

## 2. Configure OAuth Consent Screen

1. Go to **APIs & Services > OAuth consent screen**.
2. Choose **External** (for testing) and fill in app name, support email, developer contact.
3. Add scopes: `email`, `profile`, `openid`.
4. Add test users (your Gmail accounts) while in testing mode.

## 3. Create OAuth 2.0 Credentials

1. Go to **APIs & Services > Credentials > Create Credentials > OAuth client ID**.
2. Application type: **Web application**.
3. Authorized JavaScript origins:
   - `http://localhost:5173` (Vite dev)
   - `https://localhost` (Capacitor)
   - Your production domain (if any)
4. Authorized redirect URIs: (not strictly needed for ID-token flow, but add `http://localhost:5173`).
5. Copy the **Client ID** (looks like `xxxx.apps.googleusercontent.com`).

## 4. Configure the Frontend

Create `frontend/.env` (or set in your build env):

```
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_API_BASE_URL=http://localhost:3000
```

Rebuild the frontend and sync Capacitor.

## 5. Configure the Backend (required)

> Updated 2026-11-19: `GOOGLE_CLIENT_ID` is now required. Without it `/auth/google` returns 503. The backend always checks `aud` and `email_verified`; the code change described below is already done.

The backend verifies the Google ID token via Google's public tokeninfo endpoint (no extra dependency). For production hardening, set the client ID in the backend env and verify the `aud` claim:

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

Then update `googleLogin` in `backend/src/modules/auth/auth.service.ts` to check `payload.aud === process.env.GOOGLE_CLIENT_ID`.

## 6. Do I need to run the backend while developing the mobile app?

**Yes.** The mobile app calls the backend API (`/api/v1/auth/login`, `/register`, `/google`, `/catalog`, etc.) over HTTP. During development:

1. Start MariaDB on port 3307 (see project setup).
2. Start the backend: `cd backend && npm run dev` (port 3000).
3. Forward the port to the device: `adb reverse tcp:3000 tcp:3000`.
4. Build/sync/install the APK: `npm run build && npx cap sync android && cd android && ./gradlew assembleDebug && adb install -r app/build/outputs/apk/debug/app-debug.apk`.

Without the backend running, login/registration/catalog will fail with network errors.

For production, deploy the backend to a server and set `VITE_API_BASE_URL` to the server URL (and update CORS accordingly).

## 7. Security Notes

- Tokens are JWTs signed with `JWT_SECRET`. Keep this secret safe and rotate in production.
- `ALLOW_PUBLIC_REGISTRATION=true` allows anyone to register as MEMBER. Set to `false` in production if you want admin-provisioned accounts only.
- Rate limiting is process-local (in-memory). For multi-instance deployments, use a shared store (Redis).
- The frontend stores the JWT in `localStorage` (WebView storage). For higher security on mobile, consider Capacitor Secure Storage (requires `@capacitor/preferences` or a secure storage plugin).
- Always use HTTPS in production.
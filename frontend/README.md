# AklatOne frontend

One React + TypeScript + Vite + Tailwind codebase (`src/`) for three apps, each with its own shell folder:

| App | Shell folder | Who | Run (development) | Build |
|---|---|---|---|---|
| Staff Web portal (PWA) | `web-pwa/` | Librarian / admin | `npm run dev` | `npm run build` (output in `dist/`) |
| Staff Desktop (Tauri) | `desktop-tauri/` | Librarian / admin | `npm run dev:desktop` | `npm run build:desktop` |
| Member Mobile (Capacitor, Android + iOS) | `mobile-capacitor/android`, `mobile-capacitor/ios` | Students / teachers | `npm run android` (USB phone) | `npm run build && npx cap sync android`, then Android Studio |

The API address comes from `VITE_API_BASE_URL` in `.env` (default `http://localhost:3000`).
From the project root, `npm run dev` starts Redis, the API and the Staff Web together.

Checks: `npm run lint`, `npm test`, `npm run build`.

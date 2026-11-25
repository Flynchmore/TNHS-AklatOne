# Development Environment

## Tools
- Node.js 24
- npm 11
- MariaDB 10.11 on 127.0.0.1:3307

## Backend
cd backend
npm install
npm run dev

## Frontend
cd frontend
npm install
npm run dev

## Database
DB aklatone, user aklatone. Password in .env (not documented).
TCP connection verified on 3307.

Data directory (since 2026-11-19): ~/.local/share/aklatone-mariadb/data
(moved from /tmp/opencode/mariadb-data, which is tmpfs and wiped on reboot).
Backups: ~/aklatone-backups/ (mariadb-dump of aklatone and aklatone_e2e).

Runs as systemd user service ~/.config/systemd/user/aklatone-mariadb.service
(enabled: starts when you log in; bound to 127.0.0.1 only).
Start: systemctl --user start aklatone-mariadb
Stop:  systemctl --user stop aklatone-mariadb
Logs: journalctl --user -u aklatone-mariadb

## DBeaver
Installed by user. CLI verified MariaDB. GUI connection not verified by agent. Manual connection: MariaDB, 127.0.0.1, 3307, aklatone.

## Platform Direction
- Web: React + Vite PWA.
- Desktop: Tauri (Rust + WebView).
- Mobile: Capacitor (Android APK/AAB).
- No React Native, Expo, or Electron.

## Migrations
npx prisma migrate dev
npx prisma validate

## E2E
Dedicated DB aklatone_e2e. Reset only with ALLOW_E2E_DATABASE_RESET=1.
## Manual QA
- Start MariaDB on 3307 (already running).
- Backend: cd backend && npm run dev (http://localhost:3000)
- Frontend: cd frontend && npm run dev (http://localhost:5173)
- Login as e2e_librarian / TestPass123! for E2E DB only.

# AklatOne

Library Management System for Tagumpay National High School (School ID 308114).

| Part | Folder | Technology |
|---|---|---|
| API and database | `backend/` | Node.js, Express, TypeScript, Prisma, MariaDB, Redis (optional) |
| Shared app code | `frontend/src/` | React, TypeScript, Vite, Tailwind CSS (used by all three apps) |
| Staff Web portal | `frontend/web-pwa/` | Installable PWA shell (manifest, service worker) |
| Staff Desktop app | `frontend/desktop-tauri/` | Tauri shell (offline saving + Upload) |
| Member Mobile app | `frontend/mobile-capacitor/` | Capacitor shell: `android/` and `ios/` |

## Development

Requirements: Node.js 20+, MariaDB 10.11 (dev database on port 3307), Docker for Redis (optional).

```bash
npm --prefix backend install && npm --prefix frontend install   # once
cp backend/.env.example backend/.env                              # once, then fill it in

npm run dev           # Redis + API + Staff Web, in one terminal
npm run dev:desktop   # Redis + API + Staff Desktop window
npm run dev:all       # Redis + API + Staff Web + Staff Desktop
npm run android       # build and install the Member Mobile app on a USB-connected phone
```

Each part can also run on its own (`cd backend && npm run dev`, `cd frontend && npm run dev`).
The API prints a startup summary showing whether the database, Redis and email are connected.

Checks: `npm test` (both parts), `cd backend && npm run typecheck`, `cd frontend && npm run lint`.
Backend tests use the `aklatone_e2e` database (see `AGENTS.md`).

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): Docker Compose on a VPS (e.g. Hostinger VPS), GitHub, HTTPS,
and building the Android app and desktop installer for the live server.

## Documentation

- `docs/ARCHITECTURE.md`: tiers, layers and folder map
- `docs/PROJECT_CONTEXT.md`: current state, decisions and open items
- `docs/aklatone-library-business-rules.md`: library rules
- `docs/diagrams/`: flowcharts, ERD and DFD (draw.io + PNG)

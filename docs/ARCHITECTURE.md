# AklatOne architecture

AklatOne is a **3-tier (N-tier) client–server system** in one repository (monorepo): three client apps share one React
codebase and talk to **one** backend API, which owns **one** MariaDB database.

```
 PRESENTATION TIER (frontend/)                 APPLICATION TIER (backend/)                 DATA TIER
 ┌───────────────────────────────┐             ┌──────────────────────────────┐            ┌──────────────────────┐
 │ frontend/src  (shared React)  │             │ Express API (modular monolith)│            │ MariaDB 10.11        │
 │  ├ web-pwa          Staff Web │  HTTPS/JSON │  security middleware          │   Prisma   │  (all records)       │
 │  ├ desktop-tauri    Staff Desk│ ──────────► │  validation (zod)             │ ─────────► │ Redis (optional,     │
 │  └ mobile-capacitor Member App│  /api/v1    │  routes → business rules      │            │  sign-in limits)     │
 └───────────────────────────────┘             │  integrations (email, Google) │            │ Backup files         │
                                                └──────────────────────────────┘            └──────────────────────┘
```

## Presentation tier — `frontend/`

| Layer | Where | Role |
|---|---|---|
| Platform shells | `web-pwa/` (manifest, service worker), `desktop-tauri/` (Tauri, window, permissions), `mobile-capacitor/` (Android project) | Package the same app for browser, desktop and phone |
| Screens | `src/features/*` (staff: dashboard, catalog, circulation, members, reports, printing, settings, upload; member: `src/features/mobile/*`) | What each role sees |
| Shared UI | `src/components/` (`staff/ui.tsx`, `mobile/ui.tsx`, `SplineArea`, `Receipt`, `Toast`) | One design system for all apps |
| Data access | `src/lib/api.ts` (`apiFetch`), React Query, `src/features/auth/auth.tsx` (session) | Calls the API with the user's token |
| Offline layer (Desktop) | `src/lib/offline.ts` | Cache of lists, outbox of changes, Upload |

Which app is running is decided at start: Tauri (`isDesktop` in `src/lib/offline.ts`), Capacitor (`detectNative` in
`src/App.tsx`), otherwise the Staff Web.

## Application tier — `backend/`

| Layer | Where | Role |
|---|---|---|
| Entry and start-up | `src/server.ts`, `src/app.ts` | Middleware order, route mounting, startup checks |
| Security middleware | `helmet`, CORS allow-list, rate limiting (`src/config/redis.ts` `FallbackStore`), `src/middleware/auth.ts` (`authenticate`, `requirePermission`) | Who may call what |
| Validation | `src/middleware/validate.ts` + `*.schemas.ts` (zod) | Reject bad input at the boundary |
| Routes and business rules | `src/modules/<module>/*.routes.ts` (+ `auth.service.ts`): auth, setup, users, catalog, categories, book-copies, borrow-requests, circulation, notifications, favourites, reports | Library workflow |
| Cross-cutting | `src/common/` (audit log, email templates, notifications, password strength, responses) | Shared services |
| Data access | Prisma client (`src/config/prisma.ts`), schema and migrations in `prisma/` | All database access; parameterised queries |

## Data tier

| Layer | What | Notes |
|---|---|---|
| Primary store | MariaDB (`prisma/schema.prisma`) | Constraints (FK, unique), transactions, audit table |
| Cache | Redis | Optional; the API falls back to memory |
| Backup / restore | Database dumps | Manual today; in-app Backup and Restore is planned (A2) |
| Failover | — | Not needed for one school; backups + tested restore are the recovery plan |

## Deployment

One server runs the data tier, the API and the Staff Web (`docker-compose.yml`: `db`, `redis`, `api`, `web`/nginx).
The Desktop and Android apps are built as installers that point to the same server address. See `docs/DEPLOYMENT.md`.

## Checking the code against this document

Ask Claude Code: *"Read AGENTS.md, docs/PROJECT_CONTEXT.md and docs/ARCHITECTURE.md. Compare the documented tiers and
layers with the actual code (routes, middleware, services, Prisma usage, frontend shells). List every mismatch with file
paths. Do not change code."*

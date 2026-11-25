# AklatOne Development Startup and Credentials Audit

## Startup
Backend: cd backend && npm run dev (port 3000)
Frontend: cd frontend && npm run dev (port 5173)
MariaDB must be running on 3307.

## Environment variables
DATABASE_URL, JWT_SECRET, PORT, etc. (see .env.example). Do not expose secrets.

## Development accounts
- Seed creates roles ADMIN, LIBRARIAN, MEMBER and e2e_admin (ADMIN) with password TestPass123! (dev only).
- Provisioning script creates LIBRARIAN and MEMBER accounts via env vars or interactive prompts.
- No documented default dev credentials.

## Safest next step
- Run provisioning script with ALLOW_DEV_ACCOUNTS=1 after approval, or use e2e_admin (ADMIN) for manual QA.
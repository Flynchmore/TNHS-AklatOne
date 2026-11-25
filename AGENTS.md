# AklatOne

Library Management System for Tagumpay National High School (provisional backend foundation).

## Structure
- backend/: Express + TypeScript + Prisma + MariaDB
- frontend/: React + TypeScript + Vite + Tailwind (shared by Web, Desktop, Mobile)
  - frontend/src/: shared app code for all three apps
  - frontend/web-pwa/: Staff Web PWA shell (manifest, service worker)
  - frontend/desktop-tauri/: Tauri desktop shell (staff)
  - frontend/mobile-capacitor/: Capacitor phone app (member + librarian mode): android/ and ios/ native projects

## Backend
Modules under src/modules: auth, users, catalog (incl. Excel import/export), categories, book-copies, circulation,
reports, borrow-requests, notifications (incl. automatic reminders), favourites, setup, backup, system, inventory.
Note: tests/auth.test.ts uses a real database (other suites mock Prisma). Run the suite against
aklatone_e2e with REDIS_URL blank (the shared Redis rate-limit counts otherwise cause 429s):
  DATABASE_URL=<.env URL with db aklatone_e2e> REDIS_URL= npm test
Refresh the E2E DB with: ALLOW_E2E_DATABASE_RESET=1 E2E_DATABASE_URL=<same URL> npm run reset:e2e
Commands:
- npm run typecheck
- npm run lint
- npm test
- npm run build
- npx prisma validate
- npm run dev

## Frontend
Commands:
- npm run build
- npm run lint
- npm test (Vitest)
- npm run cap:sync (after build; updates mobile-capacitor/android and mobile-capacitor/ios)
- Playwright is not installed yet; E2E is planned.

## Database
MariaDB 10.11 on 127.0.0.1:3307, db aklatone, user aklatone.
Never reset dev DB. E2E uses aklatone_e2e.

## Rules
- Preserve modular monolith.
- No unconfirmed borrowing policies.
- No real student data in tests.
- Don't overwrite .env.

## Alignment Rules
- Inspect before modifying.
- Prefer minimal changes.
- Follow developer's requested scope.
- Do not invent features or business rules.
- Do not claim tests passed unless executed.

## Skill Discovery
- Before any task, inspect project skills and installed skills.
  - OpenCode: .opencode/skills (original copies).
  - Claude Code: .claude/skills (adapted copies with AklatOne notes) and the ponytail plugin (project scope).
- Read relevant SKILL.md before implementation.
- Use ui-ux-pro-max for UI tasks if available.
- Use ponytail (ponytail-review / ponytail-audit) for review/audit.
- Do not install missing skills without approval.

## Workflow
1. Understand task.
2. Read AGENTS.md and PROJECT_CONTEXT.md.
3. Inspect relevant source.
4. Identify and read relevant skills.
5. State scope and affected files.
6. Implement only requested changes.
7. Run relevant tests/validation.
8. Review changes.
9. Provide factual completion report.

## Safety
- No destructive DB commands.
- No .env exposure.
- No Git destructive commands.
- Do not invent features.
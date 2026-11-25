---
name: testing-playwright
description: Testing conventions for AklatOne.
---

> **AklatOne note:** Playwright is not currently installed and there is no `playwright.config`. Do not install it without approval. Note: `backend/tests/auth.test.ts` uses a real database (others mock Prisma); point DATABASE_URL at `aklatone_e2e` when running it.

# Testing
- Vitest for backend/frontend.
- Playwright E2E with dedicated E2E DB.
- Fictional fixtures only.

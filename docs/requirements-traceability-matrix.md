# AklatOne Requirements Traceability Matrix (Provisional)

Evidence is source code inspected on 2026-11-19. "Tested" means a test file exists; it does not mean the suite passed.

| Module | Backend evidence | Frontend evidence | Tests | Status | School confirmation needed |
|---|---|---|---|---|---|
| Auth (login, JWT, /me) | modules/auth | Login.tsx, MobileLogin.tsx | auth.test.ts | Implemented | No |
| Public registration (MEMBER) | POST /auth/register, ALLOW_PUBLIC_REGISTRATION | MobileRegister.tsx | auth.test.ts | Implemented, decision pending | Yes |
| Google sign-in | POST /auth/google | Mobile login | None | Implemented, decision pending | Yes |
| Login OTP / forgot-reset password | /auth/verify-login-otp, /forgot-password, /verify-otp, /reset-password | MobileForgotPassword.tsx | None | Implemented, decision pending | Yes |
| Profile update | PATCH /auth/profile | MobileProfile.tsx | None | Implemented | No |
| Users (read) | modules/users | None | None | Backend only | No |
| Categories | modules/categories | None (staff UI) | catalog-categories.test.ts | Backend only | No |
| Catalog | modules/catalog | Catalog.tsx, MobileCatalog.tsx | catalog-categories.test.ts, catalog.test.tsx | Implemented | No |
| Book copies / inventory | modules/book-copies | BookCopies.tsx | book-copies.test.ts, bookcopies.test.tsx | Implemented | No |
| Circulation (borrow/return) | modules/circulation | MobileHistory.tsx (member view only) | circulation.test.ts | Backend + member history | Policies: Yes |
| Reports | modules/reports | Dashboard.tsx (partial) | reports.test.ts | Backend, partial UI | Which reports: Yes |
| Borrowing limits, loan period, penalties, renewals, reservations | Not implemented | Not implemented | None | Deferred | Yes |

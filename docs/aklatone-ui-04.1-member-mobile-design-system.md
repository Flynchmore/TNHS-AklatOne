# AklatOne UI-04.1 — Member Mobile Design System Alignment and WCAG 2.2 AA

Date: 2026-11-19. Scope: Member Mobile only. Approved decisions: primary `#3354B5`; replace the unused `:root` tokens with Tailwind v4 `@theme`; remove misleading Home content; keep `tnhs-quadrangle.jpg` (the new banner image spells the school "TACUMPAY"); wire or remove non-functional controls.

Legend: **Implemented** · **Tested – passed** · **Tested – failed** · **Not tested** · **Deferred**

## 1. Files inspected
`AGENTS.md`, `docs/PROJECT_CONTEXT.md`, `docs/OPENCODE_SKILLS.md`, `DESIGN.md`, `docs/aklatone-ui-01r-premium-cross-platform-design-blueprint.md`, `docs/aklatone-ui-04.0-uiux-resource-evaluation.md`, `docs/aklatone-library-business-rules.md`; skills `frontend-react`, `frontend-design`, `design-system`, `ui-styling`, `ui-ux-pro-max`; `frontend/src/App.tsx`, `main.tsx`, `index.css`, `lib/api.ts`, `features/auth/auth.tsx`, all files in `features/mobile/` and `components/mobile/`, `capacitor.config.ts`, `android/app/src/main/AndroidManifest.xml`, `android/app/build.gradle`, `vitest.config.ts`, existing tests; backend `app.ts` (health, CORS, rate limits), auth/catalog/book-copies/circulation schemas (read only).

## 2. Files modified
| File | Change |
|---|---|
| `frontend/src/index.css` | Unused `:root` block replaced by `@theme` tokens; shared `ak-*` animations with reduced-motion guard; scroll padding under the mobile nav. Staff Web unaffected (it uses no tokens). |
| `frontend/src/components/mobile/ui.tsx` | **New.** Field, FieldIconButton, Alert, Spinner, MobileHeader, SchoolHeader, ListState, MemberTypePicker, StrengthMeter, button/link classes, `mobileApi` (15 s timeout + friendly errors), `serverReachable`. |
| `frontend/src/components/mobile/MobileLayout.tsx` | Labelled `<nav>`, `aria-current`, 64 px targets, tokens. |
| `frontend/src/components/mobile/MobileProtected.tsx` | Remembers the requested page when redirecting to sign-in. |
| `frontend/src/components/mobile/GoogleSignInButton.tsx` | Tokens, status roles, wording. |
| `frontend/src/features/mobile/*.tsx` (8 screens) | Rebuilt on the shared blocks; details below. |
| `frontend/src/tests/mobile.test.tsx` | **New.** 30 tests. |
| `frontend/vitest.config.ts` | `css.include: [/index\.css/]` so the token test can read `index.css` (Vitest returns empty CSS by default). |
| `frontend/scripts/run-android.sh` | **New.** Build, sync, install on a USB phone, `adb reverse`. |
| `DESIGN.md` | Tokens, WCAG 2.2 AA standard, mobile conventions. |

Not modified: Staff Web/Desktop files, `App.tsx`, `lib/api.ts`, `features/auth/auth.tsx`, backend, Prisma, migrations, seed, `.env`.

## 3. Design token changes (Implemented; contrast Tested – passed)
| Token | Value | Purpose / measured contrast |
|---|---|---|
| primary | #3354B5 | approved canonical; 6.83 under white text, 6.37 on page |
| primary-strong | #1E326D | headings, hover, header gradient; 12.12 under white |
| primary-soft | #EAF0FF | tinted surfaces; primary text on it 5.98 |
| on-primary | #FFFFFF | |
| accent / on-accent | #F0F000 / #123A78 | decorative yellow; 9.03 |
| page / surface | #F5F7FC / #FFFFFF | |
| ink | #202A3B | body text |
| ink-muted | #5B6578 | replaces #64748B (was 4.44 on page, failed); now 5.48 page / 5.87 surface / 5.15 primary-soft |
| line | #DCE3F0 | decorative dividers only |
| line-strong | #7B88A1 | input/control boundaries; 3.57 surface (was 1.29) |
| focus | #3354B5 | ring; 6.83 |
| danger / danger-soft | #C42B2A / #FEF2F2 | replaces #F73B3A (3.72 failed); 5.64 surface, 5.15 soft, 5.64 under white |
| success / warning / info (+ -soft) | #15803D / #B45309 / #3354B5 | 4.79 / 4.84 / 5.98 on their soft backgrounds |

Hard-coded hex colors in Member Mobile files: 325 → 0 (guarded by a test).

## 4. Screens and components aligned (Implemented)
- **Login:** linked labels, 40 px show/hide button, `role="alert"` errors, forced 3-second wait removed, non-functional "Remember me" removed, unreachable server reported as such (not "invalid password"), returns to the requested page after sign-in.
- **Register:** linked labels with per-field required errors, fieldset/legend + `aria-pressed` Student/Teacher toggle, member type now saved through the existing `PATCH /auth/profile`, forced wait removed, success screen continues into the app (registration already signs in).
- **Forgot Password:** shared fields, code input with `autocomplete="one-time-code"`, resend restarts the cooldown (previously did not), friendly network errors.
- **Home:** fake "4.5" rating removed; Open Library fallback labelled "Available" removed (Featured shows school catalog only, with an honest empty state and a clearly-labelled link to Open Library); quick menu now Catalog / History / My Account; search opens Catalog with the query; non-functional bell removed; due-soon uses warning tokens.
- **Catalog:** labelled search, 300 ms debounce, stale-error bug fixed, retry, availability as "X of Y available".
- **History:** plain-language status (Borrowed / Overdue / Returned) using business rule 7; due date red only when overdue; retry.
- **Profile:** keyboard-reachable photo picker, photos resized to 256 px before upload, sign-out confirmation step, role shown correctly after session restore.
- **Open Library:** labelled as internet books; native `<dialog>` (Escape, focus trap, modal semantics); named Back/Close buttons; timeouts.
- **Layout:** labelled bottom nav with `aria-current`; focused items kept clear of the fixed nav.

## 5. Accessibility improvements (Implemented)
Visible `:focus-visible` rings; 3:1 input boundaries; programmatic labels/hints/errors (`aria-describedby`, `aria-invalid`); names for every icon-only control; `role="alert"`/`role="status"` messages; one `<h1>` per screen with ordered `h2`; real buttons/links instead of clickable `<div>`s; reduced-motion support; targets ≥ 40 px for icon buttons and 48 px for primary actions.

## 6. WCAG 2.2 AA criteria checked
See section 8 for the browser audit. Automated checks do not establish full WCAG conformance; screen-reader testing (TalkBack) was not performed.

| Criterion | Method | Result |
|---|---|---|
| 1.4.3 Contrast (Minimum) | Computed token pairs (unit test) | Tested – passed |
| 1.4.11 Non-text Contrast | Computed (input boundary, focus ring) | Tested – passed |
| 1.4.10 Reflow | Headless Chrome at 320 px | Tested – passed (automated; see §8) |
| 2.1.1 Keyboard | Tab walk (14 steps per screen) | Tested – passed (automated; see §8) |
| 2.4.7 Focus Visible | Tab walk: computed ring per focused element | Tested – passed (automated; see §8) |
| 2.4.11 Focus Not Obscured | Tab walk: focused element vs. bottom nav | Tested – passed (automated; see §8) |
| 2.5.8 Target Size | Measured all interactive elements | Tested – passed (automated; see §8) |
| 3.3.1 Error Identification | Unit tests (`role="alert"` text) | Tested – passed |
| 3.3.2 Labels or Instructions | Unit tests (`getByLabelText`) + audit (unnamed controls) | Tested – passed (automated) |
| 4.1.2 Name, Role, Value | Unit tests (nav `aria-current`, toggle names) + audit | Tested – passed (automated) |

## 7. Automated test results
Commands run in `frontend/`:
- `npm test` → **5 files, 36 tests passed** (baseline 4 files / 6 tests). Tested – passed.
- `npx tsc -b` → exit 0. Tested – passed.
- `npm run build` → exit 0; JS 505.1 kB (baseline 519.8 kB); >500 kB chunk warning remains. Tested – passed.
- `npm run lint` → exit 0; 0 errors, 13 warnings (baseline 10). New warnings: `only-export-components` in `ui.tsx` (dev hot-reload only). Remaining `set-state-in-effect` warnings follow the existing data-loading pattern.

## 8. Manual and browser test results
Headless Google Chrome driven through the DevTools protocol (no new dependencies), Android WebView user agent, production build (`vite preview`), backend on port 3000 pointed at **aklatone_e2e** with fictional records (members "e2e_member", "e2e_member2"; three fictional books; one loan). Auth rate limit raised for the test run only (`AUTH_RATE_LIMIT_MAX=1000` env override). Script: scratchpad `audit.mjs` (not committed).

Viewports: 320×640, 412×915 (typical Android), 430×932 (large), 915×412 (landscape). Screens: Login, Register, Forgot Password, Home, Catalog, History, Profile, Open Library (32 combinations).

| Check | Result |
|---|---|
| Horizontal overflow (1.4.10) | None on all 32 combinations. Tested – passed |
| Targets under 24×24 px (2.5.8) | None (after fixing "Back to Sign In", 99×19 → ≥24). Tested – passed |
| Controls without accessible name (4.1.2) | 0 on every screen. Tested – passed |
| Heading structure | Exactly one `<h1>` per screen, `<h2>` sections. Tested – passed |
| Focus visible (2.4.7), 320 and 412 px | 12–14 Tab stops per screen, every focused element had a visible ring. Tested – passed |
| Focus not obscured by bottom nav (2.4.11) | 0 obscured. Tested – passed |
| Deep link after session restore | `/m/catalog`, `/m/history`, `/m/profile`, `/m/openlibrary` open on the requested screen. Tested – passed |
| Visual review of screenshots | Home, History (320), Login, landscape Home reviewed. Tested – passed |

Limits: the Tab walk covers the first 12–14 focusable elements per screen; reduced-motion was verified in CSS only; TalkBack and Android font scaling were not tested; physical phone not tested.

Findings during testing that were fixed: undersized "Back to Sign In" link; deep links lost after session restore; Profile would render the role object returned by `/auth/me` (React crash) — now shows the role name.

## 9. Build and Capacitor validation
- `npx cap sync android` → success. Tested – passed.
- `cd android && ./gradlew assembleDebug` → BUILD SUCCESSFUL; `app-debug.apk` 8.2 MB contains the new UI. Tested – passed.
- Install on a physical phone → **Not tested** (no device connected). Use `bash frontend/scripts/run-android.sh`.

## 10. Known limitations and unresolved issues
- **Shared auth (out of scope, reported):** `/auth/me` returns `role` as an object and omits `permissions`, while `/auth/login` returns a role string and permissions. Mobile handles it in Profile; Staff Web's `hasPerm` would fail after a session restore. Needs a backend or `auth.tsx` fix.
- **Rate limit (backend, reported):** `/auth/me` is under the 30-requests-per-15-minutes auth limiter, and `auth.tsx` drops the saved session on any non-success, including 429. Many members behind one school IP could be signed out. Needs a backend decision.
- **Login vs. unreachable server:** detected with a `/health` probe because `auth.login` returns `false` for both; a 429 on login still shows "Invalid username or password".
- **Session restore flash:** on a cold start the sign-in screen can appear briefly before the saved session loads (shared `auth.tsx` marks "ready" before `/auth/me` returns). The member now returns to the requested page.
- **Background banner** `docs/reference/tnhs-background-image.png`: spells "TACUMPAY"; not used. No portrait image exists.
- `frontend/.env` defines `VITE_API_BASE_URL` twice (not edited).
- Token stored in `localStorage`; `capacitor-secure-storage-plugin` is installed but unused (shared `auth.tsx`).
- Google sign-up shows "Account created" even when it signs in to an existing account.
- `avatarUrl` is sent as a `data:` URL; whether the backend's `z.string().url()` accepts it was **Not tested**.
- Screen reader (TalkBack), Android font scaling, and physical-device testing: **Not tested**.
- Staff Web and Staff Desktop still use hard-coded colors: **Deferred**.

## 11. Addendum (2026-11-20) — Home screen redesign
Requested by the developer. **Implemented; Tested – passed** (automated + screenshots at 320, 412 px and landscape; no overflow, no targets < 24 px, no unnamed controls, focus visible).
- Content sits on a curved panel (`rounded-t-[2.5rem]`) overlapping the header, with its own frosted background: `tnhs-quadrangle.jpg` blurred 28px under a 90% `page` wash (muted text ≥ 4.7:1 on the darkest blend).
- Search: shorter pill field (max 16rem) floating centred on the curved edge; separate 48px round button with a magnifier icon, named "Search the catalog".
- Quick Menu: larger square tiles with gradients — Catalog blue (`primary → primary-strong`, white text ≥ 6.8:1), History green (`success → success-strong`, white ≥ 5.0:1), My Account yellow (`accent-soft → accent-strong`, navy `on-accent` ≥ 5.7:1). Compact horizontal tiles in landscape.
- New tokens: `accent-soft #FDE047`, `accent-strong #EAB308`, `success-strong #14532D` (contrast covered by unit tests; frontend now 40 tests).

### Pending developer approval (blocked in this session)
Backend/shared-auth fixes were attempted and blocked because the task rules forbid backend changes: (1) `/auth/me` returning the same shape as `/auth/login`; (2) exempting `/auth/me` and `/auth/profile` from the 30/15 min auth limiter; (3) `auth.tsx` keeping the session on 429/network errors.

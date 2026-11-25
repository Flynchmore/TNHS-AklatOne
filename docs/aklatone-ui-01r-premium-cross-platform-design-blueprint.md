# AklatOne UI-01R — Premium Cross-Platform Design Assessment and Visual Blueprint

## 1. Executive summary

This blueprint defines three purpose-built experiences sharing one cohesive navy/yellow/red/white identity: Staff Web (centralized administration), Staff Desktop (Tauri-wrapped staff client), and Member Mobile (Capacitor student/teacher catalogue). Each platform has distinct navigation, density, and interaction priorities while reusing API client, types, validation, and design tokens.

## 2. Reference image assessment

The supplied AklatOne reference image is inspected where available. The reference shows a navy sidebar, white content area, school-branded welcome banner, statistic cards, quick actions, recent activities, and a consistent table/form vocabulary. This blueprint preserves those structural cues while discarding sample data, names, dates, and credentials.

If reference assets are missing from `docs/reference/aklatone-cross-platform-reference.jpg`, that fact is reported; no substitute logo is fabricated.

## 3. Official logo assessment

No school-logo asset was found in the repository. The logo must be supplied by the school before final branding sign-off. Tokens below are provisional and inspired by the stated four-color identity.

## 4. Final proposed brand palette

| Token | Value | Use |
|---|---|---|
| `brand.primary` | #3050B0 | Navigation, primary buttons, active |
| `brand.primaryHover` | #254090 | Hover/pressed |
| `brand.accent` | #F0F000 | Selected state, highlight |
| `brand.danger` | #F03030 | Errors, overdue, delete |
| `brand.success` | #10B981 | Success feedback (muted) |
| `brand.bg` | #f8fafc | Page background |
| `brand.surface` | #FFFFFF | Card surface |
| `brand.text` | #1e293b | Main text |
| `brand.muted` | #64748b | Secondary text |
| `brand.border` | #e2e8f0 | Card border |

Yellow is used for highlights with dark foreground (#123A78) for contrast; not used for text on white.

## 5. Typography system

- **Family**: system-ui / Inter fallback.
- **H1**: 30px / 700.
- **H2**: 24px / 600.
- **H3**: 20px / 600.
- **Body**: 14px / 400 line-height 1.55.
- **Caption/Labels**: 12px / 500 uppercase tracking.
- **Stat value**: 26px / 700.
- **Table header**: 12px / 600 muted uppercase.
- **Button text**: 14px / 600.

No oversized decorative headings.

## 6. Spacing and layout system

- **Scale**: 4px base unit. 1 = 4px, 2 = 8px, 3 = 12px, 4 = 16px, 5 = 20px, 6 = 24px, 8 = 32px, 10 = 40px, 12 = 48px, 16 = 64px.
- **Card padding**: 16–24px.
- **Section gap**: 24px.
- **Page horizontal padding**: 16px mobile, 32px desktop.
- **Sidebar width**: 256px fixed.
- **Header height**: 64px.
- **Table row height**: 48px minimum touch target.
- **Breakpoints**: 360, 390, 768, 1280, 1440.
- Desktop content max-width: 1200px centered.

## 7. Component design specifications

- **Button**: radius 8px, height 40px (desktop) / 44px (touch), padding-x 16px. Primary blue bg, white text; hover darker; focus ring 2px blue offset 2px.
- **Icon button**: 40×40 square, aria-label required, hover bg-slate-100.
- **Input**: height 40px, border #cbd5e1, radius 8px, focus ring primary.
- **Search field**: full-width with search icon at left, radius 8px.
- **Select**: height 40px, same border/focus as input.
- **Card**: radius 12px, border #e2e8f0, shadow-sm, padding 20px.
- **StatCard**: icon badge 40×40 colored bg, value 26px bold, label 12px muted uppercase.
- **Table**: header bg-slate-50, row border-b, hover bg-slate-50, cell padding 12px. Mobile collapses to cards.
- **StatusBadge**: rounded-full, 11px font, status color-coded (AVAILABLE green, BORROWED amber, LOST slate, DAMAGED red, RETIRED slate).
- **Modal/Dialog**: max-width 480px, backdrop blur, radius 12px, shadow-lg, Escape close, focus trap.
- **ConfirmDialog**: title + body + Cancel (secondary) + destructive (red) actions.
- **Toast**: bottom-right slide-in, auto-dismiss 4s, role=status.
- **EmptyState**: centered icon + message + optional action button.
- **LoadingSkeleton**: pulse shimmer blocks matching actual layout dimensions.
- **Sidebar (Web)**: navy background, brand header, active yellow pill, bottom logout.
- **BottomNav (Mobile)**: 4 items, icon+label, active blue dot.
- **Tabs**: underline active state, role=tablist.

## 8. Staff Web screen-by-screen design

1. **Login** — centered card (max 420px) with logo, title, username/password fields, show/hide password, submit loading, inline error.
2. **Dashboard** — hero welcome, 4 stat cards, copies-by-status bars, recent activity list, quick action buttons.
3. **Catalog** — header + search/filter/create bar, table with title/authors/copies/actions, pagination footer, edit dialog with full fields.
4. **Book Copies** — summary cards + list table, status dropdown per row, delete confirm.
5. **Members** — user list with role badges, add/edit dialog, delete confirm.
6. **Circulation** — borrow/return split panels, transaction table with status filters and date range.
7. **Reports** — summary metrics, copies-by-status, popular books, overdue table, print action.
8. **Announcements** — priority-sorted feed, detail dialog, create/edit dialog.
9. **Settings/Account** — current user profile, role display, logout confirm.

## 9. Staff Desktop screen-by-screen design

- **Shell**: Tauri window, min 1100×720; navy top bar + collapsible sidebar.
- **Dashboard**: same metrics as Web but denser table columns and keyboard shortcuts (Ctrl+K search, Ctrl+N new).
- **Catalog**: full-width table, detail side panel, multi-row select, batch status actions.
- **Circulation**: two-column split (borrow form left, return form right), transaction table below.
- **Reports**: printable summary with page-break controls.
- **Sync status (future)**: pending queue badge, connection indicator, last-sync timestamp.

No offline sync is implemented in this phase.

## 10. Member Mobile screen-by-screen design

- **Login**: single centered form, large touch targets, show/hide password.
- **Home**: greeting, availability summary chip, "Browse catalog" CTA, upcoming due items.
- **Catalog**: search bar + category chip filter, book cards with cover/availability badge, infinite scroll or pagination.
- **Book Details**: title, authors, category, availability summary only (no barcodes).
- **My Loans**: active/returned tabs, due-date highlight for overdue.
- **Profile**: username, role, sign-out confirm.
- **Bottom nav**: Home, Catalog, Loans, Profile.

No staff functions visible.

## 11. Shared vs platform-specific components

Shared:
- `api.ts` client and API error handling.
- `AuthProvider` and `Protected` route guard.
- `PageHeader`, `StatCard`, `StatusBadge`, `LoadingSkeleton`, `EmptyState`, `ConfirmDialog`.
- Zod schemas and TypeScript types.

Platform-specific:
- `StaffLayout` with sidebar (Web/Desktop) vs `MobileLayout` with bottom nav (Mobile).
- Token storage (in-memory Web, OS keychain Desktop, secure storage Mobile).
- Native build configs (Tauri, Capacitor).

## 12. Navigation and information architecture

- **Staff Web/Desktop**: sidebar with Dashboard, Catalog, Copies, Circulation, Reports, Users, Logout.
- **Member Mobile**: bottom nav with Home, Catalog, Loans, Profile.
- **Role gating**: same permission set across platforms (`catalog:write`, `copies:write`, `circulation:write`, `reports:read`, `users:read`).

## 13. Accessibility considerations

- Visible 2px focus ring on interactive elements.
- Minimum 44px touch targets on mobile.
- Color contrast: navy text on yellow meets AA; yellow on navy meets AA.
- `prefers-reduced-motion` disables animations.
- Semantic HTML (nav, main, table, form labels, aria-live for loading/errors).
- Keyboard-accessible modals and dropdowns.

## 14. Responsive behavior

- Desktop (1440px+): fixed sidebar + content grid.
- Laptop (1280px): same with tighter padding.
- Tablet (768px): sidebar hidden, hamburger drawer, 2-column cards.
- Mobile (390px): drawer only, stacked cards, full-width forms, bottom nav on member.
- Small mobile (360px): font scales down one step, tables become cards.

## 15. Interaction and animation principles

- Page-level fade-in on route entry (subtle).
- Button hover/press state transitions (150ms ease).
- Drawer slide with backdrop fade.
- Skeleton shimmer for loading.
- No looping or large motion.
- Respect reduced-motion throughout.

## 16. Existing implementation assessment

Current frontend already implements most staff screens with real API integration. Styling is basic Tailwind utilities; consistent tokens are being added progressively. Remaining gaps:
- Some feature pages use plain "Loading…" text instead of skeletons.
- Navigation lacks role-specific route list beyond hasPerm.
- No member-specific mobile layout.

## 17. Discrepancies in previous reports

- Some earlier reports claimed "polish" without screenshots or meaningful visual evidence. This blueprint distinguishes verified implementation from aspirational redesign.
- Tauri/Capacitor are not yet configured; previous mentions were directional only.

## 18. Recommended implementation sequence

1. Apply final brand tokens across all staff Web screens.
2. Build shared skeleton/empty/confirmation components.
3. Polish Staff Web Dashboard and Catalog.
4. Polish Book Copy Inventory and Circulation.
5. Implement Member Mobile catalog/read-only flow.
6. Package Staff Desktop (Tauri) and Member Mobile (Capacitor).

## 19. Dependencies requiring approval

- School logo asset.
- Android SDK and Gradle for Capacitor.
- Rust toolchain for Tauri.
- Design-skill confirmations before implementation.

## 20. Unresolved decisions

- Exact logo variant to use.
- Whether staff desktop needs offline storage now or later.
- Member feature set beyond read-only catalog (reservations, notifications).
- Exact grading of empty-state copy tone (formal vs friendly).
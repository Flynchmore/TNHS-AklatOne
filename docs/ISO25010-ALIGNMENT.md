# AklatOne and ISO/IEC 25010 (4-point Likert scale)

How AklatOne answers each evaluation item of the ISO/IEC 25010 questionnaire, with the evidence an evaluator can check.
The evaluators (librarian, ICT coordinator, students, teachers, IT experts) give the real ratings; the **Ready** column is
the team's own estimate (1 Strongly Disagree, 2 Disagree, 3 Agree, 4 Strongly Agree) and the **To do** column lists
what is still missing. State on 2026-11-26.

Also see: `docs/requirements-traceability-matrix.md`, `docs/school-requirements-validation-checklist.md`,
`docs/COMPATIBILITY.md`, `docs/DEPLOYMENT.md`, `docs/USER-GUIDE.md`.

## ICT Coordinator's requirements (community partner)

| Asked for | In AklatOne | Where |
|---|---|---|
| Masking: Member ID (e.g. CA…) only, name hidden to protect the student | Members, borrow requests, borrowed books, overdue lists, receipts, Visitor's Log, Top readers, suggestions, reviews, printouts show the Member ID + grade-section (or department); names are only in the edit form and the Member list printout for the principal | Staff Members, Borrowing, Printing; phone Top readers; kiosk |
| Sustainability | Runs on one small server (Docker), daily automatic backups, offline Desktop, Excel import/export, guides for the next team (README, USER-GUIDE, DEPLOYMENT, diagrams), CI tests | `docs/`, `.github/workflows/` |
| Member ID automatically assigned and unique (e.g. CA124456) | Initials + 6 random digits, unique, made by the server, shown live while the name is typed, never changes | `backend/src/modules/users/memberId.ts` |
| Section only to see (avoid technicalities and data privacy) | Grade - Section (students) or Department / Designation (teachers) next to the Member ID; email masked (ati*on@gmail.com) | Members, View, ID card |
| Counting each member's borrowed books | "N now / M in all" per member; My Books on the phone matches the server | Members list, phone My Books |
| Time spent | App time (all devices), library time from Time In / Time Out, days books are kept | Reports > Time spent, Members > View, phone Statistics |
| Books used this week | Monday-Friday chart + list of who (Member ID) borrowed what | Dashboard, Reports |
| Feedback / Suggestion box / books suggested by students | Suggestion Box (book or feedback), librarian status + reply, "Add to catalog"; written book reviews approved by the librarian | phone Suggestion Box, staff Suggestions |
| Printable Library ID | 85.6 x 54 mm cards, 8 per A4, QR = Member ID, cut lines, reprint from Members (one or selected) | Printing > Library ID cards |

## 1. Functional Suitability

| Item | Evidence in AklatOne | Ready | To do |
|---|---|---|---|
| Provides all essential functions | Catalog, copies, borrowing (requests, desk lending on the phone, returns), notices, members, Visitor's Log, reports, printing, backup, suggestions, school-issued books, lost-book documents | 4 | Confirm the school's borrowing policy (7 days / 8 books is provisional) |
| Accurate results | Server-side rules (limits, due dates in PH time, one copy never lent twice), 171 backend + 147 frontend automated tests | 4 | — |
| Helps users achieve tasks | Dashboard "Continue where you left off", quick actions, receipts, alerts, Help pages | 4 | — |
| Covers requirements across use cases | Traceability matrix; students, teachers, librarian, kiosk, offline Desktop | 3 | Walk through the matrix with the librarian; real-device test on phones |
| Meets explicit and inferred needs | Privacy masking, offline mode, Excel, emergency recovery key, teacher emergency borrowing | 3 | Collect feedback after the pilot week |

## 2. Performance Efficiency

| Item | Evidence | Ready | To do |
|---|---|---|---|
| Responds within expected time under normal load | Load test: 300 members browsing = p95 <= 61 ms on a 4-core laptop | 4 | Repeat on the Hostinger VPS after deployment |
| Uses CPU / memory efficiently | Lazy-loaded pages (main JS 109 KB gzip), covers cached on the server, Redis optional | 3 | Measure server memory on the VPS |
| Stable at peak | 1000 members: 0 errors, p95 about 1-1.5 s; per-account rate limits | 3 | Peak test on the VPS (class visit scenario) |
| Throughput of key processes | 300 simultaneous sign-ins in 7.3 s; Excel import of 5,000 rows in one transaction | 3 | — |
| Handles varying workloads | Rate limits per account, not per school Wi-Fi IP; DB pool of 20 | 3 | — |

## 3. Compatibility

| Item | Evidence | Ready | To do |
|---|---|---|---|
| Works alongside other software | Docker containers, own ports; Desktop runs next to other apps; phone app uses normal permissions | 4 | — |
| Exchanges data with other systems | Excel (.xlsx) import/export of books and reports; JSON REST API | 4 | — |
| Shares resources with minimal impact | Small images (Alpine/slim), limits on uploads (10 MB) and backups | 3 | — |
| Integrates data from external systems | Open Library covers by ISBN; Gmail (SMTP) for codes and notices | 3 | DepEd LIS / school records import is not in scope |
| Standard formats / APIs | OpenAPI 3 (`/api-docs`, tested), JSON, .xlsx, PDF printing, QR codes (ISO/IEC 18004) | 4 | — |

## 4. Interaction Capability (usability)

| Item | Evidence | Ready | To do |
|---|---|---|---|
| Users recognise it meets their needs | Welcome slides on the phone, Dashboard tiles, clear page names | 4 | — |
| New users learn quickly | **Help** pages in the phone (Settings > Help) and staff Settings > Help (added 2026-11-26), USER-GUIDE.md | 4 | Short training for the librarian |
| Core tasks straightforward | One-tap scan, Ctrl+K search, filters on every list, receipts | 4 | — |
| Prevents errors | Input rules (digits only, names, lengths), Member ID format, confirmations (deactivate, delete, restore = type RESTORE), grade-section format | 4 | — |
| Engaging UI | Consistent design, dark mode, charts, Top readers, reading goal | 4 | Usability survey with students (SUS) after the pilot |

## 5. Reliability

| Item | Evidence | Ready | To do |
|---|---|---|---|
| Works consistently without faults | CI on every push (backend, frontend, desktop, Android, iOS, Docker) | 4 | — |
| Available when needed | Docker `restart: unless-stopped`, health checks, `/health`, System status page | 3 | Uptime monitor (e.g. UptimeRobot) on the VPS |
| Resilient to minor faults | Redis fallback to memory, Desktop offline mode with automatic upload, kiosk keeps scans offline, phone shows saved data | 4 | — |
| Recovers data after interruption | Nightly encrypted backup (14 kept), restore with safety copy first (tested end to end), Idempotency-Key uploads | 4 | Off-site copy (`scripts/offsite-backup.sh`) to be scheduled |
| Prevents downtime | Restore lock (other requests get a clear 503), migrations at start-up | 3 | — |

## 6. Security

| Item | Evidence | Ready | To do |
|---|---|---|---|
| Access for authorised users only | Role-based permissions (Admin, Librarian, Member, Kiosk), staff portal blocks members, tested (security.test.ts) | 4 | — |
| Prevents unauthorised changes | Validation on the server (zod), conflict check (409), least-privilege DB user in production | 4 | — |
| Logs and traces | Audit log of every staff action and sign-in (with IP), "What you did last" | 4 | — |
| Authenticates identities | Password (bcrypt) + emailed code every sign-in, sessions per device, sign-out of devices, idle sign-out, recovery key | 4 | — |
| Sustains operations under threats | Rate limits, CSP and security headers, HTTPS (Caddy), CodeQL + Dependabot, uploads checked by content | 3 | Penetration test by the ICT coordinator; dismiss the glib (Rust) alert with its reason |

## 7. Maintainability

| Item | Evidence | Ready | To do |
|---|---|---|---|
| Modular structure | Modular monolith: one module per area (`backend/src/modules/*`), one shared frontend for three apps | 4 | — |
| Reusable components | Shared UI kit (staff/ui, mobile/ui), Scanner, PrintPreview, Charts, paper module | 4 | — |
| Easy to analyse change impact | TypeScript everywhere, OpenAPI test fails on undocumented routes, PROJECT_CONTEXT log | 4 | — |
| Modified without new issues | 318+ automated tests, lint, typecheck, CI | 4 | — |
| Test criteria applicable | Vitest (backend on a separate e2e DB, frontend), Rust tests, opt-in restore test | 4 | Playwright end-to-end tests are planned |

## 8. Flexibility (portability)

| Item | Evidence | Ready | To do |
|---|---|---|---|
| Adapts to hardware / software | Web (Chrome, Edge, Firefox, Safari), Windows and Linux Desktop, Android 8+, iOS 16.4+ | 3 | iOS build needs a Mac; real phones still to test |
| Scales with workload | Stateless API behind Caddy, Redis for shared limits; bigger VPS plan | 3 | One API process by design (restore lock in memory) |
| Smooth install / uninstall | `scripts/docker-setup.sh` (one command), Desktop installers, APK download QR poster | 4 | — |
| Can replace similar software | Excel import of the old catalog, printouts with the DepEd header | 3 | Import of the school's existing records when they share them |
| Adjusts to new requirements | Settings for loan rules in one file, documented decisions, plan files | 4 | — |

## 9. Safety

| Item | Evidence | Ready | To do |
|---|---|---|---|
| Operates within safe limits | Limits: 8 books, 10 MB files, 5 suggestions a day, wrong-password lockouts, 30-minute idle sign-out | 4 | — |
| Identifies and manages risks | System status page in plain words, overdue / due-soon reminders, warnings before deleting or restoring | 4 | — |
| Safe mode on failure | Desktop and phone fall back to read-only saved data, restore puts the API in maintenance (503), kiosk queues scans | 3 | — |
| Timely, clear hazard warnings | Red confirmations, "type RESTORE", "type the Member ID" before deleting, offline banners | 4 | — |
| Safe with other components | Uploaded files never shown inline (download only, nosniff), Desktop never leaves AklatOne except the two Facebook pages | 4 | — |

## Next steps to raise the 3s

1. Deploy on the Hostinger VPS, then repeat the load test and add an uptime monitor (Performance, Reliability).
2. Test on real Android phones and one iPhone (Flexibility, Functional Suitability).
3. Pilot week with the librarian and two sections; collect the 4-point Likert survey and a SUS questionnaire (Interaction).
4. Schedule the off-site backup copy (Reliability) and have the ICT coordinator run a security check (Security).

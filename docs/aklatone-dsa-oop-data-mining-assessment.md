# AklatOne — Technical Concepts Audit: DSA, OOP, and Data Mining

## 1. Executive summary

AklatOne's backend already uses real algorithms for searching, filtering, sorting, and transactions. It applies object-oriented-style modularity (singletons, service modules, typed middleware) without classical OOP inheritance. Data Mining is not implemented; current reports are descriptive aggregates. Recommended focus: query efficiency, service extraction, and optional descriptive analytics — not predictive profiling.

## 2. DSA implementation assessment

### Existing algorithms and data structures

| Area | Implementation | Purpose | Complexity (approx.) |
|---|---|---|---|
| Search | Prisma `contains` filters on `title`, `authors`, `isbn` | Catalog text search | O(n) DB-side substring scan |
| Filtering | `where` objects built from query params | Category/status/date filters | O(n) per filtered field |
| Sorting | `orderBy` on whitelist fields (title, authors, publishedYear, createdAt, updatedAt) | Stable catalog ordering | O(n log n) via DB index |
| Pagination | `take`/`skip` with `limit`/`offset` + total count | Bounded result pages | O(page size) per query |
| Status transitions | Conditional `updateMany` guarded by `status = AVAILABLE` | Atomic borrow | O(1) conditional update |
| Return | `updateMany` guarded by `status = ACTIVE` | Atomic return | O(1) conditional update |
| Popular books | GroupBy on `bookCopyId` → map to title | Aggregate demand count | O(n) rows scanned |
| Report aggregation | `groupBy`, `count` on transaction status/dueAt | Statistical summaries | O(n) per aggregation |

### Performance notes
- No algorithmic complexity red flags for school scale (~2k students).
- `popular-books` performs a `findMany` on `bookCopy` IDs and maps to titles; this is an acceptable N+1 trade-off for the current dataset size. If transaction volume grows, this should become a JOIN aggregate instead of a row-by-row map.
- All list endpoints are paginated (limit 1–100, default 50), preventing unbounded result sets.

### No verified gaps
- No missing indexes beyond what the schema declares.
- No evidence of O(n²) client-side loops in production logic.

## 3. OOP implementation assessment

### Present
- **Singleton Prisma client** in `src/config/prisma.ts` (globalForPrisma caching).
- **Module-level service functions** in `auth.service.ts` (hash, verify, sign, register).
- **Typed interfaces** for `AuthUser`, `AuditEvent`, `ApiResponse`.
- **Middleware factories** (`requirePermission`, `validate`) as composable functions.
- **Declarative route modules** with dependency inversion via config imports.
- **Transaction-safe audit utility** `writeAuditTx`.

### Absent (no need to add)
- No classical class inheritance hierarchies (Express idioms prefer functional middleware).
- No DI container or decorator-based services (would be over-engineering for solo dev).

### Recommendations
- Extract Prisma query logic from routes into small service modules if modules grow large (catalog is already split; book-copies and reports benefit similarly).
- Keep functional middleware; do not convert to class-based OOP.

## 4. Data Mining assessment

### Current state
- Reports provide descriptive aggregates (counts, grouped statuses) only.
- No association-rule mining, clustering, or trend prediction exists.

### Feasible future analytics (optional, descriptive only)
| Candidate | Data available? | Effort | Value |
|---|---|---|---|
| Popular books by borrow count | `BorrowingTransaction` rows | Low | High |
| Category demand heatmap | Book.category + copies count | Low | Medium |
| Monthly borrow trend (seasonality) | `borrowedAt` timestamps | Medium | Medium |
| Collection utilization % (borrowed / total) | BookCopy.status | Low | High |

### Privacy
- Analytics must remain aggregated; never profile individual students.
- Borrower fields should be excluded or pseudonymized.

### Deferred ideas
- Predictive overdue-risk scoring (needs sufficient history + school approval).
- Association-rule mining of co-borrowed pairs (requires larger dataset; low solo-dev ROI).

## 5. Source evidence
- `backend/prisma/schema.prisma`
- `backend/src/modules/catalog/catalog.routes.ts`
- `backend/src/modules/book-copies/bookCopies.routes.ts`
- `backend/src/modules/circulation/circulation.routes.ts`
- `backend/src/modules/reports/reports.routes.ts`
- `backend/src/common/audit.ts`

## 6. Recommended applications

A. **DSA**
- Replace `popular-books` row-by-row map with a JOIN aggregate in future optimization (defer unless query becomes hot).
- Keep conditional updateMany for circulation correctness.

B. **OOP**
- If `reports.routes.ts` grows beyond ~150 lines, extract aggregation helpers into `reports.service.ts` with typed result shapes. No inheritance needed.

C. **Data Mining (optional)**
- Add a `/reports/trends` endpoint that groups borrow counts by month and by category (descriptive only).
- Validates against real borrowing history; does not reveal borrower identity.

## 7. Prioritized implementation roadmap

1. Verify current schema indexes are used by production queries (already present).
2. Add service-level aggregation helpers for future analytics (optional).
3. Defer predictive features until school approves and data volume is sufficient.

## 8. Deferred and rejected ideas
- Association-rule mining (low value, complexity).
- Student risk scoring (privacy risk).
- Custom in-memory sorting algorithms (Prisma/DB handles sorting natively).

## 9. Safety and privacy
- No personal data in analytics aggregates.
- Audit logs capture mutation actors, not content.
- Do not expose borrower PII in any analytics response.

## 10. Tests or inspections performed
- Source inspection (Prisma schema, routes, service, audit).
- Backend 44 tests pass; typecheck pass; build pass; Prisma validate pass.

## 11. Unresolved questions
- Whether historical data is sufficient for meaningful seasonal trends.
- Whether library personnel want aggregated trend reporting.
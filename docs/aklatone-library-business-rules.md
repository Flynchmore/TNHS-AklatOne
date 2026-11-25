# AklatOne Library Business Rules (Provisional)

1. A book can have multiple physical copies.
2. A copy cannot be borrowed by two members simultaneously (conditional updateMany on AVAILABLE).
3. Only eligible MEMBER accounts can borrow books (role check).
4. ADMIN and LIBRARIAN manage library operations according to permissions.
5. Only valid copy statuses can transition (borrowed cannot be marked available directly; retired cannot change).
6. Returning a book updates copy status to AVAILABLE and transaction to RETURNED atomically.
7. Overdue determined by dueAt < now and status ACTIVE.
8. Borrowing/returning are transaction-safe with audit logging.
9. Audit logs record staff actions (create/update/delete/borrow/return/status change).
10. Public catalog exposes only availability summary (total/available), not internal copy details.

## Provisional (requires school confirmation)
- Borrowing limits (none enforced)
- Loan duration (dueAt optional)
- Overdue penalties (none)
- Renewal rules (none)
- Reservation rules (none)
- Student/teacher identification requirements (username only)
## Borrow request workflow (added 2026-11-20, chosen by the developer; PROVISIONAL)
11. Members request a book from the app; a librarian approves or declines (Staff Web/Desktop: Borrow Requests).
12. Approval lends one AVAILABLE copy, sets dueAt = approval + 7 days, issues a receipt number (AK-YYYYMMDD-XXXXXX), and notifies the member.
13. A member may hold at most 8 books (active loans + pending requests). No duplicate pending request for the same book; a request needs an available copy.
14. Librarians may send an overdue notice for any active loan.
15. On physical return the librarian records the outcome: returned on time, returned late (overdue), returned torn/damaged (copy -> DAMAGED), or missing (loan -> LOST, copy -> LOST). If not chosen, on time/late is decided from dueAt.
16. Members see requests, loans, receipts, alerts, and their borrowing history with each outcome (Profile / History).
Loan period (7 days) and limit (8 books) are set in backend/src/config/loanPolicy.ts (developer decision 2026-11-25; was 3 books).

## Catalog details and ratings (added 2026-11-20, developer decision)
17. Librarians enter book details on Staff Web/Desktop (Books page): title, author, publisher, published year, ISBN (optional, shown as N/A), serial number (library code, e.g. NMT-001, unique), copies, and a short description (max 2,000 characters). Members see exactly these details in the mobile Catalog.
18. Availability shown to members: "Available · X of Y copies", "All copies borrowed" (copies exist, none on the shelf), or "Unavailable at the moment" (no copies registered).
19. Only members who have borrowed a book (any loan that was not cancelled) may rate it 1-5 stars; one rating per member per book, changeable. Staff see the average and count. (Decided by the developer 2026-11-20.)
20. Views: a member's view counts after they stay on a book's details for 12 seconds, at most once per member per book per 24 hours. "Times borrowed" counts every non-cancelled loan of any copy.
21. Books added within the last 7 days show a "New" tag in the mobile app.
22. Alerts serve two purposes: (a) notices from the librarian — overdue notices and advance "return reminders" for books not yet due, sent from Staff Web/Desktop (Borrowed Books) with an editable message; (b) updates about the member's requests and returns (approved, declined, return recorded). Notices cannot be sent for books already returned. (Developer decision 2026-11-20; no automatic/scheduled reminders yet.)
23. Members may remove finished items (declined, cancelled, returned) from My Books > History by swiping right; this only hides them for the member (BorrowRequest.memberHiddenAt) — the library's records are kept. Members may delete their own update alerts (approved / declined / return recorded); librarian notices (overdue, return reminders) cannot be deleted by members. (Developer decision 2026-11-20.)
24. Bottom-nav badges (Catalog: new books; My Books: request decisions; Alerts: new unread alerts; Profile: returns recorded) count items since the member last opened that tab on this phone, and clear when the tab is opened. The Alerts bell keeps ringing while a new unread librarian notice exists, until Alerts is opened. Home has no badge.

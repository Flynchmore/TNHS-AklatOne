# Database Index Review

Added:
- BookCopy: (bookId, status)
- BorrowingTransaction: (status, dueAt), (borrowerId, status)

Existing:
- Unique: username, email, isbn, barcode, category name, role name
- FK indexes on roleId, bookId, borrowerId, actorId
- Status and date indexes

Rationale: supports catalog filtering, copy availability checks, overdue reports, borrower history.
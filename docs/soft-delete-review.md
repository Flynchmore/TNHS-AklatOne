# Soft Delete / Archiving Review

## Current deletion behavior
- Category: hard delete. Blocked if books reference? Category-Book many-to-many; deleting category removes relation.
- Book: hard delete. Blocked if copies have borrowing transactions (FK restrict).
- BookCopy: hard delete. Blocked if transactions exist (FK restrict).
- User: no delete endpoint; deactivation via isActive recommended.
- BorrowingTransaction: no delete endpoint; history preserved.

## Recommendation
- Prefer soft delete (`deletedAt`) for User, Book, Category, BookCopy.
- Never delete BorrowingTransaction.
- Add `deletedAt` nullable timestamp and filter in queries.
- Requires migration and query updates; defer implementation until interview confirms retention policy.
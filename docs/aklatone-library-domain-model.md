# AklatOne Library Domain Model

## Entities
- User (id, username, passwordHash, displayName?, email?, isActive, roleId, timestamps)
- Role (id, name, description, permissions Json)
- Category (id, name, description, timestamps)
- Book (id, title, subtitle?, isbn? unique, authors?, publisher?, publishedYear?, description?, timestamps)
- BookCopy (id, bookId, barcode unique, status, location?, acquiredAt?, notes?, timestamps)
- BorrowingTransaction (id, bookCopyId, borrowerId, status, borrowedAt, dueAt?, returnedAt?, notes?, timestamps)
- AuditLog (id, actorId?, action, entityType, entityId?, metadata?, createdAt)

## Relationships
- Role 1:N User
- Category N:N Book (implicit)
- Book 1:N BookCopy
- BookCopy 1:N BorrowingTransaction
- User 1:N BorrowingTransaction (as borrower)
- User 1:N AuditLog (as actor)

## Constraints
- Book.isbn unique
- BookCopy.barcode unique
- Category.name unique
- User.username unique
- Role.name unique
- FK: BookCopy.bookId -> Book (Cascade)
- FK: BorrowingTransaction.bookCopyId -> BookCopy (Restrict)
- FK: BorrowingTransaction.borrowerId -> User (Restrict)
- FK: AuditLog.actorId -> User (SetNull)
- FK: User.roleId -> Role (Restrict)

## Indexes
- Book: title, authors
- BookCopy: bookId, status, (bookId,status)
- BorrowingTransaction: bookCopyId, borrowerId, status, borrowedAt, (status,dueAt), (borrowerId,status)
- AuditLog: actorId, action, (entityType,entityId), createdAt
- Category: name
- User: roleId, isActive
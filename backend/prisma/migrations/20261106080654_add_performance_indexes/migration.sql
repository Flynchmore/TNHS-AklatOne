-- CreateIndex
CREATE INDEX `BookCopy_bookId_status_idx` ON `BookCopy`(`bookId`, `status`);

-- CreateIndex
CREATE INDEX `BorrowingTransaction_status_dueAt_idx` ON `BorrowingTransaction`(`status`, `dueAt`);

-- CreateIndex
CREATE INDEX `BorrowingTransaction_borrowerId_status_idx` ON `BorrowingTransaction`(`borrowerId`, `status`);

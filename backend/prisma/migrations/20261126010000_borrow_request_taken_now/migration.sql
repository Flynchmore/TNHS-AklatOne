-- Teacher emergency borrowing: the request says the book was already taken (no librarian in the library).
ALTER TABLE `BorrowRequest` ADD COLUMN `takenNow` BOOLEAN NOT NULL DEFAULT false;

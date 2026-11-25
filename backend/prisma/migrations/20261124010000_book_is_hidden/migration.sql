-- Books can be hidden from members (Excel import "hide books not in the file") without deleting them.
ALTER TABLE `Book` ADD COLUMN `isHidden` BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX `Book_isHidden_idx` ON `Book`(`isHidden`);

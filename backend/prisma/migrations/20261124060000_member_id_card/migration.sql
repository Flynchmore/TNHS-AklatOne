-- Member ID (masked ID) for the Library ID card, and when the card was printed.
-- AlterTable
ALTER TABLE `User` ADD COLUMN `cardPrintedAt` DATETIME(3) NULL,
    ADD COLUMN `maskedId` VARCHAR(16) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_maskedId_key` ON `User`(`maskedId`);


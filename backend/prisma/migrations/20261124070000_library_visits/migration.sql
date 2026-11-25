-- Visitor's Log: library visits with Time In / Time Out.
-- CreateTable
CREATE TABLE `LibraryVisit` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `day` VARCHAR(10) NOT NULL,
    `timeIn` DATETIME(3) NOT NULL,
    `timeOut` DATETIME(3) NULL,
    `source` VARCHAR(10) NOT NULL DEFAULT 'kiosk',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LibraryVisit_day_idx`(`day`),
    INDEX `LibraryVisit_memberId_day_idx`(`memberId`, `day`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LibraryVisit` ADD CONSTRAINT `LibraryVisit_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


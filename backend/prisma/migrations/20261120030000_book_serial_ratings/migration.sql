-- AlterTable
ALTER TABLE `Book` ADD COLUMN `serialNumber` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `BookRating` (
    `id` VARCHAR(191) NOT NULL,
    `bookId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `stars` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BookRating_bookId_idx`(`bookId`),
    UNIQUE INDEX `BookRating_bookId_memberId_key`(`bookId`, `memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Book_serialNumber_key` ON `Book`(`serialNumber`);

-- AddForeignKey
ALTER TABLE `BookRating` ADD CONSTRAINT `BookRating_bookId_fkey` FOREIGN KEY (`bookId`) REFERENCES `Book`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookRating` ADD CONSTRAINT `BookRating_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


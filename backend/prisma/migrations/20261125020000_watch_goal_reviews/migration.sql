-- AlterTable
ALTER TABLE `BookRating` ADD COLUMN `review` VARCHAR(500) NULL,
    ADD COLUMN `reviewStatus` VARCHAR(12) NULL,
    ADD COLUMN `reviewedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `readingGoal` INTEGER NULL;

-- CreateTable
CREATE TABLE `BookWatch` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `bookId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BookWatch_bookId_idx`(`bookId`),
    UNIQUE INDEX `BookWatch_userId_bookId_key`(`userId`, `bookId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `BookRating_reviewStatus_idx` ON `BookRating`(`reviewStatus`);

-- AddForeignKey
ALTER TABLE `BookWatch` ADD CONSTRAINT `BookWatch_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookWatch` ADD CONSTRAINT `BookWatch_bookId_fkey` FOREIGN KEY (`bookId`) REFERENCES `Book`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


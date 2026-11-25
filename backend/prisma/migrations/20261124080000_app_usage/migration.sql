-- Time spent in the apps per user, day and platform.
-- CreateTable
CREATE TABLE `AppUsage` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `day` VARCHAR(10) NOT NULL,
    `platform` VARCHAR(10) NOT NULL,
    `seconds` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AppUsage_day_idx`(`day`),
    UNIQUE INDEX `AppUsage_userId_day_platform_key`(`userId`, `day`, `platform`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AppUsage` ADD CONSTRAINT `AppUsage_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


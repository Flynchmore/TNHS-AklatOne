-- Suggestion Box: book suggestions and feedback from members.
-- CreateTable
CREATE TABLE `Suggestion` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(10) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `author` VARCHAR(150) NULL,
    `message` TEXT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'NEW',
    `reply` VARCHAR(500) NULL,
    `repliedById` VARCHAR(191) NULL,
    `repliedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Suggestion_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `Suggestion_memberId_createdAt_idx`(`memberId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Suggestion` ADD CONSTRAINT `Suggestion_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Replay records for writes sent with an Idempotency-Key header (Desktop offline upload).
CREATE TABLE `IdempotencyKey` (
    `key` VARCHAR(100) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `method` VARCHAR(10) NOT NULL,
    `path` VARCHAR(255) NOT NULL,
    `status` INTEGER NOT NULL,
    `body` MEDIUMTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `IdempotencyKey_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

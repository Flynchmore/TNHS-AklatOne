-- CreateTable
CREATE TABLE `LibraryRecovery` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `keyHash` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


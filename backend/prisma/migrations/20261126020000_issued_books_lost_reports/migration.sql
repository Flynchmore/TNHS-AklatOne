-- School-issued books kept by members for the school year, and lost-book apology / report documents.

-- CreateTable
CREATE TABLE `IssuedBook` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `subject` VARCHAR(100) NULL,
    `code` VARCHAR(60) NULL,
    `condition` VARCHAR(100) NULL,
    `schoolYear` VARCHAR(20) NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'ISSUED',
    `checkedAt` DATETIME(3) NULL,
    `checkedById` VARCHAR(191) NULL,
    `returnedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `IssuedBook_memberId_idx`(`memberId`),
    INDEX `IssuedBook_schoolYear_status_idx`(`schoolYear`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LostReport` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `transactionId` VARCHAR(191) NULL,
    `kind` VARCHAR(12) NOT NULL,
    `message` VARCHAR(1000) NULL,
    `fileName` VARCHAR(200) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `size` INTEGER NOT NULL,
    `storedAs` VARCHAR(100) NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'SUBMITTED',
    `note` VARCHAR(300) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LostReport_memberId_idx`(`memberId`),
    INDEX `LostReport_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `IssuedBook` ADD CONSTRAINT `IssuedBook_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LostReport` ADD CONSTRAINT `LostReport_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

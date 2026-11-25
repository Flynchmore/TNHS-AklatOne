-- Inventory audit (stocktake): scans of copies on the shelf, and the last time each copy was verified.
-- AlterTable
ALTER TABLE `BookCopy` ADD COLUMN `lastVerifiedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `InventoryAudit` (
    `id` VARCHAR(191) NOT NULL,
    `note` VARCHAR(255) NULL,
    `startedById` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,

    INDEX `InventoryAudit_closedAt_idx`(`closedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InventoryScan` (
    `id` VARCHAR(191) NOT NULL,
    `auditId` VARCHAR(191) NOT NULL,
    `bookCopyId` VARCHAR(191) NOT NULL,
    `scannedById` VARCHAR(191) NOT NULL,
    `scannedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InventoryScan_bookCopyId_idx`(`bookCopyId`),
    UNIQUE INDEX `InventoryScan_auditId_bookCopyId_key`(`auditId`, `bookCopyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `InventoryScan` ADD CONSTRAINT `InventoryScan_auditId_fkey` FOREIGN KEY (`auditId`) REFERENCES `InventoryAudit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryScan` ADD CONSTRAINT `InventoryScan_bookCopyId_fkey` FOREIGN KEY (`bookCopyId`) REFERENCES `BookCopy`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


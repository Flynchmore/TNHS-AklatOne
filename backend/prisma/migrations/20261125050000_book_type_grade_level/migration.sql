-- AlterTable
ALTER TABLE `Book` ADD COLUMN `bookType` VARCHAR(30) NULL,
    ADD COLUMN `gradeLevel` VARCHAR(20) NULL;

-- CreateIndex
CREATE INDEX `Book_gradeLevel_idx` ON `Book`(`gradeLevel`);


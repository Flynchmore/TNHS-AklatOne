-- AlterTable
ALTER TABLE `User` DROP COLUMN `phoneNumber`,
    ADD COLUMN `activationPending` BOOLEAN NOT NULL DEFAULT false;


-- Sign-in tokens issued before this time are no longer accepted (deactivated account, changed or reset password).
ALTER TABLE `User` ADD COLUMN `sessionsRevokedAt` DATETIME(3) NULL;

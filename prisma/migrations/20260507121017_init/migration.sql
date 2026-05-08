-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(36) NOT NULL,
    `username` VARCHAR(50) NOT NULL,
    `email` VARCHAR(100) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `role` ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `writeups` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `ctfName` VARCHAR(100) NOT NULL,
    `category` ENUM('WEB', 'PWN', 'CRYPTO', 'FORENSICS', 'MISC', 'REV', 'OSINT') NOT NULL,
    `difficulty` ENUM('EASY', 'MEDIUM', 'HARD', 'INSANE') NOT NULL,
    `flag` VARCHAR(255) NULL,
    `description` TEXT NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `writeups_userId_idx`(`userId`),
    INDEX `writeups_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `steps` (
    `id` VARCHAR(36) NOT NULL,
    `writeupId` VARCHAR(36) NOT NULL,
    `orderIndex` INTEGER NOT NULL,
    `description` TEXT NOT NULL,
    `command` TEXT NULL,
    `commandOutput` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `steps_writeupId_idx`(`writeupId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `images` (
    `id` VARCHAR(36) NOT NULL,
    `stepId` VARCHAR(36) NOT NULL,
    `cloudinaryPublicId` VARCHAR(255) NOT NULL,
    `secureUrl` VARCHAR(500) NOT NULL,
    `originalFilenameHash` VARCHAR(64) NOT NULL,
    `fileSizeBytes` INTEGER NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `images_cloudinaryPublicId_key`(`cloudinaryPublicId`),
    INDEX `images_stepId_idx`(`stepId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `writeups` ADD CONSTRAINT `writeups_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `steps` ADD CONSTRAINT `steps_writeupId_fkey` FOREIGN KEY (`writeupId`) REFERENCES `writeups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `images` ADD CONSTRAINT `images_stepId_fkey` FOREIGN KEY (`stepId`) REFERENCES `steps`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

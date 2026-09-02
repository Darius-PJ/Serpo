-- Keep the CRM record's general edit clock separate from its pipeline-stage clock.
-- A constant default keeps SQLite ALTER TABLE compatible; Prisma writes the
-- actual current timestamp for all new and updated rows via @updatedAt.
ALTER TABLE "Application" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00';
UPDATE "Application" SET "updatedAt" = CURRENT_TIMESTAMP;

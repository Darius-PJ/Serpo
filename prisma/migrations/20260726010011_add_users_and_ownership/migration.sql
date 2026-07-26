-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "JobBoardPin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "jobBoardId" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL,
    CONSTRAINT "JobBoardPin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JobBoardPin_jobBoardId_fkey" FOREIGN KEY ("jobBoardId") REFERENCES "JobBoard" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "url" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Sourced',
    "appliedAt" DATETIME,
    "lastStatusChangeAt" DATETIME NOT NULL,
    "followUpGeneratedAt" DATETIME,
    "staleFlaggedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Application" ("appliedAt", "company", "createdAt", "description", "followUpGeneratedAt", "id", "lastStatusChangeAt", "notes", "role", "source", "staleFlaggedAt", "status", "url") SELECT "appliedAt", "company", "createdAt", "description", "followUpGeneratedAt", "id", "lastStatusChangeAt", "notes", "role", "source", "staleFlaggedAt", "status", "url" FROM "Application";
DROP TABLE "Application";
ALTER TABLE "new_Application" RENAME TO "Application";
CREATE INDEX "Application_userId_idx" ON "Application"("userId");
CREATE UNIQUE INDEX "Application_id_userId_key" ON "Application"("id", "userId");
CREATE TABLE "new_JobBoard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "region" TEXT,
    "source" TEXT NOT NULL DEFAULT 'curated',
    "pinned" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobBoard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_JobBoard" ("createdAt", "id", "jurisdiction", "name", "pinned", "region", "source", "url") SELECT "createdAt", "id", "jurisdiction", "name", "pinned", "region", "source", "url" FROM "JobBoard";
DROP TABLE "JobBoard";
ALTER TABLE "new_JobBoard" RENAME TO "JobBoard";
CREATE INDEX "JobBoard_userId_idx" ON "JobBoard"("userId");
CREATE TABLE "new_ProfileField" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProfileField_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProfileField" ("id", "key", "label", "updatedAt", "value") SELECT "id", "key", "label", "updatedAt", "value" FROM "ProfileField";
DROP TABLE "ProfileField";
ALTER TABLE "new_ProfileField" RENAME TO "ProfileField";
CREATE UNIQUE INDEX "ProfileField_userId_key_key" ON "ProfileField"("userId", "key");
CREATE UNIQUE INDEX "ProfileField_id_userId_key" ON "ProfileField"("id", "userId");
CREATE TABLE "new_ResumeTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "sourceFilename" TEXT NOT NULL,
    "sourceFormat" TEXT NOT NULL,
    "contentText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResumeTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ResumeTemplate" ("contentText", "createdAt", "id", "sourceFilename", "sourceFormat") SELECT "contentText", "createdAt", "id", "sourceFilename", "sourceFormat" FROM "ResumeTemplate";
DROP TABLE "ResumeTemplate";
ALTER TABLE "new_ResumeTemplate" RENAME TO "ResumeTemplate";
CREATE INDEX "ResumeTemplate_userId_idx" ON "ResumeTemplate"("userId");
CREATE UNIQUE INDEX "ResumeTemplate_id_userId_key" ON "ResumeTemplate"("id", "userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "JobBoardPin_userId_jobBoardId_key" ON "JobBoardPin"("userId", "jobBoardId");

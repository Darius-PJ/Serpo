-- AlterTable
ALTER TABLE "Application" ADD COLUMN "description" TEXT;

-- CreateTable
CREATE TABLE "JobBoard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "region" TEXT,
    "source" TEXT NOT NULL DEFAULT 'curated',
    "pinned" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ResumeTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceFilename" TEXT NOT NULL,
    "sourceFormat" TEXT NOT NULL,
    "contentText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProfileField" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ApplyRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "tailoredResumePath" TEXT,
    "formAnswersSnapshot" TEXT,
    "missingFieldLabel" TEXT,
    "error" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" DATETIME,
    CONSTRAINT "ApplyRun_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProfileField_key_key" ON "ProfileField"("key");

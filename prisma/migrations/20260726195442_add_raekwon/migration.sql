-- CreateTable
CREATE TABLE "RaekwonReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "batchSize" INTEGER NOT NULL,
    "keyword" TEXT NOT NULL,
    "location" TEXT,
    "jobType" TEXT,
    "compensationTarget" TEXT,
    "sourcesHubMarkdown" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RaekwonReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RaekwonLead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "location" TEXT,
    "url" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "compensation" TEXT,
    "rationale" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RaekwonLead_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "RaekwonReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RaekwonReport_userId_idx" ON "RaekwonReport"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RaekwonReport_id_userId_key" ON "RaekwonReport"("id", "userId");

CREATE TABLE "SavedSearch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "keywords" TEXT NOT NULL,
  "location" TEXT NOT NULL DEFAULT '',
  "remoteOnly" BOOLEAN NOT NULL DEFAULT false,
  "employmentType" TEXT NOT NULL DEFAULT 'any',
  "jobSpySites" TEXT NOT NULL DEFAULT '[]',
  "cadence" TEXT NOT NULL DEFAULT 'daily',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastRunAt" DATETIME,
  "nextRunAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastViewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavedSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SavedSearch_id_userId_key" ON "SavedSearch"("id", "userId");
CREATE INDEX "SavedSearch_userId_idx" ON "SavedSearch"("userId");
CREATE INDEX "SavedSearch_enabled_nextRunAt_idx" ON "SavedSearch"("enabled", "nextRunAt");

CREATE TABLE "SavedSearchHit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "savedSearchId" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "listingJson" TEXT NOT NULL,
  "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dismissedAt" DATETIME,
  CONSTRAINT "SavedSearchHit_savedSearchId_fkey" FOREIGN KEY ("savedSearchId") REFERENCES "SavedSearch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SavedSearchHit_savedSearchId_listingId_key" ON "SavedSearchHit"("savedSearchId", "listingId");
CREATE INDEX "SavedSearchHit_savedSearchId_familyId_idx" ON "SavedSearchHit"("savedSearchId", "familyId");
CREATE INDEX "SavedSearchHit_savedSearchId_firstSeenAt_idx" ON "SavedSearchHit"("savedSearchId", "firstSeenAt");

CREATE TABLE "AutomationJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "payload" TEXT NOT NULL DEFAULT '{}',
  "idempotencyKey" TEXT NOT NULL,
  "runAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 4,
  "lastError" TEXT,
  "lockedAt" DATETIME,
  "finishedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AutomationJob_idempotencyKey_key" ON "AutomationJob"("idempotencyKey");
CREATE UNIQUE INDEX "AutomationJob_id_userId_key" ON "AutomationJob"("id", "userId");
CREATE INDEX "AutomationJob_status_runAt_idx" ON "AutomationJob"("status", "runAt");
CREATE INDEX "AutomationJob_userId_status_idx" ON "AutomationJob"("userId", "status");

CREATE TABLE "AutomationSettings" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "timezone" TEXT,
  "jobSpyConsent" TEXT NOT NULL DEFAULT '["indeed","linkedin","zip_recruiter","glassdoor"]',
  CONSTRAINT "AutomationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

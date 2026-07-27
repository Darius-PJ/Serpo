-- RedefineTable: relax ResumeWorkspace.company/role to nullable so a
-- "general" workspace (not tied to any job posting) can exist — the Resume
-- tab's new default/landing state. Existing rows keep their values as-is.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ResumeWorkspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "company" TEXT,
    "role" TEXT,
    "jobDescription" TEXT,
    "sourceUrl" TEXT,
    "originSearchQuery" TEXT,
    "benchmarkContent" TEXT,
    "benchmarkStatus" TEXT NOT NULL DEFAULT 'pending',
    "benchmarkError" TEXT,
    "improvedContent" TEXT,
    "improvedStatus" TEXT NOT NULL DEFAULT 'not_started',
    "improvedError" TEXT,
    "meldedContent" TEXT,
    "meldedStatus" TEXT NOT NULL DEFAULT 'not_started',
    "meldedError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ResumeWorkspace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ResumeWorkspace" ("id", "userId", "company", "role", "jobDescription", "sourceUrl", "originSearchQuery", "benchmarkContent", "benchmarkStatus", "benchmarkError", "improvedContent", "improvedStatus", "improvedError", "meldedContent", "meldedStatus", "meldedError", "createdAt", "updatedAt")
SELECT "id", "userId", "company", "role", "jobDescription", "sourceUrl", "originSearchQuery", "benchmarkContent", "benchmarkStatus", "benchmarkError", "improvedContent", "improvedStatus", "improvedError", "meldedContent", "meldedStatus", "meldedError", "createdAt", "updatedAt"
FROM "ResumeWorkspace";
DROP TABLE "ResumeWorkspace";
ALTER TABLE "new_ResumeWorkspace" RENAME TO "ResumeWorkspace";
CREATE INDEX "ResumeWorkspace_userId_idx" ON "ResumeWorkspace"("userId");
CREATE UNIQUE INDEX "ResumeWorkspace_id_userId_key" ON "ResumeWorkspace"("id", "userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

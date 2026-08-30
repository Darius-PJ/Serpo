CREATE TABLE "Task" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "applicationId" TEXT,
  "title" TEXT NOT NULL,
  "dueAt" DATETIME,
  "completedAt" DATETIME,
  "snoozedUntil" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Task_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Task_id_userId_key" ON "Task"("id", "userId");
CREATE INDEX "Task_userId_completedAt_idx" ON "Task"("userId", "completedAt");
CREATE INDEX "Task_applicationId_idx" ON "Task"("applicationId");

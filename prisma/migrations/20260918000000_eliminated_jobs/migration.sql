CREATE TABLE "EliminatedJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "company" TEXT,
  "role" TEXT,
  "source" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EliminatedJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EliminatedJob_userId_url_key" ON "EliminatedJob"("userId", "url");
CREATE INDEX "EliminatedJob_userId_idx" ON "EliminatedJob"("userId");

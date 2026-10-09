CREATE TABLE "SearchHistoryEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "keywords" TEXT NOT NULL,
  "location" TEXT NOT NULL DEFAULT '',
  "searchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SearchHistoryEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SearchHistoryEntry_userId_keywords_location_key" ON "SearchHistoryEntry"("userId", "keywords", "location");
CREATE INDEX "SearchHistoryEntry_userId_searchedAt_idx" ON "SearchHistoryEntry"("userId", "searchedAt");

CREATE TABLE "IndustryInterest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "industry" TEXT NOT NULL,
  CONSTRAINT "IndustryInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "IndustryInterest_userId_industry_key" ON "IndustryInterest"("userId", "industry");

CREATE TABLE "HiddenCompanySuggestion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  CONSTRAINT "HiddenCompanySuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "HiddenCompanySuggestion_userId_platform_token_key" ON "HiddenCompanySuggestion"("userId", "platform", "token");

CREATE TABLE "TitleAlias" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "keyword" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TitleAlias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TitleAlias_userId_keyword_alias_key" ON "TitleAlias"("userId", "keyword", "alias");
CREATE INDEX "TitleAlias_userId_keyword_idx" ON "TitleAlias"("userId", "keyword");

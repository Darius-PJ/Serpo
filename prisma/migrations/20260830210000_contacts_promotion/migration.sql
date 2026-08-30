-- Promote per-application DecisionMaker rows to user-scoped, reusable
-- Contacts. Merge policy (user-approved): one contact per exact
-- name+company within an account (name compared case-insensitively,
-- whitespace-trimmed); rows without a name never merge. Per-application
-- provenance (sourceTool, confidence, foundAt) moves onto link rows, so the
-- merge loses nothing.

CREATE TABLE "Contact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT,
  "title" TEXT,
  "email" TEXT,
  "company" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Contact_id_userId_key" ON "Contact"("id", "userId");
CREATE INDEX "Contact_userId_company_idx" ON "Contact"("userId", "company");

CREATE TABLE "ContactApplication" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "contactId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "sourceTool" TEXT NOT NULL,
  "confidence" TEXT,
  "foundAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactApplication_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ContactApplication_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ContactApplication_contactId_applicationId_key" ON "ContactApplication"("contactId", "applicationId");
CREATE INDEX "ContactApplication_applicationId_idx" ON "ContactApplication"("applicationId");

CREATE TABLE "Interaction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "applicationId" TEXT,
  "kind" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Interaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Interaction_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Interaction_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Interaction_id_userId_key" ON "Interaction"("id", "userId");
CREATE INDEX "Interaction_userId_idx" ON "Interaction"("userId");
CREATE INDEX "Interaction_contactId_occurredAt_idx" ON "Interaction"("contactId", "occurredAt");
CREATE INDEX "Interaction_applicationId_idx" ON "Interaction"("applicationId");

ALTER TABLE "Message" ADD COLUMN "contactId" TEXT REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Map existing rows. Key each DecisionMaker row: named rows share a key per
-- (user, company, lowercased trimmed name); nameless rows key on their own id
-- so they never merge. Rows on unowned (userId IS NULL) legacy applications
-- are skipped — the first registered account claimed all of those long ago.
CREATE TEMP TABLE "_dm_keyed" AS
SELECT
  d."id" AS dmId,
  d."applicationId" AS applicationId,
  a."userId" AS userId,
  a."company" AS company,
  CASE
    WHEN d."name" IS NULL OR trim(d."name") = '' THEN 'row:' || d."id"
    ELSE 'name:' || lower(trim(d."name"))
  END AS mergeKey,
  d."name" AS name,
  d."title" AS title,
  d."email" AS email,
  d."sourceTool" AS sourceTool,
  d."confidence" AS confidence,
  d."foundAt" AS foundAt
FROM "DecisionMaker" d
JOIN "Application" a ON a."id" = d."applicationId"
WHERE a."userId" IS NOT NULL;

-- One contact per merge group: richest non-null fields, earliest discovery.
CREATE TEMP TABLE "_contact_map" AS
SELECT
  lower(hex(randomblob(16))) AS contactId,
  userId,
  company,
  mergeKey,
  MAX(name) AS name,
  MAX(title) AS title,
  MAX(email) AS email,
  MIN(foundAt) AS foundAt
FROM "_dm_keyed"
GROUP BY userId, company, mergeKey;

INSERT INTO "Contact" ("id", "userId", "name", "title", "email", "company", "createdAt")
SELECT contactId, userId, name, title, email, company, foundAt FROM "_contact_map";

-- One link per (contact, application), keeping the earliest discovery's time.
INSERT INTO "ContactApplication" ("id", "contactId", "applicationId", "sourceTool", "confidence", "foundAt")
SELECT
  lower(hex(randomblob(16))),
  m.contactId,
  k.applicationId,
  MAX(k.sourceTool),
  MAX(k.confidence),
  MIN(k.foundAt)
FROM "_dm_keyed" k
JOIN "_contact_map" m ON m.userId = k.userId AND m.company = k.company AND m.mergeKey = k.mergeKey
GROUP BY m.contactId, k.applicationId;

DROP TABLE "_dm_keyed";
DROP TABLE "_contact_map";
DROP TABLE "DecisionMaker";

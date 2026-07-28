-- CreateTable
CREATE TABLE "JobSourceCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "criteriaHash" TEXT NOT NULL,
    "listingsJson" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "JobListingFingerprint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "simhash" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "isAgency" BOOLEAN NOT NULL,
    "isRepresentative" BOOLEAN NOT NULL DEFAULT false,
    "listingJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "JobSourceCache_source_criteriaHash_key" ON "JobSourceCache"("source", "criteriaHash");

-- CreateIndex
CREATE UNIQUE INDEX "JobListingFingerprint_listingId_key" ON "JobListingFingerprint"("listingId");

-- CreateIndex
CREATE INDEX "JobListingFingerprint_familyId_idx" ON "JobListingFingerprint"("familyId");

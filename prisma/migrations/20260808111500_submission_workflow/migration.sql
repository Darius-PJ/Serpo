-- Make submission state explicit so a filled form, an attempted submission,
-- and a confirmed employer receipt cannot be conflated in the dashboard.
ALTER TABLE "Application" ADD COLUMN "submissionState" TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE "Application" ADD COLUMN "submissionConfirmedAt" DATETIME;

ALTER TABLE "ApplyRun" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "ApplyRun" ADD COLUMN "submissionEvidence" TEXT;
ALTER TABLE "ApplyRun" ADD COLUMN "reviewedAt" DATETIME;
CREATE UNIQUE INDEX "ApplyRun_idempotencyKey_key" ON "ApplyRun"("idempotencyKey");

-- Preserve established, manually-tracked submissions when upgrading existing data.
UPDATE "Application"
SET "submissionState" = 'confirmed', "submissionConfirmedAt" = COALESCE("appliedAt", CURRENT_TIMESTAMP)
WHERE "status" = 'Submitted';

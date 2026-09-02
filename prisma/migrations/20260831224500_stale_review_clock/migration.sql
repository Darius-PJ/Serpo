-- A stale-review acknowledgement has its own clock; it must not rewrite the
-- pipeline stage timestamp used for stage age and funnel metrics.
ALTER TABLE "Application" ADD COLUMN "staleReviewedAt" DATETIME;

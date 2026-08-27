-- Supports bounded, newest-first application list reads for each account.
CREATE INDEX "Application_userId_createdAt_idx" ON "Application"("userId", "createdAt");

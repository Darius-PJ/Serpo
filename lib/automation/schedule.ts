import "server-only";
import { prisma } from "@/lib/db/prisma";
import { isCadence } from "./cadence";
import { enqueueJob, savedSearchJobKeyPrefix } from "./jobs";
import { automationPreferencesFrom } from "./settings";
import { currentSlot, localDateKey, nextSlotAfter } from "./slots";

/**
 * Enqueues everything due at now, per account, in that account's timezone:
 *
 * - The daily stale scan and follow-up scan, keyed by local date. They run
 *   whether or not unattended searches are on: the stale scan never leaves
 *   this computer, and follow-up drafting is gated by AI assistance, the same
 *   as outreach preparation.
 * - With automation on, one run of each enabled saved search whose nextRunAt
 *   has passed, keyed to the current slot. However many slots passed while
 *   Serpo was closed, the search runs once; nextRunAt then moves to the next
 *   slot after now.
 *
 * Returns how many jobs this call created.
 */
export async function enqueueDue(now: Date): Promise<number> {
  const users = await prisma.user.findMany({ select: { id: true, automationSettings: true } });
  let created = 0;

  for (const user of users) {
    const preferences = automationPreferencesFrom(user.automationSettings);
    const timeZone = preferences.effectiveTimezone;
    const day = localDateKey(now, timeZone);
    for (const kind of ["stale.scan", "followup.scan"] as const) {
      if (await enqueueJob({ userId: user.id, kind, idempotencyKey: `${kind}:${user.id}:${day}`, runAt: now })) created++;
    }

    if (!preferences.enabled) continue;
    const due = await prisma.savedSearch.findMany({ where: { userId: user.id, enabled: true, nextRunAt: { lte: now } } });
    for (const search of due) {
      const cadence = isCadence(search.cadence) ? search.cadence : "daily";
      const slot = currentSlot(now, cadence, timeZone);
      const job = {
        userId: user.id,
        kind: "saved_search.run" as const,
        idempotencyKey: `${savedSearchJobKeyPrefix(search.id)}${slot.toISOString()}`,
        payload: { savedSearchId: search.id },
        runAt: now,
      };
      if (await enqueueJob(job)) created++;
      await prisma.savedSearch.update({ where: { id: search.id }, data: { nextRunAt: nextSlotAfter(now, cadence, timeZone) } });
    }
  }
  return created;
}

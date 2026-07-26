import "server-only";
import { prisma } from "@/lib/db/prisma";

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Flags (never deletes) applications with no status change in 3+ months so they
 * surface in the dashboard's stale-review panel. Deletion requires explicit user
 * approval via lib/privacy/purge.ts.
 */
export async function runStaleCheck() {
  const cutoff = new Date(Date.now() - THREE_MONTHS_MS);

  const result = await prisma.application.updateMany({
    where: {
      lastStatusChangeAt: { lte: cutoff },
      staleFlaggedAt: null,
    },
    data: { staleFlaggedAt: new Date() },
  });

  return result.count;
}

/** Applications currently awaiting a keep/remove decision in the stale-review panel. */
export async function listStaleApplications() {
  return prisma.application.findMany({
    where: { staleFlaggedAt: { not: null } },
    orderBy: { lastStatusChangeAt: "asc" },
  });
}

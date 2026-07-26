import "server-only";
import { prisma } from "@/lib/db/prisma";

/** Stale-review "Keep": clears the flag. `lastStatusChangeAt` auto-bumps via @updatedAt, resetting the 3-month clock. */
export async function keepApplication(applicationId: string) {
  return prisma.application.update({
    where: { id: applicationId },
    data: { staleFlaggedAt: null },
  });
}

/** Stale-review "Remove": cascade-deletes the application, its decision makers, and its messages. */
export async function removeApplication(applicationId: string) {
  return prisma.application.delete({ where: { id: applicationId } });
}

/** Per-record OSINT purge without touching the application itself. */
export async function purgeDecisionMakers(applicationId: string) {
  return prisma.decisionMaker.deleteMany({ where: { applicationId } });
}

/** Global wipe — deletes every application (cascades to decision makers and messages). */
export async function wipeAllData() {
  return prisma.application.deleteMany({});
}

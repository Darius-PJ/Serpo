import "server-only";
import { prisma } from "@/lib/db/prisma";

/** Stale-review "Keep": clears the flag. `lastStatusChangeAt` auto-bumps via @updatedAt, resetting the 3-month clock. Throws if the application isn't owned by this user. */
export async function keepApplication(applicationId: string, userId: string) {
  return prisma.application.update({
    where: { id_userId: { id: applicationId, userId } },
    data: { staleFlaggedAt: null },
  });
}

/** Stale-review "Remove": cascade-deletes the application, its decision makers, and its messages. Throws if the application isn't owned by this user. */
export async function removeApplication(applicationId: string, userId: string) {
  return prisma.application.delete({ where: { id_userId: { id: applicationId, userId } } });
}

/** Per-record OSINT purge without touching the application itself. Scoped through the parent application's ownership. */
export async function purgeDecisionMakers(applicationId: string, userId: string) {
  const application = await prisma.application.findUnique({
    where: { id_userId: { id: applicationId, userId } },
    select: { id: true },
  });
  if (!application) {
    throw new Error("not found");
  }
  return prisma.decisionMaker.deleteMany({ where: { applicationId } });
}

/**
 * Wipe this account's data only — every other account's applications, résumé
 * template, and saved answers are untouched, and curated (shared) job boards
 * are never deleted. Clears résumé template and saved profile answers too,
 * not just applications, since those are also PII a "wipe all data" user
 * expects gone.
 */
export async function wipeAllData(userId: string) {
  return prisma.$transaction(async (tx) => {
    const applications = await tx.application.deleteMany({ where: { userId } });
    const resumeTemplates = await tx.resumeTemplate.deleteMany({ where: { userId } });
    const profileFields = await tx.profileField.deleteMany({ where: { userId } });
    // Private (non-curated) job boards this account added are its own data too.
    const jobBoards = await tx.jobBoard.deleteMany({ where: { userId } });
    return {
      applications: applications.count,
      resumeTemplates: resumeTemplates.count,
      profileFields: profileFields.count,
      jobBoards: jobBoards.count,
    };
  });
}

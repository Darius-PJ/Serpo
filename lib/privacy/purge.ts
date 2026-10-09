import "server-only";
import { prisma } from "@/lib/db/prisma";
import { legacyResumeArtifactPath, removeResumeArtifacts } from "@/lib/apply/resumeArtifacts";
import { purgeAccountArchive, purgeLegacyArchivedReports } from "@/lib/raekwon/archive";

/** Stale-review "Keep": records a review without corrupting pipeline stage age. Throws if the application isn't owned by this user. */
export async function keepApplication(applicationId: string, userId: string) {
  return prisma.application.update({
    where: { id_userId: { id: applicationId, userId } },
    data: { staleFlaggedAt: null, staleReviewedAt: new Date() },
  });
}

/** Stale-review "Remove": cascade-deletes the application, its decision makers, and its messages. Throws if the application isn't owned by this user. */
export async function removeApplication(applicationId: string, userId: string) {
  return prisma.application.delete({ where: { id_userId: { id: applicationId, userId } } });
}

/**
 * Per-application OSINT purge without touching the application itself, scoped
 * through the parent application's ownership. Removes this application's
 * contact links, then deletes only contacts left with nothing at all — no
 * other application links, no logged interactions, no message drafts. A
 * contact the user has a history with is their data, not this application's
 * research, and survives.
 */
export async function purgeContactResearch(applicationId: string, userId: string) {
  const application = await prisma.application.findUnique({
    where: { id_userId: { id: applicationId, userId } },
    select: { id: true },
  });
  if (!application) {
    throw new Error("not found");
  }
  return prisma.$transaction(async (tx) => {
    const links = await tx.contactApplication.findMany({ where: { applicationId }, select: { contactId: true } });
    const contactIds = [...new Set(links.map((link) => link.contactId))];
    const removed = await tx.contactApplication.deleteMany({ where: { applicationId } });
    await tx.contact.deleteMany({
      where: {
        id: { in: contactIds },
        userId,
        applications: { none: {} },
        interactions: { none: {} },
        messages: { none: {} },
      },
    });
    return { count: removed.count };
  });
}

/**
 * Wipe this account's data only — every other account's applications, résumé
 * template, and saved answers are untouched, and curated (shared) job boards
 * are never deleted. Clears résumé template and saved profile answers too,
 * not just applications, since those are also PII a "wipe all data" user
 * expects gone.
 */
export async function wipeAllData(userId: string) {
  const [applyRuns, applications, reports] = await Promise.all([
    prisma.applyRun.findMany({ where: { application: { userId } }, select: { tailoredResumePath: true } }),
    prisma.application.findMany({ where: { userId }, select: { id: true } }),
    prisma.raekwonReport.findMany({ where: { userId }, select: { id: true } }),
  ]);
  const artifactPaths = [
    ...applyRuns.map((run) => run.tailoredResumePath).filter((value): value is string => Boolean(value)),
    ...applications.map((application) => legacyResumeArtifactPath(application.id)),
  ];

  const result = await prisma.$transaction(async (tx) => {
    const interactions = await tx.interaction.deleteMany({ where: { userId } });
    const contacts = await tx.contact.deleteMany({ where: { userId } });
    const tasks = await tx.task.deleteMany({ where: { userId } });
    const titleAliases = await tx.titleAlias.deleteMany({ where: { userId } });
    const eliminatedJobs = await tx.eliminatedJob.deleteMany({ where: { userId } });
    const savedSearchHits = await tx.savedSearchHit.deleteMany({ where: { savedSearch: { userId } } });
    const savedSearches = await tx.savedSearch.deleteMany({ where: { userId } });
    const automationJobs = await tx.automationJob.deleteMany({ where: { userId } });
    const automationSettings = await tx.automationSettings.deleteMany({ where: { userId } });
    const searchHistory = await tx.searchHistoryEntry.deleteMany({ where: { userId } });
    const industryInterests = await tx.industryInterest.deleteMany({ where: { userId } });
    const hiddenCompanySuggestions = await tx.hiddenCompanySuggestion.deleteMany({ where: { userId } });
    const auditEvents = await tx.auditEvent.deleteMany({ where: { userId } });
    const deletedApplications = await tx.application.deleteMany({ where: { userId } });
    const resumeTemplates = await tx.resumeTemplate.deleteMany({ where: { userId } });
    const resumeWorkspaces = await tx.resumeWorkspace.deleteMany({ where: { userId } });
    const raekwonReports = await tx.raekwonReport.deleteMany({ where: { userId } });
    const profileFields = await tx.profileField.deleteMany({ where: { userId } });
    const jobBoardPins = await tx.jobBoardPin.deleteMany({ where: { userId } });
    // Private (non-curated) job boards this account added are its own data too.
    const jobBoards = await tx.jobBoard.deleteMany({ where: { userId } });
    return {
      applications: deletedApplications.count,
      contacts: contacts.count,
      interactions: interactions.count,
      tasks: tasks.count,
      titleAliases: titleAliases.count,
      eliminatedJobs: eliminatedJobs.count,
      savedSearches: savedSearches.count,
      savedSearchHits: savedSearchHits.count,
      automationJobs: automationJobs.count,
      automationSettings: automationSettings.count,
      searchHistory: searchHistory.count,
      industryInterests: industryInterests.count,
      hiddenCompanySuggestions: hiddenCompanySuggestions.count,
      auditEvents: auditEvents.count,
      resumeTemplates: resumeTemplates.count,
      resumeWorkspaces: resumeWorkspaces.count,
      raekwonReports: raekwonReports.count,
      profileFields: profileFields.count,
      jobBoardPins: jobBoardPins.count,
      jobBoards: jobBoards.count,
    };
  });

  const cleanup = await Promise.allSettled([
    removeResumeArtifacts(artifactPaths),
    purgeAccountArchive(userId),
    purgeLegacyArchivedReports(reports.map((report) => report.id)),
  ]);
  const artifactResult = cleanup[0];
  const accountArchiveResult = cleanup[1];
  const legacyArchiveResult = cleanup[2];
  const artifactFailures = artifactResult.status === "fulfilled" ? artifactResult.value.failures.length : artifactPaths.length;
  const archiveFailures =
    (accountArchiveResult.status === "rejected" ? 1 : 0) +
    (legacyArchiveResult.status === "rejected" ? 1 : legacyArchiveResult.value);

  return {
    ...result,
    resumeArtifacts: artifactResult.status === "fulfilled" ? artifactResult.value.removed : 0,
    artifactCleanupFailures: artifactFailures,
    archiveCleanupFailures: archiveFailures,
  };
}

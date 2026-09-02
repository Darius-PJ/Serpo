import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { ApplicationStatus } from "@/lib/applicationStatus";

/**
 * The one write path for pipeline stage moves (StatusSelect PATCH and the
 * kanban board): updates the status, applies the first-time-Submitted side
 * effects, and records the `status_changed` AuditEvent that funnel metrics
 * are computed from. Returns null when the application isn't this user's;
 * an unchanged status is a no-op that records nothing.
 */
export async function changeApplicationStatus(userId: string, applicationId: string, to: ApplicationStatus) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.application.findUnique({ where: { id_userId: { id: applicationId, userId } } });
    if (!existing) return null;
    if (existing.status === to) return existing;

    const isNewlySubmitted = to === "Submitted";
    const updated = await tx.application.update({
      where: { id: applicationId },
      data: {
        status: to,
        lastStatusChangeAt: new Date(),
        staleFlaggedAt: null,
        staleReviewedAt: null,
        ...(isNewlySubmitted && !existing.appliedAt ? { appliedAt: new Date() } : {}),
        ...(isNewlySubmitted
          ? { submissionState: "confirmed", submissionConfirmedAt: existing.submissionConfirmedAt ?? new Date() }
          : {}),
      },
    });
    await tx.auditEvent.create({
      data: {
        userId,
        action: "application.status_changed",
        entityType: "Application",
        entityId: applicationId,
        details: JSON.stringify({ from: existing.status, to }),
      },
    });
    return updated;
  });
}

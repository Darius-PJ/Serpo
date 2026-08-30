import "server-only";
import { prisma } from "@/lib/db/prisma";
import { listFollowUpDue } from "@/lib/scheduler/followUpCheck";
import { describeStageAge } from "@/lib/pipeline/stageAge";
import type { PipelineCard } from "@/lib/pipeline/types";

/**
 * The pipeline board's cards, newest first, with request-time stage ages and
 * follow-up flags resolved here so page renders stay pure (no Date.now() in
 * component bodies — React's purity rule).
 */
export async function listPipelineCards(userId: string): Promise<PipelineCard[]> {
  const [applications, followUpsDue] = await Promise.all([
    prisma.application.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    listFollowUpDue(userId),
  ]);
  const followUpDueIds = new Set(followUpsDue.map((application) => application.id));

  const now = Date.now();
  // Soonest-due first, so the first task seen per application is its next
  // action. Snoozed tasks stay off the card the same way they stay out of the
  // attention queue.
  const openTasks = await prisma.task.findMany({
    where: {
      userId,
      completedAt: null,
      applicationId: { not: null },
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: new Date(now) } }],
    },
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    select: { applicationId: true, title: true },
  });
  const nextActionByApplication = new Map<string, string>();
  for (const task of openTasks) {
    if (task.applicationId && !nextActionByApplication.has(task.applicationId)) {
      nextActionByApplication.set(task.applicationId, task.title);
    }
  }
  return applications.map((application) => {
    const age = describeStageAge(application.lastStatusChangeAt, now);
    return {
      id: application.id,
      company: application.company,
      role: application.role,
      status: application.status,
      source: application.source,
      stageAgeLabel: age.label,
      stageAgeStale: age.stale,
      followUpDue: followUpDueIds.has(application.id),
      nextAction: nextActionByApplication.get(application.id) ?? null,
    };
  });
}

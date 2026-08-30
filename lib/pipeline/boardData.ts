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
    };
  });
}

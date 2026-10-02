import "server-only";
import { prisma } from "@/lib/db/prisma";
import { generateMessage } from "@/lib/ai/generateMessage";
import { AiAssistanceDisabledError } from "@/lib/ai/claudeClient";
import { listFollowUpDue } from "@/lib/scheduler/followUpCheck";
import { isRetryableError } from "@/lib/automation/errors";

/**
 * The daily follow-up scan's work: for each application whose 7-day
 * follow-up window is open, draft the FOLLOW_UP message. Needs AI assistance,
 * and does nothing without it; the attention queue still lists the follow-up.
 *
 * followUpGeneratedAt keeps its one-follow-up rule: it is claimed before the
 * model is called, so a draft made by hand meanwhile is never duplicated, and
 * released if drafting fails so a later scan can try again. Drafts wait in the
 * review queue; nothing is sent. One failing application doesn't stop the
 * rest: after trying them all, it throws a retryable failure if there was one,
 * else the first failure. Returns how many drafts were made.
 */
export async function draftDueFollowUps(userId: string): Promise<number> {
  if (process.env.ENABLE_AI_ASSISTANCE !== "true") return 0;

  let drafted = 0;
  const failures: unknown[] = [];
  for (const application of await listFollowUpDue(userId)) {
    const claimedAt = new Date();
    const { count } = await prisma.application.updateMany({
      where: { id: application.id, userId, followUpGeneratedAt: null },
      data: { followUpGeneratedAt: claimedAt },
    });
    if (count === 0) continue;
    try {
      await generateMessage(application.id, "FOLLOW_UP");
      drafted++;
    } catch (err) {
      await prisma.application.updateMany({
        where: { id: application.id, followUpGeneratedAt: claimedAt },
        data: { followUpGeneratedAt: null },
      });
      // Switched off mid-scan: stop quietly, as if it had been off from the start.
      if (err instanceof AiAssistanceDisabledError) return drafted;
      failures.push(err);
    }
  }
  if (failures.length > 0) throw failures.find(isRetryableError) ?? failures[0];
  return drafted;
}

import "server-only";
import { prisma } from "@/lib/db/prisma";
import { listFollowUpDue } from "@/lib/scheduler/followUpCheck";

export type AttentionKind = "apply_run" | "message_draft" | "follow_up_due";

export interface AttentionItem {
  kind: AttentionKind;
  applicationId: string;
  company: string;
  role: string;
  detail: string;
  since: Date;
}

// Stuck states only — "pending" is in flight and "submitted"/"unknown" have
// their own resolution paths on the application detail page.
const STUCK_APPLY_RUN_STATUSES = ["needs_input", "review_required", "blocked", "failed"];

// Apply runs block automation, drafts block outreach, follow-ups are hygiene.
const KIND_PRIORITY: Record<AttentionKind, number> = { apply_run: 0, message_draft: 1, follow_up_due: 2 };

function describeApplyRun(run: { status: string; missingFieldLabel: string | null }): string {
  switch (run.status) {
    case "needs_input":
      return run.missingFieldLabel ? `Apply run needs input: ${run.missingFieldLabel}` : "Apply run needs input";
    case "review_required":
      return "Apply run awaiting your review";
    case "blocked":
      return "Apply run blocked";
    default:
      return "Apply run failed";
  }
}

/**
 * Everything waiting on the user, merged across signals: stuck apply runs,
 * message drafts awaiting approval, and 7-day follow-ups due. Sorted by kind
 * priority, then oldest first (most overdue at the top). Read-only.
 */
export async function listAttentionItems(userId: string): Promise<AttentionItem[]> {
  const [stuckRuns, drafts, followUpsDue] = await Promise.all([
    prisma.applyRun.findMany({
      where: { status: { in: STUCK_APPLY_RUN_STATUSES }, application: { userId } },
      include: { application: { select: { id: true, company: true, role: true } } },
    }),
    prisma.message.findMany({
      where: { status: "DRAFT", application: { userId } },
      include: { application: { select: { id: true, company: true, role: true } } },
    }),
    listFollowUpDue(userId),
  ]);

  const items: AttentionItem[] = [
    ...stuckRuns.map((run) => ({
      kind: "apply_run" as const,
      applicationId: run.application.id,
      company: run.application.company,
      role: run.application.role,
      detail: describeApplyRun(run),
      since: run.startedAt,
    })),
    ...drafts.map((message) => ({
      kind: "message_draft" as const,
      applicationId: message.application.id,
      company: message.application.company,
      role: message.application.role,
      detail: message.type === "FOLLOW_UP" ? "Follow-up draft awaiting approval" : "Outreach draft awaiting approval",
      since: message.createdAt,
    })),
    ...followUpsDue.map((application) => ({
      kind: "follow_up_due" as const,
      applicationId: application.id,
      company: application.company,
      role: application.role,
      detail: "7-day follow-up due",
      // listFollowUpDue filters on appliedAt <= cutoff, so it is never null here.
      since: application.appliedAt as Date,
    })),
  ];

  return items.sort(
    (a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] || a.since.getTime() - b.since.getTime(),
  );
}

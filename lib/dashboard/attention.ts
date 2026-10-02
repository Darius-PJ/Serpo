import "server-only";
import { prisma } from "@/lib/db/prisma";
import { listFollowUpDue } from "@/lib/scheduler/followUpCheck";
import { listDueTasks } from "@/lib/tasks/tasks";
import { listNewListingCounts } from "@/lib/savedSearches/savedSearches";
import { listFailedAutomation } from "@/lib/automation/jobs";

export type AttentionKind = "task" | "apply_run" | "automation_failed" | "message_draft" | "follow_up_due" | "new_listings";

export interface AttentionItem {
  kind: AttentionKind;
  /** Set only for kind "task" — lets the dashboard act on it (done/snooze). */
  taskId?: string;
  /** Set only for kind "automation_failed" — lets the dashboard retry the dead job. */
  jobId?: string;
  /** Set only for kind "new_listings" — the saved search whose inbox holds them. */
  savedSearchId?: string;
  // Null for standalone tasks, new listings, and automation failures without
  // an application; every other kind always carries an application.
  applicationId: string | null;
  company: string | null;
  role: string | null;
  detail: string;
  since: Date;
}

// Stuck states only — "pending" is in flight and "submitted"/"unknown" have
// their own resolution paths on the application detail page.
const STUCK_APPLY_RUN_STATUSES = ["needs_input", "review_required", "blocked", "failed"];

// User-created tasks are explicit intent and outrank every derived signal;
// then apply runs and failed automation block work in flight, drafts block
// outreach, follow-ups are hygiene, and new listings are fresh leads to triage.
const KIND_PRIORITY: Record<AttentionKind, number> = {
  task: 0,
  apply_run: 1,
  automation_failed: 2,
  message_draft: 3,
  follow_up_due: 4,
  new_listings: 5,
};

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
 * automation that gave up, message drafts awaiting approval, 7-day
 * follow-ups due, and saved searches with new listings. Sorted by kind
 * priority, then oldest first (most overdue at the top). Read-only.
 */
export async function listAttentionItems(userId: string): Promise<AttentionItem[]> {
  const [dueTasks, stuckRuns, drafts, followUpsDue, failedAutomation, newListings] = await Promise.all([
    listDueTasks(userId, new Date()),
    prisma.applyRun.findMany({
      where: { status: { in: STUCK_APPLY_RUN_STATUSES }, application: { userId } },
      include: { application: { select: { id: true, company: true, role: true } } },
    }),
    prisma.message.findMany({
      where: { status: "DRAFT", application: { userId } },
      include: { application: { select: { id: true, company: true, role: true } } },
    }),
    listFollowUpDue(userId),
    listFailedAutomation(userId),
    listNewListingCounts(userId),
  ]);

  const items: AttentionItem[] = [
    ...dueTasks.map((task) => ({
      kind: "task" as const,
      taskId: task.id,
      applicationId: task.application?.id ?? null,
      company: task.application?.company ?? null,
      role: task.application?.role ?? null,
      detail: task.title,
      // A dated task starts needing attention when it comes due; an undated
      // one, the moment it was created.
      since: task.dueAt ?? task.createdAt,
    })),
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
    ...failedAutomation.map((failure) => ({
      kind: "automation_failed" as const,
      jobId: failure.jobId,
      applicationId: failure.applicationId,
      company: failure.company,
      role: failure.role,
      detail: failure.detail,
      since: failure.since,
    })),
    ...newListings.map((entry) => ({
      kind: "new_listings" as const,
      savedSearchId: entry.savedSearchId,
      applicationId: null,
      company: null,
      role: null,
      detail: `${entry.count} new listing${entry.count === 1 ? "" : "s"} for "${entry.name}"`,
      since: entry.oldestAt,
    })),
  ];

  return items.sort(
    (a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] || a.since.getTime() - b.since.getTime(),
  );
}

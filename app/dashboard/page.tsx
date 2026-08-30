import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUserIdForPage } from "@/lib/auth/session";
import { listStaleApplications, runStaleCheck } from "@/lib/scheduler/staleCheck";
import { listAttentionItems, type AttentionKind } from "@/lib/dashboard/attention";
import { listRecentActivity } from "@/lib/dashboard/activity";
import { StaleReviewPanel } from "@/components/StaleReviewPanel";
import { TaskQuickAdd } from "@/components/TaskQuickAdd";
import { TaskActions } from "@/components/TaskActions";
import { APPLICATION_STATUSES } from "@/lib/applicationStatus";

export const dynamic = "force-dynamic";

const KIND_BADGES: Record<AttentionKind, string> = {
  task: "Task",
  apply_run: "Apply run",
  message_draft: "Draft",
  follow_up_due: "Follow-up",
};

export default async function DashboardPage() {
  const userId = await requireUserIdForPage();

  // Reading the dashboard must never call an AI provider or create outreach.
  await runStaleCheck(userId);

  const [attentionItems, staleApplications, statusCounts, activity] = await Promise.all([
    listAttentionItems(userId),
    listStaleApplications(userId),
    prisma.application.groupBy({ by: ["status"], where: { userId }, _count: { _all: true } }),
    listRecentActivity(userId),
  ]);
  const countByStatus = new Map(statusCounts.map((row) => [row.status, row._count._all]));
  const allCaughtUp = attentionItems.length === 0 && staleApplications.length === 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-foreground">Dashboard</h1>
        <Link href="/sourcing" className="btn-primary px-3 py-1.5 text-sm">
          Source jobs
        </Link>
      </div>

      <section aria-labelledby="needs-attention" className="mb-8">
        <h2 id="needs-attention" className="mb-2 text-sm font-bold text-primary-dark">
          Needs attention
        </h2>
        <div className="mb-3">
          <TaskQuickAdd />
        </div>
        {allCaughtUp && (
          <p className="card-soft p-3 text-sm text-foreground-muted">
            All caught up — nothing needs your attention.
          </p>
        )}
        {attentionItems.length > 0 && (
          <ul className="card-soft divide-y divide-border-soft p-3">
            {attentionItems.map((item, index) => (
              <li key={`${item.kind}-${item.applicationId}-${index}`} className="flex items-center gap-3 py-2 text-sm">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary-dark">
                  {KIND_BADGES[item.kind]}
                </span>
                <span className="min-w-0 flex-1">
                  {item.applicationId ? (
                    <>
                      <Link
                        href={`/applications/${item.applicationId}`}
                        className="font-semibold text-foreground hover:text-primary-dark hover:underline"
                      >
                        {item.company}
                      </Link>
                      <span className="text-foreground-muted"> — {item.role}</span>
                      <span className="block text-foreground-muted">{item.detail}</span>
                    </>
                  ) : (
                    <span className="font-semibold text-foreground">{item.detail}</span>
                  )}
                </span>
                {item.kind === "task" && item.taskId && <TaskActions taskId={item.taskId} title={item.detail} />}
                <span className="shrink-0 text-xs text-foreground-muted">since {item.since.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <StaleReviewPanel applications={staleApplications} />

      <section aria-labelledby="pipeline-summary" className="mb-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="pipeline-summary" className="text-sm font-bold text-primary-dark">
            Pipeline
          </h2>
          <Link href="/pipeline" className="text-sm font-medium text-primary-dark hover:underline">
            Open board →
          </Link>
        </div>
        <ul className="flex flex-wrap gap-2">
          {APPLICATION_STATUSES.map((status) => (
            <li key={status}>
              <Link href="/pipeline" className="card-soft inline-block px-3 py-1.5 text-sm hover:border-primary">
                <span className="font-semibold text-foreground">{status}</span>{" "}
                <span className="text-foreground-muted">{countByStatus.get(status) ?? 0}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="recent-activity">
        <h2 id="recent-activity" className="mb-2 text-sm font-bold text-primary-dark">
          Recent activity
        </h2>
        {activity.length === 0 ? (
          <p className="card-soft p-3 text-sm text-foreground-muted">No activity yet.</p>
        ) : (
          <ul className="card-soft divide-y divide-border-soft p-3">
            {activity.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-foreground">{entry.label}</span>
                  {entry.subject && <span className="text-foreground-muted"> — {entry.subject}</span>}
                </span>
                <span className="shrink-0 text-xs text-foreground-muted">{entry.createdAt.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

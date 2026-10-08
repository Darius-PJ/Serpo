import Link from "next/link";
import { Suspense } from "react";
import { prisma } from "@/lib/db/prisma";
import { requireUserIdForPage } from "@/lib/auth/session";
import { listStaleApplications } from "@/lib/scheduler/staleCheck";
import { listAttentionItems, type AttentionKind } from "@/lib/dashboard/attention";
import { listRecentActivity } from "@/lib/dashboard/activity";
import { StaleReviewPanel } from "@/components/StaleReviewPanel";
import { TaskQuickAdd } from "@/components/TaskQuickAdd";
import { TaskActions } from "@/components/TaskActions";
import { AutomationRetryButton } from "@/components/AutomationRetryButton";
import { APPLICATION_STATUSES } from "@/lib/applicationStatus";
import { NewApplicationForm } from "@/components/NewApplicationForm";
import { JobSearchForm } from "@/components/JobSearchForm";
import { listPipelineMetrics } from "@/lib/dashboard/metrics";

export const dynamic = "force-dynamic";

const KIND_BADGES: Record<AttentionKind, string> = {
  task: "Task",
  apply_run: "Apply run",
  automation_failed: "Automation",
  message_draft: "Draft",
  follow_up_due: "Follow-up",
  new_listings: "New listings",
};

// Search is the front door (design/decisions.md, direction A). With nothing
// tracked yet the search leads and the rest of the page waits; once there is
// something that needs attention, the queue rises above the search.
export default async function DashboardPage() {
  const userId = await requireUserIdForPage();

  // Reading the dashboard never flags, drafts, or calls an AI provider: the
  // daily stale.scan and followup.scan automation jobs do that (lib/automation).
  const [attentionItems, staleApplications, statusCounts, activity, metrics] = await Promise.all([
    listAttentionItems(userId),
    listStaleApplications(userId),
    prisma.application.groupBy({ by: ["status"], where: { userId }, _count: { _all: true } }),
    listRecentActivity(userId),
    listPipelineMetrics(userId),
  ]);
  const countByStatus = new Map(statusCounts.map((row) => [row.status, row._count._all]));
  const trackedCount = statusCounts.reduce((sum, row) => sum + row._count._all, 0);
  const allCaughtUp = attentionItems.length === 0 && staleApplications.length === 0;
  const hasTracked = trackedCount > 0;

  const attention = (
    <section aria-labelledby="needs-attention" className="card-soft mb-10 p-5 sm:p-6">
      <h2 id="needs-attention" className="mb-1 text-lg font-bold text-heading">
        Needs attention
      </h2>
      <p className="mb-3 text-base text-foreground-muted">
        Follow-ups due, drafts waiting for your review, new listings from your saved searches, and tasks you set yourself.
      </p>
      <div className="mb-3">
        <TaskQuickAdd />
      </div>
      {allCaughtUp && (
        <p className="surface-inset p-4 text-base text-foreground-muted">
          Nothing is waiting on you. When a follow-up comes due it appears here first.
        </p>
      )}
      {attentionItems.length > 0 && (
        <ul className="surface-inset divide-y divide-border-soft p-4">
          {attentionItems.map((item, index) => (
            <li key={`${item.kind}-${item.applicationId}-${index}`} className="flex flex-wrap items-center gap-2 py-2 text-base sm:gap-3">
              <span className="rounded-full border border-border-soft px-2 py-0.5 text-sm font-semibold text-foreground">
                {KIND_BADGES[item.kind]}
              </span>
              <span className="min-w-0 basis-full sm:flex-1">
                {item.applicationId ? (
                  <>
                    <Link href={`/applications/${item.applicationId}`} className="link-accent font-semibold">
                      {item.company}
                    </Link>
                    <span className="text-foreground-muted"> — {item.role}</span>
                    <span className="block text-foreground-muted">{item.detail}</span>
                  </>
                ) : item.kind === "new_listings" && item.savedSearchId ? (
                  <Link href={`/sourcing?savedSearch=${encodeURIComponent(item.savedSearchId)}`} className="link-accent font-semibold">
                    {item.detail}
                  </Link>
                ) : (
                  <span className="font-semibold text-foreground">{item.detail}</span>
                )}
              </span>
              {item.kind === "task" && item.taskId && <TaskActions taskId={item.taskId} title={item.detail} />}
              {item.kind === "automation_failed" && item.jobId && <AutomationRetryButton jobId={item.jobId} label={item.detail} />}
              <span className="shrink-0 text-sm text-foreground-muted sm:ml-auto">since {item.since.toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const search = (
    <section aria-labelledby="search-heading" className="card-soft mb-10 p-5 sm:p-6">
      <h2 id="search-heading" className="mb-1 text-lg font-bold text-heading">
        {hasTracked ? "Find the next one" : "Start with a search"}
      </h2>
      <p className="mb-3 text-base text-foreground-muted">
        {hasTracked
          ? "Search the live sources. A result you keep goes straight onto the pipeline."
          : "Type the role you want and where. Live searches contact external job sources; results you keep become local application records."}
      </p>
      <Suspense fallback={null}>
        <JobSearchForm />
      </Suspense>
      <div className="mt-4">
        <p className="mb-2 text-base text-foreground-muted">Found a role somewhere else?</p>
        <NewApplicationForm />
      </div>
    </section>
  );

  return (
    <div>
      <div className="page-heading mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-heading">Dashboard</h1>
          <p className="page-lede mb-0">
            Keep your application records on this computer: search live job sources, track applications, and follow up on time.
          </p>
        </div>
        <Link href="/sourcing" className="btn-secondary">
          Boards and AI scout
        </Link>
      </div>

      {allCaughtUp ? (
        <>
          {search}
          {attention}
        </>
      ) : (
        <>
          {attention}
          {search}
        </>
      )}

      <StaleReviewPanel applications={staleApplications} />

      <section aria-labelledby="pipeline-summary" className="card-soft mb-10 p-5 sm:p-6">
        <div className="mb-1 flex items-center justify-between">
          <h2 id="pipeline-summary" className="text-lg font-bold text-heading">
            Pipeline
          </h2>
          <Link href="/pipeline" className="link-accent">
            Open board
          </Link>
        </div>
        <p className="mb-3 text-base text-foreground-muted">
          {hasTracked
            ? `${trackedCount} ${trackedCount === 1 ? "application" : "applications"} by stage.`
            : "Your applications will sit here by stage once you keep a result or add one by hand."}
        </p>
        <ul className="surface-inset flex flex-wrap gap-2 p-3">
          {APPLICATION_STATUSES.map((status) => (
            <li key={status}>
              <Link href="/pipeline" className="card-soft inline-block px-3 py-1.5 text-base hover:border-foreground-muted">
                <span className="font-semibold text-foreground">{status}</span>{" "}
                <span className="text-foreground-muted">{countByStatus.get(status) ?? 0}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {hasTracked && (
        <section aria-labelledby="pipeline-metrics" className="mb-10">
          <h2 id="pipeline-metrics" className="mb-1 text-lg font-bold text-heading">
            Pipeline metrics
          </h2>
          <p className="mb-3 text-base text-foreground-muted">How the search is going, counted from your own pipeline.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(metrics.funnel).map(([label, value]) => (
              <div key={label} className="card-soft p-4">
                <div className="text-2xl font-extrabold text-foreground">{value}</div>
                <div className="text-sm capitalize text-foreground-muted">{label}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 grid gap-2 text-base sm:grid-cols-4">
            <div className="card-soft p-4"><strong>{metrics.submissionRate}%</strong><span className="block text-sm text-foreground-muted">tracked → submitted</span></div>
            <div className="card-soft p-4"><strong>{metrics.interviewRate}%</strong><span className="block text-sm text-foreground-muted">submitted → interviewed</span></div>
            <div className="card-soft p-4"><strong>{metrics.medianCurrentStageDays} days</strong><span className="block text-sm text-foreground-muted">median current stage</span></div>
            <div className="card-soft p-4"><strong>{metrics.weeklyStatusChanges}</strong><span className="block text-sm text-foreground-muted">stage moves this week</span></div>
          </div>
          {metrics.sources.length > 0 && (
            <div className="card-soft mt-2 overflow-x-auto p-4">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="text-foreground-muted"><tr><th className="pb-2">Source</th><th>Applications</th><th>Interviews</th><th>Interview rate</th></tr></thead>
                <tbody>
                  {metrics.sources.slice(0, 5).map((source) => (
                    <tr key={source.source} className="border-t border-border-soft">
                      <td className="py-2 font-medium text-foreground">{source.source}</td><td>{source.applications}</td><td>{source.interviews}</td><td>{source.interviewRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {hasTracked && (
        <section aria-labelledby="recent-activity" className="mb-10">
          <h2 id="recent-activity" className="mb-3 text-lg font-bold text-heading">
            Recent activity
          </h2>
          {activity.length === 0 ? (
            <p className="card-soft p-4 text-base text-foreground-muted">No activity yet.</p>
          ) : (
            <ul className="card-soft divide-y divide-border-soft p-4">
              {activity.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-2 text-base">
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-foreground">{entry.label}</span>
                    {entry.subject && <span className="text-foreground-muted"> — {entry.subject}</span>}
                  </span>
                  <span className="shrink-0 text-sm text-foreground-muted">{entry.createdAt.toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <footer className="border-t border-border-soft pt-4 text-sm text-foreground-muted">
        <p>
          Records are stored locally; live searches and enabled AI/contact research can send data to external providers,
          including in the background.{" "}
          <Link href="/privacy" className="link-accent">Privacy and data use</Link> explains storage, automation and deletion limits.
        </p>
      </footer>
    </div>
  );
}
